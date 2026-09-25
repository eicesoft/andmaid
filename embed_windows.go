//go:build windows

package main

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"strings"
	"sync"
	"syscall"
	"time"
	"unsafe"

	"github.com/wailsapp/wails/v2/pkg/runtime"
	"golang.org/x/sys/windows"
)

// Windows 实现：scrcpy 窗口 SetParent 嵌入宿主窗口画面区

// hostArea 计算画面区（宿主客户区去掉工具栏，物理像素）
type winEmbedProcess struct {
	EmbedProcess
	hostHwnd  uintptr
	childHwnd uintptr // scrcpy 窗口句柄（嵌入后 FindWindow 搜不到子窗口，必须存句柄）
	embedded  bool
	mutex     uintptr
	mu        sync.Mutex
	lastRect  []int // 最近一次适配后的 [x,y,w,h]，重挂时复用
}

func (p *winEmbedProcess) hostArea() (int, int, int, int) {
	var cw, ch int
	withPerMonitorDPI(func() {
		var rc _RECT
		procGetClientRect.Call(p.hostHwnd, uintptr(unsafe.Pointer(&rc)))
		cw, ch = int(rc.Right-rc.Left), int(rc.Bottom-rc.Top)
	})
	if cw <= 0 || ch <= 0 {
		return 0, 0, 0, 0
	}
	dpi, _, _ := procGetDpiForWindow.Call(p.hostHwnd)
	dpr := float64(dpi) / 96.0
	if dpr <= 0 {
		dpr = 1
	}
	tb := int(float64(p.toolbarW) * dpr)
	if tb >= cw {
		tb = 0
	}
	return 0, 0, cw - tb, ch
}

// applyFit 按设备纵横比把子窗口适配到画面区居中
func (a *App) applyFit(p *winEmbedProcess) {
	x, y, w, h := p.hostArea()
	if w <= 0 || h <= 0 {
		return
	}
	aspect := p.aspect
	if aspect == 0 {
		if a2, err := a.deviceAspect(p.Serial); err == nil {
			aspect = a2
			p.aspect = a2
		}
	}
	fw, fh := fitToArea(aspect, w, h)
	fx := x + (w-fw)/2
	fy := y + (h-fh)/2
	p.mu.Lock()
	p.lastRect = []int{fx, fy, fw, fh}
	p.mu.Unlock()
	withPerMonitorDPI(func() {
		// HWND_TOP：必须盖在 WebView2 之上，否则 HTML 合成层会把投屏窗口挡住
		procSetWindowPos.Call(p.childHwnd, 0, uintptr(fx), uintptr(fy), uintptr(fw), uintptr(fh), swpShowWin|swpNoAct)
		// 通知 SDL 客户区已变，避免 renderer 继续用旧 drawable
		const wmSize = 0x0005
		procSendMessage.Call(p.childHwnd, wmSize, 0, uintptr(uint32(fh)<<16|uint32(fw)))
	})
	var rc _RECT
	procGetClientRect.Call(p.childHwnd, uintptr(unsafe.Pointer(&rc)))
	vis, _, _ := procIsWindowVisible.Call(p.childHwnd)
	embedLog("applyFit want=%dx%d client=%dx%d pos=(%d,%d) vis=%d", fw, fh, int(rc.Right-rc.Left), int(rc.Bottom-rc.Top), fx, fy, vis)
}

// ===== Win32 API =====

type _RECT struct {
	Left, Top, Right, Bottom int32
}

type _MONITORINFO struct {
	cbSize    uint32
	rcMonitor _RECT
	rcWork    _RECT
	dwFlags   uint32
}

type _MARGINS struct {
	cxLeftWidth, cxRightWidth, cyTopHeight, cyBottomHeight int32
}

