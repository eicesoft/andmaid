// Package device 设备管理：adb 设备枚举、应用/编码器查询、scrcpy 投屏进程生命周期。
package device

import (
	"context"
	"fmt"
	"os/exec"
	"strings"
	"sync"
	"time"

	"andmaid/internal/adb"
	"andmaid/internal/settings"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// Device 一台通过 adb 可见的设备
type Device struct {
	Serial string `json:"serial"`
	State  string `json:"state"`
	Model  string `json:"model"`
}

// ScrcpyProcess 一个 scrcpy 投屏会话
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
	Codec    string `json:"codec"` // --video-codec，如 h264
	Name     string `json:"name"`  // --video-encoder，MediaCodec 编码器名
	Hardware bool   `json:"hardware"`
	Alias    bool   `json:"alias"` // 是否为别名行（指向同名真实编码器）
}

// Manager 管理设备查询与 scrcpy 投屏进程。Wails 绑定后方法直接暴露给前端。
type Manager struct {
	ctx      context.Context // nil 时输出走 Background
	adbMu    sync.Mutex
	screenMu sync.Mutex
	procs    map[string]*ScrcpyProcess // key: sessionID
	seq      int
}

// NewManager 创建设备管理器。Startup 后调用 SetContext。
func NewManager() *Manager {
	return &Manager{procs: make(map[string]*ScrcpyProcess)}
}

// SetContext 注入 Wails runtime context（EventsEmit 用）
func (m *Manager) SetContext(ctx context.Context) { m.ctx = ctx }

func (m *Manager) emit(event string, data ...interface{}) {
	if m.ctx != nil {
		runtime.EventsEmit(m.ctx, event, data...)
	}
}

// runAdb 执行 adb 命令返回合并输出
func (m *Manager) runAdb(args ...string) (string, error) {
	return adb.Exec(args...)
}

// runAdbTimeout 同 runAdb，自定义超时
func (m *Manager) runAdbTimeout(timeout time.Duration, args ...string) (string, error) {
	return adb.ExecTimeout(timeout, args...)
}

