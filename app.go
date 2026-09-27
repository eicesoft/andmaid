package main

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"runtime"

	"andmaid/internal/adb"
	"andmaid/internal/agent"
	"andmaid/internal/device"
	"andmaid/internal/embed"
	"andmaid/internal/filemgr"
	"andmaid/internal/settings"
	"andmaid/internal/terminal"
)

// App Wails 绑定门面：显式转发各领域服务方法到前端绑定。
// Wails 代码生成器不展开嵌入字段，故逐个转发；前端绑定方法名与重构前一致。
type App struct {
	devices  *device.Manager
	files    *filemgr.Manager
	terminal *terminal.Manager
	embedWin *embed.Manager
	agentSvc *agent.Service

	// --embed=<serial> 内嵌投屏模式
	embed string
}

// NewApp 创建应用（各服务实例化 + 组合）
func NewApp() *App {
	devices := device.NewManager()
	return &App{
		devices:  devices,
		files:    filemgr.NewManager(),
		terminal: terminal.NewManager(),
		embedWin: embed.NewManager(),
		agentSvc: agent.NewService(devices),
		embed:    embedFlag,
	}
}

// startup Wails 生命周期：注入 runtime context 给各服务
func (a *App) startup(ctx context.Context) {
	a.devices.SetContext(ctx)
	a.files.SetContext(ctx)
	a.terminal.SetContext(ctx)
	a.embedWin.SetContext(ctx)
	a.agentSvc.SetContext(ctx)
}

// ----- adb server -----

// AdbStatus 探测 adb server 状态与已连接设备数
func (a *App) AdbStatus() adb.Status { return adb.Probe() }

// RestartAdbServer 重启 adb server（kill 后重新拉起）
func (a *App) RestartAdbServer() error { return adb.RestartServer() }

// ----- 设备与投屏（device.Manager） -----

func (a *App) ListDevices() ([]device.Device, error) { return a.devices.ListDevices() }
func (a *App) OpenScreen(serial string) error        { return a.devices.OpenScreen(serial) }
func (a *App) OpenAppScreen(serial string, pkg string) error {
	return a.devices.OpenAppScreen(serial, pkg)
}
func (a *App) OpenAppScreenOnMain(serial string, pkg string) error {
	return a.devices.OpenAppScreenOnMain(serial, pkg)
}
func (a *App) CloseScreen(sessionID string) error { return a.devices.CloseScreen(sessionID) }
func (a *App) ScreenStatus() map[string]bool      { return a.devices.ScreenStatus() }
func (a *App) ListApps(serial string) ([]device.AndroidApp, error) {
	return a.devices.ListApps(serial)
}
func (a *App) ListEncoders(serial string, codec string) ([]device.VideoEncoder, error) {
	return a.devices.ListEncoders(serial, codec)
}

// ----- 设置 -----

func (a *App) GetSettings() (*settings.ScrcpySettings, error) { return settings.Load() }
func (a *App) SaveSettings(s *settings.ScrcpySettings) error  { return settings.Save(s) }
func (a *App) ResetSettings() error                           { return settings.Reset() }
func (a *App) GetAISettings() (*settings.AISettings, error)   { return settings.LoadAI() }
func (a *App) SaveAISettings(s *settings.AISettings) error    { return settings.SaveAI(s) }

// ----- 文件管理（filemgr.Manager） -----

