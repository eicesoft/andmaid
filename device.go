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
	StartedAt time.Time `json:"startedAt"`
	cmd       *exec.Cmd
	cancel    context.CancelFunc
}

var (
	adbMu        sync.Mutex
	screenMu     sync.Mutex
	scrcpyProcs  = make(map[string]*ScrcpyProcess)
	binDir       string
)

func init() {
	if exe, err := os.Executable(); err == nil {
		binDir = filepath.Dir(exe)
	}
}

// runAdb 执行 adb 命令返回合并输出
func (a *App) runAdb(args ...string) (string, error) {
	ctx, cancel := context.WithTimeout(a.ctx, 10*time.Second)
	defer cancel()
	out, err := exec.CommandContext(ctx, a.adbPath(), args...).CombinedOutput()
	return string(out), err
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

// OpenScreen 打开指定设备的 scrcpy 投屏窗口
func (a *App) OpenScreen(serial string) error {
	screenMu.Lock()
	defer screenMu.Unlock()

	if p, ok := scrcpyProcs[serial]; ok {
		if p.cmd.ProcessState == nil {
			return fmt.Errorf("设备 %s 投屏已在运行", serial)
		}
		delete(scrcpyProcs, serial)
	}

	scrcpy, err := a.scrcpyPath()
	if err != nil {
		return err
	}

	ctx, cancel := context.WithCancel(a.ctx)
	args := []string{"-s", serial}
	settings, err := LoadSettings()
	if err != nil {
		cancel()
		return fmt.Errorf("读取设置失败: %v", err)
	}
	args = append(args, settings.BuildArgs()...)
	if title := argsWindowTitle(settings); title != "" {
		// 已由 --window-title 参数提供
	} else {
		args = append(args, "--window-title", serial)
	}
	cmd := exec.CommandContext(ctx, scrcpy, args...)
	if err := cmd.Start(); err != nil {
		cancel()
		return fmt.Errorf("scrcpy 启动失败: %v", err)
	}

	proc := &ScrcpyProcess{Serial: serial, StartedAt: time.Now(), cmd: cmd, cancel: cancel}
	scrcpyProcs[serial] = proc

	go func() {
		_ = cmd.Wait()
		deleted := false
		screenMu.Lock()
		if cur, ok := scrcpyProcs[serial]; ok && cur == proc {
			delete(scrcpyProcs, serial)
			deleted = true
		}
		screenMu.Unlock()
		if deleted {
			runtime.EventsEmit(a.ctx, "screen:exited", serial)
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

// CloseScreen 关闭指定设备的投屏
func (a *App) CloseScreen(serial string) error {
	screenMu.Lock()
	defer screenMu.Unlock()

	p, ok := scrcpyProcs[serial]
	if !ok {
		return fmt.Errorf("设备 %s 没有运行中的投屏", serial)
	}
	p.cancel()
	delete(scrcpyProcs, serial)
	return nil
}

// ScreenStatus 返回各设备投屏运行状态
func (a *App) ScreenStatus() map[string]bool {
	screenMu.Lock()
	defer screenMu.Unlock()
	m := make(map[string]bool)
	for s := range scrcpyProcs {
		m[s] = true
	}
	return m
}
