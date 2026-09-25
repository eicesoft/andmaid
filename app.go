package main

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"runtime"
)

// App struct
type App struct {
	ctx    context.Context
	embed  string // --embed=<serial> 内嵌投屏模式
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{embed: embedFlag}
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
}

// EmbedMode 返回 --embed 启动参数（空 = 主窗口模式）
func (a *App) EmbedMode() string {
	return a.embed
}

// EmbedNative 是否支持原生窗口嵌入（仅 Windows）
func (a *App) EmbedNative() bool {
	return runtime.GOOS == "windows"
}

// HostTitle 返回当前窗口标题（前端定位宿主窗口用）
func (a *App) HostTitle() string {
	title := "Andmaid"
	if a.embed != "" {
		title = fmt.Sprintf("Andmaid 内嵌投屏 - %s", a.embed)
	}
	return title
}

// OpenEmbedWindow 用资源管理器拉起独立进程，开内嵌投屏窗口。
// 主窗口进程里调用；--embed 参数让新进程进入内嵌模式。
func (a *App) OpenEmbedWindow(serial string) error {
	exe, err := os.Executable()
	if err != nil {
		return fmt.Errorf("获取程序路径失败: %v", err)
	}
	cmd := exec.Command(exe, "--embed="+serial)
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("启动内嵌投屏窗口失败: %v", err)
	}
	// 不等子进程，独立窗口生命周期自管理
	go func() { _ = cmd.Wait() }()
	return nil
}

// Greet returns a greeting for the given name
func (a *App) Greet(name string) string {
	return fmt.Sprintf("Hello %s, It's show time!", name)
}
