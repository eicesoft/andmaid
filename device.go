package main

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

type Device struct {
	Serial string `json:"serial"`
	State  string `json:"state"`
	Model  string `json:"model"`
}

type ScrcpyProcess struct {
	Serial    string    `json:"serial"`
	SessionID string    `json:"sessionId"` // 会话唯一 ID（serial#n），支持同设备多开
	StartedAt time.Time `json:"startedAt"`
	LockedPkg string    `json:"lockedPkg,omitempty"` // 应用模式投屏锁定的包名
	cmd       *exec.Cmd
	cancel    context.CancelFunc
}

// AndroidApp 设备上已安装的一个应用
type AndroidApp struct {
	Name    string `json:"name"`
	Package string `json:"package"`
	System  bool   `json:"system"`
}

// VideoEncoder 设备上可用的一个视频编码器（scrcpy --list-encoders）
type VideoEncoder struct {
	Codec   string `json:"codec"`   // --video-codec，如 h264
	Name    string `json:"name"`    // --video-encoder，MediaCodec 编码器名
	Hardware bool  `json:"hardware"`
	Alias   bool   `json:"alias"`   // 是否为别名行（指向同名真实编码器）
}

var (
	adbMu         sync.Mutex
	screenMu      sync.Mutex
	scrcpyProcs   = make(map[string]*ScrcpyProcess) // key: sessionID
	sessionSeq    = 0
	binDir        string
)

func init() {
	if exe, err := os.Executable(); err == nil {
		binDir = filepath.Dir(exe)
	}
}

// runAdb 执行 adb 命令返回合并输出
// 先确保 adb server 就绪（避免与 scrcpy 内部的 adb start-server 竞态），
// daemon 级错误自动重启 server 并重试一次
func (a *App) runAdb(args ...string) (string, error) {
	return a.runAdbTimeout(10*time.Second, args...)
}

// runAdbTimeout 同 runAdb，自定义超时
func (a *App) runAdbTimeout(timeout time.Duration, args ...string) (string, error) {
	if err := a.ensureAdbServer(); err != nil {
		return "", err
	}
	out, err := a.execAdbTimeout(timeout, args...)
	if err != nil && isAdbDaemonError(out) {
		invalidateAdbServer()
		if err2 := a.ensureAdbServer(); err2 != nil {
			return out, err
		}
		out, err = a.execAdbTimeout(timeout, args...)
	}
	return out, err
}

// ListDevices 返回通过 adb 看到的设备列表
func (a *App) ListDevices() ([]Device, error) {
	adbMu.Lock()
	defer adbMu.Unlock()

	out, err := a.runAdb("devices", "-l")
	if err != nil {
		return nil, fmt.Errorf("adb 执行失败: %v\n%s", err, out)
	}

	var devices []Device
	for _, line := range strings.Split(out, "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "List of devices") {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) < 2 {
			continue
		}
		d := Device{Serial: fields[0], State: fields[1]}
		for _, f := range fields[2:] {
			if strings.HasPrefix(f, "model:") {
				d.Model = strings.TrimPrefix(f, "model:")
			}
		}
		devices = append(devices, d)
	}
	return devices, nil
}

// OpenScreen 打开指定设备的 scrcpy 投屏窗口（同设备仅一个普通投屏，重复点击报错）
func (a *App) OpenScreen(serial string) error {
	return a.startScrcpy(serial, nil, "", true)
}

// OpenAppScreen 打开投屏并启动指定应用（scrcpy --start-app=<pkg>）。
// 每次调用新开一个投屏窗口；配合 --new-display 虚拟显示器，同设备同应用可多开。
func (a *App) OpenAppScreen(serial string, pkg string) error {
	pkg = strings.TrimSpace(pkg)
	if pkg == "" {
		return fmt.Errorf("应用包名不能为空")
	}
	return a.startScrcpy(serial, []string{"--start-app=" + pkg}, pkg, false)
}

// OpenAppScreenOnMain 同 OpenAppScreen，但镜像主屏（不加 --new-display）。
// Agent 用：input tap / uiautomator dump 只作用于主屏，虚拟屏应用不可见。
func (a *App) OpenAppScreenOnMain(serial string, pkg string) error {
	pkg = strings.TrimSpace(pkg)
	if pkg == "" {
		return fmt.Errorf("应用包名不能为空")
	}
	return a.startScrcpyMain(serial, []string{"--start-app=" + pkg}, pkg, false)
}