var (
	user32                        = windows.NewLazySystemDLL("user32.dll")
	procFindWindow                = user32.NewProc("FindWindowW")
	procSetParent                 = user32.NewProc("SetParent")
	procGetWindowLong             = user32.NewProc("GetWindowLongPtrW")
	procSetWindowLong             = user32.NewProc("SetWindowLongPtrW")
	procMoveWindow                = user32.NewProc("MoveWindow")
	procSetWindowPos              = user32.NewProc("SetWindowPos")
	procSendMessage               = user32.NewProc("SendMessageW")
	procGetClientRect             = user32.NewProc("GetClientRect")
	procGetWindowRect             = user32.NewProc("GetWindowRect")
	procGetParent                 = user32.NewProc("GetParent")
	procIsWindow                  = user32.NewProc("IsWindow")
	procIsWindowVisible           = user32.NewProc("IsWindowVisible")
	procBringWindowToTop          = user32.NewProc("BringWindowToTop")
	procGetDpiForWindow           = user32.NewProc("GetDpiForWindow")
	procSetThreadDpiAwareness     = user32.NewProc("SetThreadDpiAwarenessContext")
	procGetWindowThreadProcessId  = user32.NewProc("GetWindowThreadProcessId")
	procMonitorFromWindow         = user32.NewProc("MonitorFromWindow")
	procGetMonitorInfo            = user32.NewProc("GetMonitorInfoW")
	procSetWindowPos2             = user32.NewProc("SetWindowPos")
	dwmapi                        = windows.NewLazySystemDLL("dwmapi.dll")
	procDwmExtendFrame            = dwmapi.NewProc("DwmExtendFrameIntoClientArea")
	kernel32                      = windows.NewLazySystemDLL("kernel32.dll")
	procCreateMutex               = kernel32.NewProc("CreateMutexW")
	procOpenMutex                 = kernel32.NewProc("OpenMutexW")
	procReleaseMutex              = kernel32.NewProc("ReleaseMutex")
	procCloseHandle               = kernel32.NewProc("CloseHandle")
)

const (
	wsChild      = 0x40000000
	wsPopup      = 0x80000000
	wsCaption    = 0x00C00000
	wsThickfr    = 0x00040000
	wsMinimize   = 0x00020000
	wsMaximize   = 0x01000000
	wsMaxBox     = 0x00010000
	wsSysMenu    = 0x00080000
	wsDlgFrame   = 0x00400000
	wsBorder     = 0x00800000
	wsClipSibs   = 0x04000000
	gwlStyle     = ^uintptr(16) // GWL_STYLE = -16
	swpNoSize    = 0x0001
	swpNoMove    = 0x0002
	swpNoZOrder  = 0x0004
	swpNoAct     = 0x0010
	swpFrameChg  = 0x0020
	swpShowWin   = 0x0040
)

func toUTF16Ptr(s string) uintptr {
	return uintptr(unsafe.Pointer(windows.StringToUTF16Ptr(s)))
}

// embedMutexName 内嵌投屏跨进程状态互斥体名
func embedMutexName(serial string) string {
	return `Global\andmaid-embed-` + serial
}

// holdEmbedMutex 创建并持有命名互斥体，scrcpy 存活期间不释放，进程退出由系统回收。
// 返回句柄，0 表示创建失败（含已存在同设备内嵌投屏）。
func holdEmbedMutex(serial string) uintptr {
	h, _, err := procCreateMutex.Call(0, 1, toUTF16Ptr(embedMutexName(serial)))
	if h == 0 {
		return 0
	}
	// ERROR_ALREADY_EXISTS = 183：已有同设备内嵌投屏在跑，释放并放弃
	if err == syscall.Errno(183) {
		procCloseHandle.Call(h)
		return 0
	}
	return h
}

// embedMutexExists 探测指定设备的内嵌投屏互斥体是否存在（跨进程状态）
func embedMutexExists(serial string) bool {
	h, _, _ := procOpenMutex.Call(0x001F0001, 0, toUTF16Ptr(embedMutexName(serial)))
	if h != 0 {
		procCloseHandle.Call(h)
		return true
	}
	return false
}

// withPerMonitorDPI 在 per-monitor aware 上下文中执行 fn，绕过跨 DPI awareness 进程的坐标虚拟化。
// Wails 宿主窗口与 scrcpy(SDL) 的 DPI awareness 不同，直接 MoveWindow/GetWindowRect
// 会被系统按线程 DPI 上下文缩放换算，导致子窗口定位错位（恒定偏移）。
func withPerMonitorDPI(fn func()) {
	// DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2 = ((DPI_CONTEXT_HANDLE)-4)
	const pmv2 = ^uintptr(3) // -4
	old, _, _ := procSetThreadDpiAwareness.Call(pmv2)
	defer procSetThreadDpiAwareness.Call(old)
	fn()
}

