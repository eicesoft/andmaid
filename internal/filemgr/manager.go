package filemgr

import (
	"context"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// Manager 设备文件管理后端。Wails 绑定后方法直接暴露给前端。
type Manager struct {
	ctx context.Context // nil 时事件静默（对话框 API 会失败，须在 Startup 后注入）
}

// NewManager 创建文件管理器。Startup 后调用 SetContext。
func NewManager() *Manager { return &Manager{} }

// SetContext 注入 Wails runtime context（对话框与 EventsEmit 用）
func (m *Manager) SetContext(ctx context.Context) { m.ctx = ctx }

func (m *Manager) emit(event string, data ...interface{}) {
	if m.ctx != nil {
		runtime.EventsEmit(m.ctx, event, data...)
	}
}
