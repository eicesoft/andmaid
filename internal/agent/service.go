// Package agent AI 设备助手：OpenAI 兼容 chat completions 流式调用 +
// function tool call 执行（设备信息、adb shell、屏幕操作）。
package agent

import (
	"context"

	"github.com/wailsapp/wails/v2/pkg/runtime"

	"andmaid/internal/device"
)

// Service AI 助手服务。依赖 device.Manager 执行设备操作；
// Wails 绑定后 AgentChat / GetAISettings 等方法直接暴露给前端。
type Service struct {
	ctx     context.Context // nil 时事件静默，须在 Startup 后注入
	devices *device.Manager
}

// NewService 创建 AI 助手服务。Startup 后调用 SetContext。
func NewService(devices *device.Manager) *Service {
	return &Service{devices: devices}
}

// SetContext 注入 Wails runtime context（EventsEmit 用）
func (s *Service) SetContext(ctx context.Context) { s.ctx = ctx }

func (s *Service) emitAgentEvent(ev agentEvent) {
	if s.ctx != nil {
		runtime.EventsEmit(s.ctx, agentEventName, ev)
	}
}