// findSelfWindow 按标题查找本进程的顶层窗口（Wails 主窗口）
func findSelfWindow(title string) uintptr {
	h, _, _ := procFindWindow.Call(0, toUTF16Ptr(title))
	return h
}

// hwndBelongsToPid 检查窗口是否属于指定进程
func hwndBelongsToPid(hwnd uintptr, pid uint32) bool {
	var wpid uint32
	procGetWindowThreadProcessId.Call(hwnd, uintptr(unsafe.Pointer(&wpid)))
	return wpid == pid
}

// embedWindowTo 把 child 窗口嵌入 parent 客户区
func embedWindowTo(child, parent uintptr) error {
	if child == 0 || parent == 0 {
		return fmt.Errorf("窗口句柄无效 child=0x%x parent=0x%x", child, parent)
	}
	// 去掉弹出/标题/边框样式，改成无边框子窗口。
	// 必须保留可缩放能力（不要用 scrcpy --window-borderless：那会冻结 SDL drawable）。
	style, _, _ := procGetWindowLong.Call(child, ^uintptr(15)) // GWL_STYLE = -16
	chrome := uintptr(wsPopup | wsCaption | wsThickfr | wsMinimize | wsMaximize | wsSysMenu | wsDlgFrame | wsBorder)
	newStyle := (style &^ chrome) | wsChild | wsClipSibs
	procSetWindowLong.Call(child, ^uintptr(15), newStyle)
	// scrcpy 是另一进程，SetParent 跨进程可行；ret=0 才是失败（err 是 always-nonnil 的 LastError）
	ret, _, _ := procSetParent.Call(child, parent)
	if ret == 0 {
		return fmt.Errorf("SetParent 失败")
	}
	// 强制重算非客户区，使客户区=整个子窗口，后续 MoveWindow 才能改 drawable
	procSetWindowPos.Call(child, 0, 0, 0, 0, 0, swpNoMove|swpNoSize|swpNoZOrder|swpNoAct|swpFrameChg)
	// 提到宿主子窗口栈顶，盖过 WebView2；否则 HTML 合成层会挡住投屏
	procBringWindowToTop.Call(child)
	procSetWindowPos.Call(child, 0, 0, 0, 0, 0, swpNoMove|swpNoSize|swpNoAct|swpShowWin)
	return nil
}

// monitorWorkArea 取窗口所在显示器工作区（物理像素）
func monitorWorkArea(hwnd uintptr) (_RECT, bool) {
	const MONITOR_DEFAULTTONEAREST = 2
	hmon, _, _ := procMonitorFromWindow.Call(hwnd, MONITOR_DEFAULTTONEAREST)
	if hmon == 0 {
		return _RECT{}, false
	}
	var mi _MONITORINFO
	mi.cbSize = uint32(unsafe.Sizeof(mi))
	if ret, _, _ := procGetMonitorInfo.Call(hmon, uintptr(unsafe.Pointer(&mi))); ret == 0 {
		return _RECT{}, false
	}
	return mi.rcWork, true
}

