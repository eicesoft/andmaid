//go:build !windows

package main

import (
	"context"
	"fmt"
	"os/exec"
	"runtime"
	"time"

	wruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// 非 Windows 实现（macOS/Linux）：
// 系统不允许跨进程重设窗口父子关系（无 SetParent 等价物），
// 无法把 scrcpy 窗口真正嵌进 Andmaid 窗口。
// 降级方案：scrcpy 以独立窗口投屏，Andmaid 内嵌窗口只提供工具栏
// （返回/主页/音量等按键经 adb 注入到设备，对独立窗口同样有效）。

// EmbedScreen 启动内嵌投屏（降级）：直接开 scrcpy 独立窗口，
// 宿主窗口保持前端传入的尺寸，显示工具栏。
func (a *App) EmbedScreen(serial string, hostTitle string, x, y, w, h int, toolbarW int) error {
	embedMu.Lock()
	defer embedMu.Unlock()

	if p, ok := embedProcs[serial]; ok {
		if p.cmd.ProcessState == nil {
			return fmt.Errorf("设备 %s 内嵌投屏已在运行", serial)
		}
		delete(embedProcs, serial)
	}

	scrcpy, err := a.scrcpyPath()
	if err != nil {
		return err
	}

	settings, err := LoadSettings()
	if err != nil {
		return fmt.Errorf("读取设置失败: %v", err)
	}

	aspect, _ := a.deviceAspect(serial)
	fw, fh := fitToArea(aspect, 480, 800)
	if w > 0 && h > 0 {
		fw, fh = fitToArea(aspect, w, h)
		if fw < 300 {
			fw, fh = fitToArea(aspect, 300, 100000)
		}
	}

	ctx, cancel := context.WithCancel(a.ctx)
	args := []string{
		"-s", serial,
		"--window-title", "Andmaid 投屏 - " + serial,
		"--window-width", fmt.Sprint(fw),
		"--window-height", fmt.Sprint(fh),
	}
	args = append(args, settings.BuildArgs(true)...)
	cmd := exec.CommandContext(ctx, scrcpy, args...)
	if err := cmd.Start(); err != nil {
		cancel()
		return fmt.Errorf("scrcpy 启动失败: %v", err)
	}

	embedProcs[serial] = &EmbedProcess{Serial: serial, StartedAt: time.Now(), cmd: cmd, cancel: cancel, aspect: aspect, toolbarW: toolbarW}

	go func() {
		_ = cmd.Wait()
		deleted := false
		embedMu.Lock()
		if cur, ok := embedProcs[serial]; ok && cur.cmd == cmd {
			delete(embedProcs, serial)
			deleted = true
		}
		embedMu.Unlock()
		if deleted {
			wruntime.EventsEmit(a.ctx, "embed:exited", serial)
		}
	}()

	return nil
}

// ResizeEmbed 非 Windows 无子窗口可同步，工具栏窗口布局由前端自管，空实现。
func (a *App) ResizeEmbed(serial string, x, y, w, h int, toolbarW int) error {
	embedMu.Lock()
	_, ok := embedProcs[serial]
	embedMu.Unlock()
	if !ok {
		return fmt.Errorf("设备 %s 没有内嵌投屏", serial)
	}
	return nil
}

// CloseEmbed 关闭内嵌投屏
func (a *App) CloseEmbed(serial string) error {
	embedMu.Lock()
	defer embedMu.Unlock()

	p, ok := embedProcs[serial]
	if !ok {
		return fmt.Errorf("设备 %s 没有运行中的内嵌投屏", serial)
	}
	p.cancel()
	delete(embedProcs, serial)
	return nil
}

// EmbedStatus 返回内嵌投屏运行状态。
// 非 Windows 没有跨进程互斥体，只报本进程会话（工具栏窗口各自独立）。
func (a *App) EmbedStatus() map[string]bool {
	embedMu.Lock()
	defer embedMu.Unlock()
	m := make(map[string]bool)
	for s := range embedProcs {
		m[s] = true
	}
	return m
}

// platformEmbedHint 前端提示用：说明当前平台内嵌投屏形态
func platformEmbedHint() string {
	if runtime.GOOS == "darwin" {
		return "macOS 不支持窗口嵌入，投屏显示在独立窗口，本窗口提供控制工具栏"
	}
	return "Linux 不支持窗口嵌入，投屏显示在独立窗口，本窗口提供控制工具栏"
}
