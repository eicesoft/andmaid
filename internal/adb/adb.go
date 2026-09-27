// Package adb 提供 adb / scrcpy 可执行文件查找、adb server 生命周期管理
// 与 adb 命令执行（含 daemon 级错误自动重启重试）。
package adb

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"
)

// toolDir exe 所在目录，init 时缓存一次
var toolDir string

func init() {
	if exe, err := os.Executable(); err == nil {
		toolDir = filepath.Dir(exe)
	}
}

// findTool 在常见位置查找 bin 目录下的工具
func findTool(name string) (string, bool) {
	if toolDir == "" {
		return "", false
	}
	candidates := []string{
		filepath.Join(toolDir, name),                    // exe 同目录
		filepath.Join(toolDir, "bin", name),             // exe/bin
		filepath.Join(toolDir, "..", "..", "bin", name), // build/bin -> 项目/bin
	}
	for _, p := range candidates {
		if _, err := os.Stat(p); err == nil {
			if abs, err := filepath.Abs(p); err == nil {
				return abs, true
			}
			return p, true
		}
	}
	return "", false
}

// toolName 按平台补可执行文件后缀（windows: foo -> foo.exe）
func toolName(name string) string {
	if runtime.GOOS == "windows" && !strings.HasSuffix(strings.ToLower(name), ".exe") {
		return name + ".exe"
	}
	return name
}

// ToolPath 查找程序目录或 bin 目录下的工具；找不到时回退 PATH
func ToolPath(name string) string {
	n := toolName(name)
	if p, ok := findTool(n); ok {
		return p
	}
	// 回退 PATH（macOS/Linux 用户可能用 brew 装了 scrcpy/adb）
	if p, err := exec.LookPath(n); err == nil {
		return p
	}
	return ""
}

// AdbPath 返回 adb 可执行文件路径（找不到时回退裸命令名）
func AdbPath() string {
	if p := ToolPath("adb"); p != "" {
		return p
	}
	return "adb"
}

// ScrcpyPath 返回 scrcpy 可执行文件路径
func ScrcpyPath() (string, error) {
	if p := ToolPath("scrcpy"); p != "" {
		return p, nil
	}
	if runtime.GOOS == "windows" {
		return "", fmt.Errorf("未找到 scrcpy.exe，请将其与 adb.exe 放在程序同目录或 bin 目录下")
	}
	return "", fmt.Errorf("未找到 scrcpy，请安装（如 brew install scrcpy）或将其与 adb 放在程序同目录或 bin 目录下")
}

// ----- adb server 管理 -----

// scrcpy 内部会自行执行 adb start-server，若 server 未就绪，多个进程同时
// 冷启动 server 会在 5037 端口上竞态（"could not read ok from ADB Server"）。
// 因此所有 adb/scrcpy 调用前先确保 server 就绪，daemon 级错误自动重启重试一次。

var (
	serverMu   sync.Mutex
	serverUp   bool
	versionMu  sync.Mutex
	versionStr string
)

// EnsureServer 确保 adb server 已启动（成功后缓存，进程内不再重复启动）
func EnsureServer() error {
	serverMu.Lock()
	if serverUp {
		serverMu.Unlock()
		return nil
	}
	serverMu.Unlock()

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	out, err := exec.CommandContext(ctx, AdbPath(), "start-server").CombinedOutput()
	if err != nil {
		return fmt.Errorf("adb server 启动失败: %v\n%s", err, out)
	}
	serverMu.Lock()
	serverUp = true
	serverMu.Unlock()
	return nil
}

// InvalidateServer server 状态缓存失效（kill-server 或探活失败后调用）
func InvalidateServer() {
	serverMu.Lock()
	serverUp = false
	serverMu.Unlock()
}

// IsDaemonError 输出是否为 adb daemon 连接类错误（可重启恢复）
func IsDaemonError(out string) bool {
	s := strings.ToLower(out)
	for _, kw := range []string{
		"cannot connect to daemon",
		"failed to start daemon",
		"could not read ok from adb server",
		"adb server didn't ack",
		"adb: device offline", // server 刚重启瞬态
	} {
		if strings.Contains(s, kw) {
			return true
		}
	}
	return false
}

// Exec 执行 adb 命令返回合并输出（自动预启 server + daemon 错误重试）
func Exec(args ...string) (string, error) {
	return ExecTimeout(10*time.Second, args...)
}

// ExecTimeout 同 Exec，自定义超时（uiautomator dump 等慢命令用）
func ExecTimeout(timeout time.Duration, args ...string) (string, error) {
	if err := EnsureServer(); err != nil {
		return "", err
	}
	out, err := execTimeout(timeout, args...)
	if err != nil && IsDaemonError(out) {
		InvalidateServer()
		if err2 := EnsureServer(); err2 != nil {
			return out, err
		}
		out, err = execTimeout(timeout, args...)
	}
	return out, err
}

// execTimeout 执行 adb 命令返回合并输出（不带预启与重试）
func execTimeout(timeout time.Duration, args ...string) (string, error) {
	cctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	out, err := exec.CommandContext(cctx, AdbPath(), args...).CombinedOutput()
	return string(out), err
}

// Version 缓存 adb 版本号（进程内只查一次）
func Version() string {
	versionMu.Lock()
	defer versionMu.Unlock()
	if versionStr != "" {
		return versionStr
	}
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	out, err := exec.CommandContext(ctx, AdbPath(), "version").CombinedOutput()
	if err != nil {
		return ""
	}
	for _, line := range strings.Split(string(out), "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "Android Debug Bridge version") {
			versionStr = strings.TrimSpace(strings.TrimPrefix(line, "Android Debug Bridge version"))
			break
		}
	}
	return versionStr
}

// Status adb server 运行状态探测结果
type Status struct {
	Running bool   `json:"running"`
	Version string `json:"version"`
	Devices int    `json:"devices"`
	Error   string `json:"error,omitempty"`
}

// Probe 探测 adb server 状态与已连接设备数
func Probe() Status {
	st := Status{}
	out, err := execTimeout(10*time.Second, "devices")
	if err != nil || IsDaemonError(out) {
		InvalidateServer()
		st.Error = strings.TrimSpace(out)
		if st.Error == "" && err != nil {
			st.Error = err.Error()
		}
		return st
	}
	st.Running = true
	st.Version = Version()
	for _, line := range strings.Split(out, "\n") {
		f := strings.Fields(strings.TrimSpace(line))
		if len(f) >= 2 && f[0] != "List" {
			st.Devices++
		}
	}
	return st
}

// RestartServer 重启 adb server（kill 后重新拉起）
func RestartServer() error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_, _ = exec.CommandContext(ctx, AdbPath(), "kill-server").CombinedOutput()
	InvalidateServer()
	return EnsureServer()
}