// EmbedScreen 启动内嵌投屏：新开一个 Andmaid 窗口（独立进程），把无边框 scrcpy 窗口 SetParent 嵌进去。
// hostTitle 用于定位新开的宿主窗口，toolbarW 为前端工具栏宽度（CSS px）。由前端先开新窗口再调用。
func (a *App) EmbedScreen(serial string, hostTitle string, x, y, w, h int, toolbarW int) error {
	embedMu.Lock()
	defer embedMu.Unlock()

	if p, ok := embedProcs[serial]; ok {
		if p.cmd.ProcessState == nil {
			return fmt.Errorf("设备 %s 内嵌投屏已在运行", serial)
		}
		delete(embedProcs, serial)
	}
	if embedMutexExists(serial) {
		return fmt.Errorf("设备 %s 内嵌投屏已在其他窗口运行", serial)
	}

	// 宿主窗口必须存在且属于本进程
	hostHwnd := findSelfWindow(hostTitle)
	embedLog("EmbedScreen serial=%s host=0x%x area=(%d,%d,%d,%d) toolbar=%d", serial, hostHwnd, x, y, w, h, toolbarW)
	if hostHwnd == 0 {
		return fmt.Errorf("未找到宿主窗口 %s", hostTitle)
	}
	selfPid := os.Getpid()
	if !hwndBelongsToPid(hostHwnd, uint32(selfPid)) {
		return fmt.Errorf("窗口 %s 不属于本进程", hostTitle)
	}

	scrcpy, err := a.scrcpyPath()
	if err != nil {
		return err
	}

	// 宿主窗口客户区（子画面区去掉右侧 icon 栏宽度，前端把画面区算好传入）
	settings, err := LoadSettings()
	if err != nil {
		return fmt.Errorf("读取设置失败: %v", err)
	}

	ctx, cancel := context.WithCancel(a.ctx)
	// 初始尺寸：按设备纵横比算内容尺寸，把宿主窗口调成“内容+工具栏”，画面区恰好等于投屏，避免黑边
	aspect, _ := a.deviceAspect(serial)
	fw, fh := fitToArea(aspect, w, h)
	// 初始内容放大 30%（宿主窗口随内容走，只受屏幕工作区约束）
	fw = int(float64(fw) * 1.3)
	fh = int(float64(fh) * 1.3)
	// 竖屏设备内容可能比屏幕还高：钳制到显示器工作区（留一点余量）
	if wa, ok := monitorWorkArea(hostHwnd); ok {
		const margin = 40
		maxH := int(wa.Bottom-wa.Top) - margin
		maxW := int(wa.Right-wa.Left) - margin
		if fh > maxH || fw > maxW {
			fw, fh = fitToArea(aspect, maxW, maxH)
		}
	}
	dpi, _, _ := procGetDpiForWindow.Call(hostHwnd)
	dpr := float64(dpi) / 96.0
	if dpr <= 0 {
		dpr = 1
	}
	hostW := fw + int(float64(toolbarW)*dpr+0.5)
	// 宿主窗口为 Frameless，外框≈客户区；左上角不动，只改大小
	var wr _RECT
	procGetWindowRect.Call(hostHwnd, uintptr(unsafe.Pointer(&wr)))
	procMoveWindow.Call(hostHwnd, uintptr(wr.Left), uintptr(wr.Top), uintptr(hostW), uintptr(fh), 1)
	// 无边框窗口开 DWM 阴影：补 WS_THICKFRAME 系统边框样式 + 扩展玻璃框，触发系统投影
	// （纯 WS_POPUP 无非客户区，DwmExtendFrameIntoClientArea 单独调用不生效）
	style, _, _ := procGetWindowLong.Call(hostHwnd, gwlStyle)
	procSetWindowLong.Call(hostHwnd, gwlStyle, style|wsThickfr|wsSysMenu)
	// SWP_FRAMECHANGED 让新样式立即生效
	procSetWindowPos2.Call(hostHwnd, 0, 0, 0, 0, 0, swpNoSize|swpNoMove|swpNoZOrder|swpFrameChg|swpNoAct)
	var m _MARGINS
	m.cxLeftWidth, m.cxRightWidth, m.cyTopHeight, m.cyBottomHeight = 1, 1, 1, 1
	procDwmExtendFrame.Call(hostHwnd, uintptr(unsafe.Pointer(&m)))
	embedLog("初始尺寸 host=%dx%d content=%dx%d dpr=%.2f", hostW, fh, fw, fh, dpr)
	fx := x
	fy := y
	// 不要加 --window-borderless：borderless 会把 SDL 客户区/画面锁死在启动尺寸，
	// 之后 MoveWindow 只改外框不缩放。先以普通可缩放窗口启动，嵌入后由 embedWindowTo 剥边框。
	args := []string{
		"-s", serial,
		"--window-title", "andmaid-embed-" + serial,
		"--window-x", fmt.Sprint(fx),
		"--window-y", fmt.Sprint(fy),
		"--window-width", fmt.Sprint(fw),
		"--window-height", fmt.Sprint(fh),
	}
	args = append(args, settings.BuildArgs(true)...)
	cmd := exec.CommandContext(ctx, scrcpy, args...)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	if err := cmd.Start(); err != nil {
		cancel()
		return fmt.Errorf("scrcpy 启动失败: %v", err)
	}

	proc := &winEmbedProcess{EmbedProcess: EmbedProcess{Serial: serial, StartedAt: time.Now(), cmd: cmd, cancel: cancel, aspect: aspect, toolbarW: toolbarW}, hostHwnd: hostHwnd}
	embedProcs[serial] = &proc.EmbedProcess
	winProcs[serial] = proc
	if mh := holdEmbedMutex(serial); mh != 0 {
		proc.mutex = mh
	}

	go func() {
		// 等 scrcpy 窗口出现再嵌入；轮询确认窗口稳定（SDL 可能先建临时窗口再重建）
		title := "andmaid-embed-" + serial
		deadline := time.Now().Add(15 * time.Second)
		var childHwnd uintptr
		for time.Now().Before(deadline) {
			h, _, _ := procFindWindow.Call(0, toUTF16Ptr(title))
			if h != 0 {
				if h == childHwnd {
					// 同一句柄连续两次轮询仍在 → 窗口稳定，开始嵌入
					if err := embedWindowTo(h, hostHwnd); err != nil {
						embedLog("嵌入失败 0x%x: %v", h, err)
						return
					}
					embedLog("嵌入成功 0x%x host=0x%x", h, hostHwnd)
					proc.embedded = true
					proc.childHwnd = h
					// 会话级监督：SDL 销毁重建窗口、脱离宿主、宿主尺寸变化时自动修正。
					// 嵌入后 FindWindow 搜不到子窗口，句柄失效时才回退按标题找新窗口。
					lastW, lastH := 0, 0
					for {
						time.Sleep(300 * time.Millisecond)
						if proc.cmd.ProcessState != nil {
							return // scrcpy 已退出
						}
						isw, _, _ := procIsWindow.Call(proc.childHwnd)
						if isw == 0 {
							// 句柄失效：SDL 重建了窗口，按标题找新窗口（此时还是顶层，能搜到）
							nh, _, _ := procFindWindow.Call(0, toUTF16Ptr(title))
							if nh == 0 {
								continue
							}
							if err := embedWindowTo(nh, hostHwnd); err == nil {
								proc.childHwnd = nh
								proc.reapplyLastRect()
							}
							continue
						}
						// 句柄活着但可能被移出宿主（外部 SetParent 或 SDL 改父）
						pp, _, _ := procGetParent.Call(proc.childHwnd)
						if pp != hostHwnd {
							_ = embedWindowTo(proc.childHwnd, hostHwnd)
						}
						// 持续压在 WebView2 之上（合成层可能把子窗口埋掉）
						procBringWindowToTop.Call(proc.childHwnd)
						// 宿主客户区变化：后端直接适配（webview resize 事件可能不触发）
						_, _, cw, ch := proc.hostArea()
						if cw > 0 && (cw != lastW || ch != lastH) {
							embedLog("客户区变化 %dx%d → %dx%d，重新适配", lastW, lastH, cw, ch)
							lastW, lastH = cw, ch
							a.applyFit(proc)
							embedLog("适配完成 childRect 已更新")
						}
					}
				}
				childHwnd = h
			}
			time.Sleep(200 * time.Millisecond)
		}
	}()

	go func() {
		_ = cmd.Wait()
		deleted := false
		embedMu.Lock()
		if cur, ok := embedProcs[serial]; ok && cur == &proc.EmbedProcess {
			delete(embedProcs, serial)
			delete(winProcs, serial)
			deleted = true
			if proc.mutex != 0 {
				procReleaseMutex.Call(proc.mutex)
				procCloseHandle.Call(proc.mutex)
				proc.mutex = 0
			}
		}
		embedMu.Unlock()
		if deleted {
			runtime.EventsEmit(a.ctx, "embed:exited", serial)
		}
	}()

	return nil
}

