package main

import (
	"context"
	"fmt"
	"os/exec"
	"strings"
	"sync"
	"time"
)

// adb server 统一管理：
// scrcpy 内部会自行执行 adb start-server，若 server 未就绪，多个进程同时
// 冷启动 server 会在 5037 端口上竞态（"could not read ok from ADB Server"）。
// 因此所有 adb/scrcpy 调用前先确保 server 就绪，daemon 级错误自动重启重试一次。

var (
	adbServerMu   sync.Mutex
	adbServerUp   bool
	adbVersionMu  sync.Mutex
	adbVersionStr string
)

// ensureAdbServer 确保 adb server 已启动（成功后缓存，进程内不再重复启动）
func (a *App) ensureAdbServer() error {
	adbServerMu.Lock()
	if adbServerUp {
		adbServerMu.Unlock()
		return nil
	}
	adbServerMu.Unlock()

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	out, err := exec.CommandContext(ctx, a.adbPath(), "start-server").CombinedOutput()
	if err != nil {
		return fmt.Errorf("adb server 启动失败: %v\n%s", err, out)
	}
	adbServerMu.Lock()
	adbServerUp = true
	adbServerMu.Unlock()
	return nil
}

// invalidateAdbServer server 状态缓存失效（kill-server 或探活失败后调用）
func invalidateAdbServer() {
	adbServerMu.Lock()
	adbServerUp = false
	adbServerMu.Unlock()
}

// isAdbDaemonError 输出是否为 adb daemon 连接类错误（可重启恢复）
func isAdbDaemonError(out string) bool {
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

// execAdb 执行 adb 命令返回合并输出（不带预启与重试）
func (a *App) execAdb(args ...string) (string, error) {
	return a.execAdbTimeout(10*time.Second, args...)
}

// execAdbTimeout 同 execAdb，自定义超时（uiautomator dump 等慢命令用）
func (a *App) execAdbTimeout(timeout time.Duration, args ...string) (string, error) {
	ctx := a.ctx
	if ctx == nil {
		ctx = context.Background()
	}
	cctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	out, err := exec.CommandContext(cctx, a.adbPath(), args...).CombinedOutput()
	return string(out), err
}

// adbVersion 缓存 adb 版本号（进程内只查一次）
func (a *App) adbVersion() string {
	adbVersionMu.Lock()
	defer adbVersionMu.Unlock()
	if adbVersionStr != "" {
		return adbVersionStr
	}
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	out, err := exec.CommandContext(ctx, a.adbPath(), "version").CombinedOutput()
	if err != nil {
		return ""
	}
	for _, line := range strings.Split(string(out), "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "Android Debug Bridge version") {
			adbVersionStr = strings.TrimSpace(strings.TrimPrefix(line, "Android Debug Bridge version"))
			break
		}
	}
	return adbVersionStr
}

// AdbStatus adb server 运行状态（首页监控展示）
type AdbStatus struct {
	Running bool   `json:"running"`
	Version string `json:"version"`
	Devices int    `json:"devices"`
	Error   string `json:"error,omitempty"`
}

// AdbStatus 探测 adb server 状态与已连接设备数
func (a *App) AdbStatus() AdbStatus {
	st := AdbStatus{}
	out, err := a.execAdb("devices")
	if err != nil || isAdbDaemonError(out) {
		invalidateAdbServer()
		st.Error = strings.TrimSpace(out)
		if st.Error == "" && err != nil {
			st.Error = err.Error()
		}
		return st
	}
	st.Running = true
	st.Version = a.adbVersion()
	for _, line := range strings.Split(out, "\n") {
		f := strings.Fields(strings.TrimSpace(line))
		if len(f) >= 2 && f[0] != "List" {
			st.Devices++
		}
	}
	return st
}

// RestartAdbServer 重启 adb server（kill 后重新拉起）
func (a *App) RestartAdbServer() error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_, _ = exec.CommandContext(ctx, a.adbPath(), "kill-server").CombinedOutput()
	invalidateAdbServer()
	return a.ensureAdbServer()
}