// startScrcpy 启动 scrcpy 投屏；extra 为附加参数（如 --start-app）。
// exclusive=true：同设备已有运行中的投屏则报错（普通投屏）；false：多开新会话。
// noVirtualDisplay=true：跳过 --new-display 自动注入，镜像主屏（Agent 用）。
func (a *App) startScrcpy(serial string, extra []string, lockedPkg string, exclusive bool) error {
	return a.startScrcpyOpts(serial, extra, lockedPkg, exclusive, false)
}

func (a *App) startScrcpyMain(serial string, extra []string, lockedPkg string, exclusive bool) error {
	return a.startScrcpyOpts(serial, extra, lockedPkg, exclusive, true)
}

func (a *App) startScrcpyOpts(serial string, extra []string, lockedPkg string, exclusive bool, noVirtualDisplay bool) error {
	screenMu.Lock()
	defer screenMu.Unlock()

	if exclusive {
		for _, p := range scrcpyProcs {
			if p.Serial == serial && p.cmd.ProcessState == nil {
				return fmt.Errorf("设备 %s 投屏已在运行", serial)
			}
		}
	}

	scrcpy, err := a.scrcpyPath()
	if err != nil {
		return err
	}
	// scrcpy 内部会执行 adb start-server，先预启避免多进程竞态
	if err := a.ensureAdbServer(); err != nil {
		return err
	}

	ctx, cancel := context.WithCancel(a.ctx)
	sessionSeq++
	sessionID := fmt.Sprintf("%s#%d", serial, sessionSeq)
	args := []string{"-s", serial}
	settings, err := LoadSettings()
	if err != nil {
		cancel()
		return fmt.Errorf("读取设置失败: %v", err)
	}
	args = append(args, settings.BuildArgs()...)
	args = append(args, extra...)
	// 应用多开：设置未指定 --new-display / --display-id 时自动加虚拟显示器，
	// 否则多个会话共用主屏画面，同应用多开无意义。
	// Agent 场景（noVirtualDisplay）跳过：注入/dump 只作用于主屏。
	if lockedPkg != "" && !noVirtualDisplay && !hasAnyArg(args, "--new-display", "--display-id") {
		args = append(args, "--new-display")
	}
	if title := argsWindowTitle(settings); title != "" && lockedPkg == "" {
		// 普通投屏尊重自定义标题；应用多开强制 sessionID 标题区分窗口
	} else if lockedPkg != "" {
		args = append(args, "--window-title", sessionID+"（"+lockedPkg+"）")
	} else {
		args = append(args, "--window-title", sessionID)
	}
	cmd := exec.CommandContext(ctx, scrcpy, args...)
	if err := cmd.Start(); err != nil {
		cancel()
		return fmt.Errorf("scrcpy 启动失败: %v", err)
	}

	proc := &ScrcpyProcess{Serial: serial, SessionID: sessionID, StartedAt: time.Now(), LockedPkg: lockedPkg, cmd: cmd, cancel: cancel}
	scrcpyProcs[sessionID] = proc

	go func() {
		_ = cmd.Wait()
		deleted := false
		screenMu.Lock()
		if cur, ok := scrcpyProcs[sessionID]; ok && cur == proc {
			delete(scrcpyProcs, sessionID)
			deleted = true
		}
		screenMu.Unlock()
		if deleted {
			runtime.EventsEmit(a.ctx, "screen:exited", sessionID)
		}
	}()

	return nil
}

func argsWindowTitle(s *ScrcpySettings) string {
	if s.WindowTitle != nil && strings.TrimSpace(*s.WindowTitle) != "" {
		return strings.TrimSpace(*s.WindowTitle)
	}
	return ""
}

// hasAnyArg 参数列表是否已含指定 flag（--flag 或 --flag=value）
func hasAnyArg(args []string, flags ...string) bool {
	for _, a := range args {
		name := a
		if i := strings.IndexByte(a, '='); i >= 0 {
			name = a[:i]
		}
		for _, f := range flags {
			if name == f {
				return true
			}
		}
	}
	return false
}

// CloseScreen 关闭指定会话的投屏（sessionID 形如 serial#n）
func (a *App) CloseScreen(sessionID string) error {
	screenMu.Lock()
	defer screenMu.Unlock()

	p, ok := scrcpyProcs[sessionID]
	if !ok {
		return fmt.Errorf("投屏 %s 没有在运行", sessionID)
	}
	p.cancel()
	delete(scrcpyProcs, sessionID)
	return nil
}