func (a *App) ListStorages(serial string) ([]filemgr.DeviceStorage, error) {
	return a.files.ListStorages(serial)
}
func (a *App) ListFiles(serial string, path string) ([]filemgr.FileEntry, error) {
	return a.files.ListFiles(serial, path)
}
func (a *App) Mkdir(serial string, path string) error   { return a.files.Mkdir(serial, path) }
func (a *App) NewFile(serial string, path string) error { return a.files.NewFile(serial, path) }
func (a *App) DeleteFiles(serial string, paths []string) error {
	return a.files.DeleteFiles(serial, paths)
}
func (a *App) RenameDeviceFile(serial string, path string, newName string) error {
	return a.files.RenameDeviceFile(serial, path, newName)
}
func (a *App) CopyDeviceFiles(serial string, srcs []string, destDir string) error {
	return a.files.CopyDeviceFiles(serial, srcs, destDir)
}
func (a *App) MoveDeviceFiles(serial string, srcs []string, destDir string) error {
	return a.files.MoveDeviceFiles(serial, srcs, destDir)
}
func (a *App) DownloadFile(serial string, remotePath string) (string, error) {
	return a.files.DownloadFile(serial, remotePath)
}
func (a *App) UploadFiles(serial string, deviceDir string) error {
	return a.files.UploadFiles(serial, deviceDir)
}
func (a *App) InstallApk(serial string, apkPath string) error {
	return a.files.InstallApk(serial, apkPath)
}
func (a *App) PickAndInstallApk(serial string) error {
	return a.files.PickAndInstallApk(serial)
}
func (a *App) UninstallApp(serial string, pkg string) error {
	return a.files.UninstallApp(serial, pkg)
}

// ----- 终端（terminal.Manager） -----

func (a *App) StartShell(serial string, rows int, cols int) (string, error) {
	return a.terminal.StartShell(serial, rows, cols)
}
func (a *App) WriteShell(sessionID string, data string) error {
	return a.terminal.WriteShell(sessionID, data)
}
func (a *App) StopShell(serial string) error { return a.terminal.StopShell(serial) }
func (a *App) StopShellSession(serial string, expectID string) error {
	return a.terminal.StopShellSession(serial, expectID)
}
func (a *App) ShellAlive(serial string) bool { return a.terminal.ShellAlive(serial) }

// ----- 内嵌投屏（embed.Manager） -----

func (a *App) EmbedScreen(serial string, hostTitle string, x, y, w, h int, toolbarW int) error {
	return a.embedWin.EmbedScreen(serial, hostTitle, x, y, w, h, toolbarW)
}
func (a *App) ResizeEmbed(serial string, x, y, w, h int, toolbarW int) error {
	return a.embedWin.ResizeEmbed(serial, x, y, w, h, toolbarW)
}
func (a *App) EmbedFlashBehind(serial string) error  { return a.embedWin.EmbedFlashBehind(serial) }
func (a *App) EmbedFlashRestore(serial string) error { return a.embedWin.EmbedFlashRestore(serial) }
func (a *App) CloseEmbed(serial string) error        { return a.embedWin.CloseEmbed(serial) }
func (a *App) EmbedStatus() map[string]bool          { return a.embedWin.EmbedStatus() }
func (a *App) EmbedBack(serial string) error         { return a.embedWin.EmbedBack(serial) }
func (a *App) EmbedHome(serial string) error         { return a.embedWin.EmbedHome(serial) }
func (a *App) EmbedRecents(serial string) error      { return a.embedWin.EmbedRecents(serial) }
func (a *App) EmbedVolUp(serial string) error        { return a.embedWin.EmbedVolUp(serial) }
func (a *App) EmbedVolDown(serial string) error      { return a.embedWin.EmbedVolDown(serial) }
func (a *App) EmbedPower(serial string) error        { return a.embedWin.EmbedPower(serial) }
func (a *App) EmbedNotifications(serial string) error {
	return a.embedWin.EmbedNotifications(serial)
}
func (a *App) EmbedScreenshot(serial string) (string, error) {
	return a.embedWin.EmbedScreenshot(serial)
}

// ----- AI 助手（agent.Service） -----

func (a *App) AgentChat(req agent.AgentChatRequest) (string, error) {
	return a.agentSvc.AgentChat(req)
}

// ----- 内嵌窗口模式 -----

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
		return err
	}
	cmd := exec.Command(exe, "--embed="+serial)
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("启动内嵌投屏窗口失败: %v", err)
	}
	// 不等子进程，独立窗口生命周期自管理
	go func() { _ = cmd.Wait() }()
	return nil
}

// Greet 测试用
func (a *App) Greet(name string) string {
	return fmt.Sprintf("Hello %s, It's show time!", name)
}