// findChildWindow 轮询等待指定标题窗口出现
func findChildWindow(title string, timeout time.Duration) uintptr {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		h, _, _ := procFindWindow.Call(0, toUTF16Ptr(title))
		if h != 0 {
			return h
		}
		time.Sleep(100 * time.Millisecond)
	}
	return 0
}

// reapplyLastRect 重挂后恢复最近一次适配位置
func (p *winEmbedProcess) reapplyLastRect() {
	p.mu.Lock()
	lr := p.lastRect
	p.mu.Unlock()
	if lr != nil {
		withPerMonitorDPI(func() {
			procMoveWindow.Call(p.childHwnd, uintptr(lr[0]), uintptr(lr[1]), uintptr(lr[2]), uintptr(lr[3]), 1)
		})
		const wmSize = 0x0005
		procSendMessage.Call(p.childHwnd, wmSize, 0, uintptr(uint32(lr[3])<<16|uint32(lr[2])))
	}
}

// ensureChild 确保子窗口句柄可用：失效时按标题重找并重挂（自愈）。
// 返回可用句柄，失败返回 0。
func (a *App) ensureChild(p *winEmbedProcess) uintptr {
	isw, _, _ := procIsWindow.Call(p.childHwnd)
	if isw != 0 {
		pp, _, _ := procGetParent.Call(p.childHwnd)
		if pp == p.hostHwnd {
			return p.childHwnd
		}
		// 句柄活着但脱离宿主：重挂
		if err := embedWindowTo(p.childHwnd, p.hostHwnd); err == nil {
			p.reapplyLastRect()
			return p.childHwnd
		}
	}
	// 句柄失效：SDL 重建了窗口，按标题找（此时还是顶层，能搜到）
	title := "andmaid-embed-" + p.Serial
	nh, _, _ := procFindWindow.Call(0, toUTF16Ptr(title))
	if nh == 0 {
		return 0
	}
	if err := embedWindowTo(nh, p.hostHwnd); err != nil {
		return 0
	}
	p.childHwnd = nh
	p.reapplyLastRect()
	return nh
}

