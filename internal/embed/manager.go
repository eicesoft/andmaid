// Package embed 内嵌投屏：scrcpy 画面嵌入宿主窗口。
// Windows：SetParent 原生嵌入（windows.go）；macOS/Linux：独立窗口降级（other.go）。
package embed

import (
	"context"
	"os/exec"
	"sync"

	"github.com/wailsapp/wails/v2/pkg/runtime"

	"andmaid/internal/adb"
)

// Manager 内嵌投屏管理器。Wails 绑定后方法直接暴露给前端。
type Manager struct {
	ctx   context.Context // nil 时事件静默，须在 Startup 后注入
	mu    sync.Mutex
	procs map[string]*EmbedProcess // key: serial
}

// NewManager 创建内嵌投屏管理器。Startup 后调用 SetContext。
func NewManager() *Manager {
	return &Manager{procs: make(map[string]*EmbedProcess)}
}

// SetContext 注入 Wails runtime context（EventsEmit 用）
func (m *Manager) SetContext(ctx context.Context) { m.ctx = ctx }

func (m *Manager) emit(event string, data ...interface{}) {
	if m.ctx != nil {
		runtime.EventsEmit(m.ctx, event, data...)
	}
}

var (
	_ = adb.Exec // 保持 adb 依赖显式
	_ = (*exec.Cmd)(nil)
)
