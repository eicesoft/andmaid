package embed

import (
	"andmaid/internal/adb"
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

// ===== 平台无关的内嵌投屏逻辑 =====
// Windows：完整实现（scrcpy 窗口 SetParent 嵌入宿主），见 windows.go。
// 其他平台（macOS/Linux）：系统不允许跨进程重设窗口父子关系，
// 降级为「scrcpy 独立窗口 + Andmaid 工具栏窗口」，见 other.go。

// EmbedProcess 一个内嵌投屏会话
type EmbedProcess struct {
	Serial    string    `json:"serial"`
	StartedAt time.Time `json:"startedAt"`
	cmd       *exec.Cmd
	cancel    context.CancelFunc
	aspect    float64 // 设备宽高比缓存
	toolbarW  int     // 前端工具栏宽度（CSS px）
}

// log 内嵌诊断日志（排障用，查系统临时目录 andmaid-embed.log）
func log(format string, a ...interface{}) {
	f, err := os.OpenFile(filepath.Join(os.TempDir(), "andmaid-embed.log"), os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
	if err != nil {
		return
	}
	defer f.Close()
	fmt.Fprintf(f, "[%s] %s\n", time.Now().Format("15:04:05.000"), fmt.Sprintf(format, a...))
}

// deviceAspect 获取设备屏幕宽高比（w/h）。失败时返回 0，调用方回退铺满。
func (m *Manager) deviceAspect(serial string) (float64, error) {
	out, err := adb.Exec("-s", serial, "shell", "wm", "size")
	if err != nil {
		return 0, fmt.Errorf("%v\n%s", err, out)
	}
	// "Physical size: 1440x3168" 或含 Override 行
	for _, line := range strings.Split(out, "\n") {
		line = strings.TrimSpace(line)
		if !strings.HasPrefix(line, "Physical size:") && !strings.HasPrefix(line, "Override size:") {
			continue
		}
		part := strings.TrimPrefix(line, "Physical size:")
		part = strings.TrimSpace(strings.TrimPrefix(part, "Override size:"))
		fields := strings.Split(part, "x")
		if len(fields) != 2 {
			continue
		}
		var w, h int
		if _, err := fmt.Sscanf(fields[0], "%d", &w); err != nil {
			continue
		}
		if _, err := fmt.Sscanf(fields[1], "%d", &h); err != nil {
			continue
		}
		if w <= 0 || h <= 0 {
			continue
		}
		return float64(w) / float64(h), nil
	}
	return 0, fmt.Errorf("无法解析 wm size 输出: %s", out)
}

// fitToArea 按设备宽高比在 areaW×areaH 内计算最大适配尺寸
func fitToArea(aspect float64, areaW, areaH int) (int, int) {
	if aspect <= 0 || areaW <= 0 || areaH <= 0 {
		return areaW, areaH
	}
	w := float64(areaH) * aspect
	if w <= float64(areaW) {
		return int(w + 0.5), areaH
	}
	h := float64(areaW) / aspect
	return areaW, int(h + 0.5)
}

// embedAdbKey 发送 Android 按键
func (m *Manager) embedAdbKey(serial string, key string) error {
	out, err := adb.Exec("-s", serial, "shell", "input", "keyevent", key)
	if err != nil {
		return fmt.Errorf("%v\n%s", err, out)
	}
	return nil
}

// EmbedBack 返回键
func (m *Manager) EmbedBack(serial string) error { return m.embedAdbKey(serial, "KEYCODE_BACK") }

// EmbedHome 主页键
func (m *Manager) EmbedHome(serial string) error { return m.embedAdbKey(serial, "KEYCODE_HOME") }

// EmbedRecents 多任务键
func (m *Manager) EmbedRecents(serial string) error {
	return m.embedAdbKey(serial, "KEYCODE_APP_SWITCH")
}

// EmbedVolUp 音量+
func (m *Manager) EmbedVolUp(serial string) error { return m.embedAdbKey(serial, "KEYCODE_VOLUME_UP") }

// EmbedVolDown 音量-
func (m *Manager) EmbedVolDown(serial string) error {
	return m.embedAdbKey(serial, "KEYCODE_VOLUME_DOWN")
}

// EmbedPower 电源键（息屏/亮屏切换）
func (m *Manager) EmbedPower(serial string) error { return m.embedAdbKey(serial, "KEYCODE_POWER") }

// EmbedNotifications 展开通知栏
func (m *Manager) EmbedNotifications(serial string) error {
	out, err := adb.Exec("-s", serial, "shell", "cmd", "statusbar", "expand-notifications")
	if err != nil {
		return fmt.Errorf("%v\n%s", err, out)
	}
	return nil
}

// EmbedScreenshot 截屏保存到用户图片目录
func (m *Manager) EmbedScreenshot(serial string) (string, error) {
	dir, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	pictures := filepath.Join(dir, "Pictures", "Andmaid")
	if err := os.MkdirAll(pictures, 0o755); err != nil {
		return "", err
	}
	name := fmt.Sprintf("andmaid_%s_%s.png", serial, time.Now().Format("20060102_150405"))
	local := filepath.Join(pictures, name)
	remote := "/sdcard/" + name
	if out, err := adb.Exec("-s", serial, "shell", "screencap", "-p", remote); err != nil {
		return "", fmt.Errorf("截屏失败: %v\n%s", err, out)
	}
	if out, err := adb.Exec("-s", serial, "pull", remote, local); err != nil {
		return "", fmt.Errorf("拉取截屏失败: %v\n%s", err, out)
	}
	_, _ = adb.Exec("-s", serial, "shell", "rm", remote)
	return local, nil
}

// CloseAll 关闭本进程所有运行中的内嵌投屏（应用退出时兜底，防止 scrcpy 残留）
func (m *Manager) CloseAll() {
	m.mu.Lock()
	serials := make([]string, 0, len(m.procs))
	for s := range m.procs {
		serials = append(serials, s)
	}
	m.mu.Unlock()
	for _, s := range serials {
		_ = m.CloseEmbed(s)
	}
}