// ResizeEmbed 同步子窗口位置尺寸。
// x/y/w/h 为前端画面区相对宿主客户区的位置和尺寸（物理像素）；
// toolbarW 为前端工具栏宽度（CSS px），供后端自算画面区用。
// 注意：嵌入后的子窗口 FindWindowW 搜不到（只搜顶层），必须用保存的句柄。
func (a *App) ResizeEmbed(serial string, x, y, w, h int, toolbarW int) error {
	embedMu.Lock()
	proc, ok := winProcs[serial]
	embedMu.Unlock()
	if !ok {
		return fmt.Errorf("设备 %s 没有内嵌投屏", serial)
	}
	if toolbarW > 0 {
		proc.toolbarW = toolbarW
	}
	child := a.ensureChild(proc)
	if child == 0 {
		return fmt.Errorf("投屏窗口不可用")
	}
	a.applyFit(proc)
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
	if wp, ok := winProcs[serial]; ok && wp.mutex != 0 {
		procReleaseMutex.Call(wp.mutex)
		procCloseHandle.Call(wp.mutex)
		wp.mutex = 0
	}
	delete(embedProcs, serial)
	delete(winProcs, serial)
	return nil
}

// EmbedStatus 返回内嵌投屏运行状态（含其他 Andmaid 进程启动的内嵌投屏）
func (a *App) EmbedStatus() map[string]bool {
	embedMu.Lock()
	local := make(map[string]bool)
	for s := range embedProcs {
		local[s] = true
	}
	embedMu.Unlock()

	m := make(map[string]bool)
	for s := range local {
		m[s] = true
	}
	// 已停的本机会话不要再探
	if out, err := a.runAdb("devices"); err == nil {
		for _, line := range strings.Split(out, "\n") {
			fields := strings.Fields(strings.TrimSpace(line))
			if len(fields) >= 2 && fields[1] == "device" {
				if embedMutexExists(fields[0]) {
					m[fields[0]] = true
				}
			}
		}
	}
	return m
}

var winProcs = make(map[string]*winEmbedProcess)
