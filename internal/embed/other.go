//go:build !windows

package embed

import (
	"andmaid/internal/adb"
	"andmaid/internal/settings"

	"context"
	"fmt"
	"os/exec"
	"runtime"
	"time"
)

// 非 Windows 实现（macOS/Linux）：
// 系统不允许跨进程重设窗口父子关系（无 SetParent 等价物），
// 无法把 scrcpy 窗口真正嵌进 Andmaid 窗口。
// 降级方案：scrcpy 以独立窗口投屏，Andmaid 内嵌窗口只提供工具栏
// （返回/主页/音量等按键经 adb 注入到设备，对独立窗口同样有效）。

// EmbedScreen 启动内嵌投屏（降级）：直接开 scrcpy 独立窗口，
// 宿主窗口保持前端传入的尺寸，显示工具栏。
func (m *Manager) EmbedScreen(serial string, hostTitle string, x, y, w, h int, toolbarW int) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if p, ok := m.procs[serial]; ok {
		if p.cmd.ProcessState == nil {
			return fmt.Errorf("设备 %s 内嵌投屏已在运行", serial)
		}
		delete(m.procs, serial)
	}

	scrcpy, err := adb.ScrcpyPath()
	if err != nil {
		return err
	}
	// scrcpy 内部会执行 adb start-server，先预启避免多进程竞态
	if err := adb.EnsureServer(); err != nil {
		return err
	}

	scfg, err := settings.Load()
	if err != nil {
		return fmt.Errorf("读取设置失败: %v", err)
	}

	aspect, _ := m.deviceAspect(serial)
	fw, fh := fitToArea(aspect, 480, 800)
	if w > 0 && h > 0 {
		fw, fh = fitToArea(aspect, w, h)
		if fw < 300 {
			fw, fh = fitToArea(aspect, 300, 100000)
		}
	}

	ctx, cancel := context.WithCancel(m.ctx)
	args := []string{
		"-s", serial,
		"--window-title", "Andmaid 投屏 - " + serial,
		"--window-width", fmt.Sprint(fw),
		"--window-height", fmt.Sprint(fh),
	}
	args = append(args, scfg.BuildArgs(true)...)
	cmd := exec.CommandContext(ctx, scrcpy, args...)
	if err := cmd.Start(); err != nil {
		cancel()
		return fmt.Errorf("scrcpy 启动失败: %v", err)
	}

	m.procs[serial] = &EmbedProcess{Serial: serial, StartedAt: time.Now(), cmd: cmd, cancel: cancel, aspect: aspect, toolbarW: toolbarW}

	go func() {
		_ = cmd.Wait()
		deleted := false
		m.mu.Lock()
		if cur, ok := m.procs[serial]; ok && cur.cmd == cmd {
			delete(m.procs, serial)
			deleted = true
		}
		m.mu.Unlock()
		if deleted {
			m.emit("embed:exited", serial)
		}
	}()

	return nil
}

// ResizeEmbed 非 Windows 无子窗口可同步，工具栏窗口布局由前端自管，空实现。
func (m *Manager) ResizeEmbed(serial string, x, y, w, h int, toolbarW int) error {
	m.mu.Lock()
	_, ok := m.procs[serial]
	m.mu.Unlock()
	if !ok {
		return fmt.Errorf("设备 %s 没有内嵌投屏", serial)
	}
	return nil
}

// EmbedFlashBehind 非 Windows 投屏是独立窗口，HTML 弹层不会被遮挡，空实现。
func (m *Manager) EmbedFlashBehind(serial string) error {
	m.mu.Lock()
	_, ok := m.procs[serial]
	m.mu.Unlock()
	if !ok {
		return fmt.Errorf("设备 %s 没有内嵌投屏", serial)
	}
	return nil
}

// EmbedFlashRestore 非 Windows 空实现。
func (m *Manager) EmbedFlashRestore(serial string) error {
	return nil
}

// CloseEmbed 关闭内嵌投屏
func (m *Manager) CloseEmbed(serial string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	p, ok := m.procs[serial]
	if !ok {
		return fmt.Errorf("设备 %s 没有运行中的内嵌投屏", serial)
	}
	p.cancel()
	delete(m.procs, serial)
	return nil
}

// EmbedStatus 返回内嵌投屏运行状态。
// 非 Windows 没有跨进程互斥体，只报本进程会话（工具栏窗口各自独立）。
func (m *Manager) EmbedStatus() map[string]bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := make(map[string]bool)
	for s := range m.procs {
		out[s] = true
	}
	return out
}

// platformEmbedHint 前端提示用：说明当前平台内嵌投屏形态
func platformEmbedHint() string {
	if runtime.GOOS == "darwin" {
		return "macOS 不支持窗口嵌入，投屏显示在独立窗口，本窗口提供控制工具栏"
	}
	return "Linux 不支持窗口嵌入，投屏显示在独立窗口，本窗口提供控制工具栏"
}