// ListDevices 返回通过 adb 看到的设备列表
func (m *Manager) ListDevices() ([]Device, error) {
	m.adbMu.Lock()
	defer m.adbMu.Unlock()

	out, err := m.runAdb("devices", "-l")
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
func (m *Manager) OpenScreen(serial string) error {
	return m.startScrcpy(serial, nil, "", true)
}

// OpenAppScreen 打开投屏并启动指定应用（scrcpy --start-app=<pkg>）。
// 每次调用新开一个投屏窗口；配合 --new-display 虚拟显示器，同设备同应用可多开。
func (m *Manager) OpenAppScreen(serial string, pkg string) error {
	pkg = strings.TrimSpace(pkg)
	if pkg == "" {
		return fmt.Errorf("应用包名不能为空")
	}
	return m.startScrcpy(serial, []string{"--start-app=" + pkg}, pkg, false)
}

// OpenAppScreenOnMain 同 OpenAppScreen，但镜像主屏（不加 --new-display）。
// Agent 用：input tap / uiautomator dump 只作用于主屏，虚拟屏应用不可见。
func (m *Manager) OpenAppScreenOnMain(serial string, pkg string) error {
	pkg = strings.TrimSpace(pkg)
	if pkg == "" {
		return fmt.Errorf("应用包名不能为空")
	}
	return m.startScrcpyMain(serial, []string{"--start-app=" + pkg}, pkg, false)
}

// startScrcpy 启动 scrcpy 投屏；extra 为附加参数（如 --start-app）。
// exclusive=true：同设备已有运行中的投屏则报错（普通投屏）；false：多开新会话。
// noVirtualDisplay=true：跳过 --new-display 自动注入，镜像主屏（Agent 用）。
func (m *Manager) startScrcpy(serial string, extra []string, lockedPkg string, exclusive bool) error {
	return m.startScrcpyOpts(serial, extra, lockedPkg, exclusive, false)
}

func (m *Manager) startScrcpyMain(serial string, extra []string, lockedPkg string, exclusive bool) error {
	return m.startScrcpyOpts(serial, extra, lockedPkg, exclusive, true)
}

func (m *Manager) startScrcpyOpts(serial string, extra []string, lockedPkg string, exclusive bool, noVirtualDisplay bool) error {
	m.screenMu.Lock()
	defer m.screenMu.Unlock()

	if exclusive {
		for _, p := range m.procs {
			if p.Serial == serial && p.cmd.ProcessState == nil {
				return fmt.Errorf("设备 %s 投屏已在运行", serial)
			}
		}
	}

	scrcpy, err := adb.ScrcpyPath()
	if err != nil {
		return err
	}
	// scrcpy 内部会执行 adb start-server，先预启避免多进程竞态
	if err := adb.EnsureServer(); err != nil {
		return err
	}

	ctx, cancel := context.WithCancel(m.ctx)
	m.seq++
	sessionID := fmt.Sprintf("%s#%d", serial, m.seq)
	args := []string{"-s", serial}
	settings, err := settings.Load()
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
	m.procs[sessionID] = proc

	go func() {
		_ = cmd.Wait()
		deleted := false
		m.screenMu.Lock()
		if cur, ok := m.procs[sessionID]; ok && cur == proc {
			delete(m.procs, sessionID)
			deleted = true
		}
		m.screenMu.Unlock()
		if deleted {
			m.emit("screen:exited", sessionID)
		}
	}()

	return nil
}

func argsWindowTitle(s *settings.ScrcpySettings) string {
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
func (m *Manager) CloseScreen(sessionID string) error {
	m.screenMu.Lock()
	defer m.screenMu.Unlock()

	p, ok := m.procs[sessionID]
	if !ok {
		return fmt.Errorf("投屏 %s 没有在运行", sessionID)
	}
	p.cancel()
	delete(m.procs, sessionID)
	return nil
}

// ScreenStatus 返回各投屏会话运行状态（key: sessionID，形如 serial#n）
func (m *Manager) ScreenStatus() map[string]bool {
	m.screenMu.Lock()
	defer m.screenMu.Unlock()
	status := make(map[string]bool)
	for s := range m.procs {
		status[s] = true
	}
	return status
}

// ListApps 列出设备上已安装应用（scrcpy --list-apps）
func (m *Manager) ListApps(serial string) ([]AndroidApp, error) {
	scrcpy, err := adb.ScrcpyPath()
	if err != nil {
		return nil, err
	}
	// scrcpy 内部会执行 adb start-server，先预启避免多进程竞态
	if err := adb.EnsureServer(); err != nil {
		return nil, err
	}

	// 列应用可能较慢，给更长超时
	run := func() (string, error) {
		ctx, cancel := context.WithTimeout(m.ctx, 60*time.Second)
		defer cancel()
		out, err := exec.CommandContext(ctx, scrcpy, "--list-apps", "-s", serial).CombinedOutput()
		return string(out), err
	}
	out, err := run()
	if err != nil && adb.IsDaemonError(out) {
		adb.InvalidateServer()
		if err2 := adb.EnsureServer(); err2 == nil {
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
func (m *Manager) ListEncoders(serial string, codec string) ([]VideoEncoder, error) {
	scrcpy, err := adb.ScrcpyPath()
	if err != nil {
		return nil, err
	}
	// scrcpy 内部会执行 adb start-server，先预启避免多进程竞态
	if err := adb.EnsureServer(); err != nil {
		return nil, err
	}

	args := []string{"--list-encoders", "-s", serial}
	if c := strings.TrimSpace(codec); c != "" {
		args = append(args, "--video-codec="+c)
	}

	run := func() (string, error) {
		ctx, cancel := context.WithTimeout(m.ctx, 60*time.Second)
		defer cancel()
		out, err := exec.CommandContext(ctx, scrcpy, args...).CombinedOutput()
		return string(out), err
	}
	out, err := run()
	if err != nil && adb.IsDaemonError(out) {
		adb.InvalidateServer()
		if err2 := adb.EnsureServer(); err2 == nil {
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
