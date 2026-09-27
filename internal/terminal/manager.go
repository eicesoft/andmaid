package terminal

import (
	"context"
	"io"
	"os/exec"
	"sync"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// Manager 设备终端会话管理。每台设备同时只保留一个 shell 会话。
type Manager struct {
	ctx     context.Context // nil 时事件静默，须在 Startup 后注入
	mu      sync.Mutex
	procs   map[string]*shellProc // key: serial
	seq     int
	writeMu sync.Mutex // 串行化 stdin 写入
}

// shellProc 一个运行中的 adb shell 会话
type shellProc struct {
	id     string
	cmd    *exec.Cmd
	stdin  io.WriteCloser
	cancel context.CancelFunc
	done   chan struct{} // 关闭表示进程已退出
}

// NewManager 创建终端管理器。Startup 后调用 SetContext。
func NewManager() *Manager {
	return &Manager{procs: make(map[string]*shellProc)}
}

// SetContext 注入 Wails runtime context（EventsEmit 用）
func (m *Manager) SetContext(ctx context.Context) { m.ctx = ctx }

func (m *Manager) emit(event string, data ...interface{}) {
	if m.ctx != nil {
		runtime.EventsEmit(m.ctx, event, data...)
	}
}