// ScreenStatus 返回各投屏会话运行状态（key: sessionID，形如 serial#n）
func (a *App) ScreenStatus() map[string]bool {
	screenMu.Lock()
	defer screenMu.Unlock()
	m := make(map[string]bool)
	for s := range scrcpyProcs {
		m[s] = true
	}
	return m
}

// ListApps 列出设备上已安装应用（scrcpy --list-apps）
func (a *App) ListApps(serial string) ([]AndroidApp, error) {
	scrcpy, err := a.scrcpyPath()
	if err != nil {
		return nil, err
	}
	// scrcpy 内部会执行 adb start-server，先预启避免多进程竞态
	if err := a.ensureAdbServer(); err != nil {
		return nil, err
	}

	// 列应用可能较慢，给更长超时
	run := func() (string, error) {
		ctx, cancel := context.WithTimeout(a.ctx, 60*time.Second)
		defer cancel()
		out, err := exec.CommandContext(ctx, scrcpy, "--list-apps", "-s", serial).CombinedOutput()
		return string(out), err
	}
	out, err := run()
	if err != nil && isAdbDaemonError(out) {
		invalidateAdbServer()
		if err2 := a.ensureAdbServer(); err2 == nil {
			out, err = run()
		}
	}
	if err != nil {
		return nil, fmt.Errorf("获取应用列表失败: %v\n%s", err, out)
	}

	var apps []AndroidApp
	for _, line := range strings.Split(string(out), "\n") {
		line = strings.TrimRight(line, "\r")
		// 格式: " * 名称<空白>包名" 或 " - 名称<空白>包名"
		if !strings.HasPrefix(line, " * ") && !strings.HasPrefix(line, " - ") {
			continue
		}
		system := line[1] == '*'
		body := line[3:]
		idx := strings.LastIndexAny(body, " \t")
		if idx <= 0 {
			continue
		}
		name := strings.TrimSpace(body[:idx])
		pkg := strings.TrimSpace(body[idx+1:])
		if name == "" || pkg == "" {
			continue
		}
		apps = append(apps, AndroidApp{Name: name, Package: pkg, System: system})
	}
	if apps == nil {
		return nil, fmt.Errorf("设备 %s 未列出任何应用", serial)
	}
	return apps, nil
}

// ListEncoders 列出设备可用的视频编码器（scrcpy --list-encoders）。
// 传 codec 时先加 --video-codec 让 scrcpy 只列该编码对应的编码器。
func (a *App) ListEncoders(serial string, codec string) ([]VideoEncoder, error) {
	scrcpy, err := a.scrcpyPath()
	if err != nil {
		return nil, err
	}
	// scrcpy 内部会执行 adb start-server，先预启避免多进程竞态
	if err := a.ensureAdbServer(); err != nil {
		return nil, err
	}

	args := []string{"--list-encoders", "-s", serial}
	if c := strings.TrimSpace(codec); c != "" {
		args = append(args, "--video-codec="+c)
	}

	run := func() (string, error) {
		ctx, cancel := context.WithTimeout(a.ctx, 60*time.Second)
		defer cancel()
		out, err := exec.CommandContext(ctx, scrcpy, args...).CombinedOutput()
		return string(out), err
	}
	out, err := run()
	if err != nil && isAdbDaemonError(out) {
		invalidateAdbServer()
		if err2 := a.ensureAdbServer(); err2 == nil {
			out, err = run()
		}
	}
	if err != nil {
		return nil, fmt.Errorf("获取编码器列表失败: %v\n%s", err, out)
	}

	var encoders []VideoEncoder
	for _, line := range strings.Split(out, "\n") {
		line = strings.TrimSpace(strings.TrimRight(line, "\r"))
		idx := strings.Index(line, "--video-codec=")
		if idx < 0 {
			continue
		}
		line = line[idx:]
		fields := strings.Fields(line)
		var e VideoEncoder
		for _, f := range fields {
			switch {
			case strings.HasPrefix(f, "--video-codec="):
				e.Codec = strings.TrimPrefix(f, "--video-codec=")
			case strings.HasPrefix(f, "--video-encoder="):
				e.Name = strings.TrimPrefix(f, "--video-encoder=")
			case f == "(hw)":
				e.Hardware = true
			case strings.HasPrefix(f, "(alias"):
				e.Alias = true
			}
		}
		if e.Codec != "" && e.Name != "" {
			encoders = append(encoders, e)
		}
	}
	if encoders == nil {
		return nil, fmt.Errorf("设备 %s 未列出视频编码器（设备未连接或 scrcpy 版本过旧）", serial)
	}
	return encoders, nil
}
