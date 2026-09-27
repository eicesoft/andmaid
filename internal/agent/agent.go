// Agent：OpenAI 兼容 chat completions，流式输出 + function tool call。
// 前端经 Wails 绑定 AgentChat 调用，流式事件走 runtime.EventsEmit。
package agent

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"andmaid/internal/settings"
)

// ---------- 请求/响应结构 ----------

type ChatMessage struct {
	Role       string     `json:"role"`
	Content    string     `json:"content"`
	ToolCalls  []ToolCall `json:"tool_calls,omitempty"`
	ToolCallID string     `json:"tool_call_id,omitempty"`
}

type ToolCall struct {
	Index    *int             `json:"index,omitempty"` // 流式增量必带
	ID       string           `json:"id,omitempty"`
	Type     string           `json:"type,omitempty"`
	Function ToolCallFunction `json:"function"`
}

type ToolCallFunction struct {
	Name      string `json:"name,omitempty"`
	Arguments string `json:"arguments,omitempty"`
}

type chatRequest struct {
	Model       string        `json:"model"`
	Messages    []ChatMessage `json:"messages"`
	Tools       []AgentTool   `json:"tools,omitempty"`
	Stream      bool          `json:"stream"`
	Temperature *float64      `json:"temperature,omitempty"`
}

type AgentTool struct {
	Type     string            `json:"type"`
	Function AgentToolFunction `json:"function"`
}

type AgentToolFunction struct {
	Name        string                 `json:"name"`
	Description string                 `json:"description"`
	Parameters  map[string]interface{} `json:"parameters"`
}

// AgentMessage 前端传入的对话消息
type AgentMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// AgentChatRequest 一次聊天请求
type AgentChatRequest struct {
	Serial   string         `json:"serial"`   // 目标设备（可空：用第一台在线设备）
	Messages []AgentMessage `json:"messages"` // 完整历史（前端维护）
}

// ---------- Agent 工具定义（投屏相关操作） ----------

func agentTools() []AgentTool {
	obj := func(props map[string]interface{}, required ...string) map[string]interface{} {
		m := map[string]interface{}{"type": "object", "properties": props}
		if len(required) > 0 {
			m["required"] = required
		}
		return m
	}
	return []AgentTool{
		{
			Type: "function",
			Function: AgentToolFunction{
				Name:        "list_devices",
				Description: "列出当前通过 adb 连接的所有安卓设备（序列号、状态、型号）",
				Parameters:  obj(map[string]interface{}{}),
			},
		},
		{
			Type: "function",
			Function: AgentToolFunction{
				Name:        "device_info",
				Description: "获取指定设备的详细信息：Android 版本、SDK、分辨率、密度、电量、内存、磁盘、IP",
				Parameters: obj(map[string]interface{}{
					"serial": map[string]interface{}{"type": "string", "description": "设备序列号；留空用第一台在线设备"},
				}),
			},
		},
		{
			Type: "function",
			Function: AgentToolFunction{
				Name:        "list_screens",
				Description: "列出当前运行中的投屏会话（sessionID 形如 serial#n）",
				Parameters:  obj(map[string]interface{}{}),
			},
		},
		{
			Type: "function",
			Function: AgentToolFunction{
				Name:        "open_screen",
				Description: "对指定设备开启 scrcpy 投屏窗口（同设备已有普通投屏时报错）",
				Parameters: obj(map[string]interface{}{
					"serial": map[string]interface{}{"type": "string", "description": "设备序列号；留空用第一台在线设备"},
				}, "serial"),
			},
		},
		{
			Type: "function",
			Function: AgentToolFunction{
				Name:        "close_screen",
				Description: "关闭指定投屏会话",
				Parameters: obj(map[string]interface{}{
					"sessionId": map[string]interface{}{"type": "string", "description": "投屏会话 ID（list_screens 返回的 serial#n）"},
				}, "sessionId"),
			},
		},
		{
			Type: "function",
			Function: AgentToolFunction{
				Name:        "open_app_screen",
				Description: "开启投屏并直接启动设备上指定应用（虚拟显示器多开）",
				Parameters: obj(map[string]interface{}{
					"serial":  map[string]interface{}{"type": "string", "description": "设备序列号；留空用第一台在线设备"},
					"package": map[string]interface{}{"type": "string", "description": "应用包名，如 com.example.app"},
				}, "package"),
			},
		},
		{
			Type: "function",
			Function: AgentToolFunction{
				Name:        "list_apps",
				Description: "列出设备上已安装应用（名称、包名、是否系统应用）",
				Parameters: obj(map[string]interface{}{
					"serial": map[string]interface{}{"type": "string", "description": "设备序列号；留空用第一台在线设备"},
					"filter": map[string]interface{}{"type": "string", "description": "可选过滤关键词，匹配应用名或包名"},
				}),
			},
		},
		{
			Type: "function",
			Function: AgentToolFunction{
				Name:        "adb_shell",
				Description: "在设备上执行只读 adb shell 命令（如 dumpsys、getprop、ps、cat）。写操作/危险命令会被拒绝",
				Parameters: obj(map[string]interface{}{
					"serial":  map[string]interface{}{"type": "string", "description": "设备序列号；留空用第一台在线设备"},
					"command": map[string]interface{}{"type": "string", "description": "shell 命令，如 dumpsys window | head -20"},
				}, "command"),
			},
		},
		{
			Type: "function",
			Function: AgentToolFunction{
				Name:        "ui_dump",
				Description: "导出当前屏幕 UI 层级：元素文本/ID/类型/中心点坐标。点击或输入前先调用它定位元素",
				Parameters: obj(map[string]interface{}{
					"serial": map[string]interface{}{"type": "string", "description": "设备序列号；留空用第一台在线设备"},
				}),
			},
		},
		{
			Type: "function",
			Function: AgentToolFunction{
				Name:        "tap",
				Description: "点击设备屏幕指定坐标。坐标用 ui_dump 返回的中心点",
				Parameters: obj(map[string]interface{}{
					"serial": map[string]interface{}{"type": "string", "description": "设备序列号；留空用第一台在线设备"},
					"x":      map[string]interface{}{"type": "integer", "description": "屏幕 X 坐标（像素）"},
					"y":      map[string]interface{}{"type": "integer", "description": "屏幕 Y 坐标（像素）"},
				}, "x", "y"),
			},
		},
		{
			Type: "function",
			Function: AgentToolFunction{
				Name:        "long_press",
				Description: "长按屏幕指定坐标（默认 800ms）",
				Parameters: obj(map[string]interface{}{
					"serial":     map[string]interface{}{"type": "string", "description": "设备序列号；留空用第一台在线设备"},
					"x":          map[string]interface{}{"type": "integer", "description": "X 坐标"},
					"y":          map[string]interface{}{"type": "integer", "description": "Y 坐标"},
					"durationMs": map[string]interface{}{"type": "integer", "description": "按住时长毫秒，默认 800"},
				}, "x", "y"),
			},
		},
		{
			Type: "function",
			Function: AgentToolFunction{
				Name:        "swipe",
				Description: "从起点滑动到终点（滚动列表、翻页、手势）",
				Parameters: obj(map[string]interface{}{
					"serial":     map[string]interface{}{"type": "string", "description": "设备序列号；留空用第一台在线设备"},
					"x1":         map[string]interface{}{"type": "integer", "description": "起点 X"},
					"y1":         map[string]interface{}{"type": "integer", "description": "起点 Y"},
					"x2":         map[string]interface{}{"type": "integer", "description": "终点 X"},
					"y2":         map[string]interface{}{"type": "integer", "description": "终点 Y"},
					"durationMs": map[string]interface{}{"type": "integer", "description": "滑动时长毫秒，默认 300"},
				}, "x1", "y1", "x2", "y2"),
			},
		},
		{
			Type: "function",
			Function: AgentToolFunction{
				Name:        "input_text",
				Description: "向当前焦点输入框输入文本。ASCII 直接输入；中文需设备装有 ADBKeyboard 输入法",
				Parameters: obj(map[string]interface{}{
					"serial": map[string]interface{}{"type": "string", "description": "设备序列号；留空用第一台在线设备"},
					"text":   map[string]interface{}{"type": "string", "description": "要输入的文本"},
				}, "text"),
			},
		},
		{
			Type: "function",
			Function: AgentToolFunction{
				Name:        "key_event",
				Description: "发送按键：back/home/enter/esc/menu/recent/volume_up/volume_down/power/tab/delete/search/dpad_up/dpad_down/dpad_left/dpad_right 或数字键码",
				Parameters: obj(map[string]interface{}{
					"serial": map[string]interface{}{"type": "string", "description": "设备序列号；留空用第一台在线设备"},
					"key":    map[string]interface{}{"type": "string", "description": "按键名或数字键码，如 back、home、enter、4"},
				}, "key"),
			},
		},
	}
}

// ---------- 事件载荷 ----------

type agentEvent struct {
	Type      string     `json:"type"` // delta | tool_call | tool_result | done | error
	Content   string     `json:"content,omitempty"`
	ToolCalls []ToolCall `json:"toolCalls,omitempty"`
	Error     string     `json:"error,omitempty"`
}

// ---------- 主流程 ----------

const agentEventName = "agent:event"
const maxToolRounds = 20 // 防死循环；复杂多步操作（开应用+点按+输入）一轮对话可消耗 10+ 轮

// AgentChat 发起一轮 Agent 对话（流式，事件推前端）。
// 返回最终 assistant 文本；工具调用过程通过 agent:event 事件实时推送。
func (ag *Service) AgentChat(req AgentChatRequest) (string, error) {
	s, err := settings.LoadAI()
	if err != nil {
		return "", fmt.Errorf("读取 AI 设置失败: %v", err)
	}
	if strings.TrimSpace(s.APIKey) == "" {
		return "", fmt.Errorf("未配置 API Key，请先在设置中填写")
	}
	if strings.TrimSpace(s.Model) == "" {
		return "", fmt.Errorf("未配置模型名，请先在设置中填写")
	}

	messages, err := ag.buildAgentMessages(req)
	if err != nil {
		return "", err
	}
	tools := agentTools()
	client := &http.Client{Timeout: 5 * time.Minute}

	var finalText strings.Builder
	reachedLimit := false
	for round := 0; round < maxToolRounds; round++ {
		respText, calls, err := ag.agentStreamOnce(client, s, messages, tools)
		if err != nil {
			ag.emitAgentEvent(agentEvent{Type: "error", Error: err.Error()})
			return finalText.String(), err
		}
		if len(calls) == 0 {
			finalText.WriteString(respText)
			break
		}
		if round == maxToolRounds-1 {
			// 最后一轮还产出 tool call：不再执行，避免静默截断
			reachedLimit = true
			break
		}
		// assistant 消息（含 tool_calls）入历史，再执行工具
		assistantMsg := ChatMessage{Role: "assistant", Content: respText, ToolCalls: calls}
		messages = append(messages, assistantMsg)
		ag.emitAgentEvent(agentEvent{Type: "tool_call", ToolCalls: calls})

		for _, c := range calls {
			result := ag.execAgentTool(req.Serial, c.Function.Name, c.Function.Arguments)
			messages = append(messages, ChatMessage{Role: "tool", ToolCallID: c.ID, Content: result})
			ag.emitAgentEvent(agentEvent{Type: "tool_result", Content: fmt.Sprintf("%s: %s", c.Function.Name, result)})
		}
		finalText.WriteString(respText)
	}
	if reachedLimit {
		finalText.WriteString("\n\n[已达单轮工具调用上限，任务未完成。请拆分成小步骤继续]")
	}
	ag.emitAgentEvent(agentEvent{Type: "done"})
	return finalText.String(), nil
}

// buildAgentMessages 组装系统提示（设备信息带入）+ 历史消息
func (ag *Service) buildAgentMessages(req AgentChatRequest) ([]ChatMessage, error) {
	devInfo := ag.agentDeviceContext(req.Serial)
	sys := "你是 Andmaid 桌面应用的设备助手，通过工具管理安卓设备与 scrcpy 投屏，并能代替用户操作设备。" +
		"回答用中文，简洁准确。涉及设备操作时先调用工具获取真实信息，不要凭空猜测设备状态。\n" +
		"操作屏幕的流程：先 ui_dump 获取当前屏幕元素及坐标，再用 tap/swipe/input_text/key_event 操作。" +
		"点击后若需确认结果，再次 ui_dump 检查页面变化。\n" +
		"当前设备环境：\n" + devInfo
	if s, err := settings.LoadAI(); err == nil && strings.TrimSpace(s.SystemPrompt) != "" {
		sys += "\n用户附加指令：" + strings.TrimSpace(s.SystemPrompt)
	}

	msgs := []ChatMessage{{Role: "system", Content: sys}}
	for _, m := range req.Messages {
		role := m.Role
		if role != "user" && role != "assistant" {
			continue
		}
		msgs = append(msgs, ChatMessage{Role: role, Content: m.Content})
	}
	if len(msgs) == 1 {
		return nil, fmt.Errorf("消息不能为空")
	}
	return msgs, nil
}

// agentStreamOnce 调一次 chat completions（流式），聚合文本与 tool call 增量。
// 有 tool call 时文本可能为空，工具执行后进入下一轮。
func (ag *Service) agentStreamOnce(client *http.Client, s *settings.AISettings, messages []ChatMessage, tools []AgentTool) (string, []ToolCall, error) {
	body, err := json.Marshal(chatRequest{
		Model: strings.TrimSpace(s.Model), Messages: messages, Tools: tools, Stream: true, Temperature: s.Temperature,
	})
	if err != nil {
		return "", nil, err
	}
	ctx, cancel := context.WithTimeout(ag.ctx, 5*time.Minute)
	defer cancel()
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, s.BaseURLNorm()+"/chat/completions", bytes.NewReader(body))
	if err != nil {
		return "", nil, err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+strings.TrimSpace(s.APIKey))

	resp, err := client.Do(httpReq)
	if err != nil {
		return "", nil, fmt.Errorf("请求 AI 接口失败: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return "", nil, fmt.Errorf("AI 接口返回 %d: %s", resp.StatusCode, string(b))
	}

	var text strings.Builder
	calls := map[int]*ToolCall{} // index -> 聚合中的 tool call
	scanner := bufio.NewScanner(resp.Body)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	for scanner.Scan() {
		line := scanner.Text()
		if !strings.HasPrefix(line, "data:") {
			continue
		}
		data := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
		if data == "" || data == "[DONE]" {
			continue
		}
		var chunk struct {
			Choices []struct {
				Delta struct {
					Content   string     `json:"content"`
					ToolCalls []ToolCall `json:"tool_calls"`
				} `json:"delta"`
				FinishReason string `json:"finish_reason"`
			} `json:"choices"`
			Error *struct {
				Message string `json:"message"`
			} `json:"error"`
		}
		if err := json.Unmarshal([]byte(data), &chunk); err != nil {
			continue
		}
		if chunk.Error != nil {
			return text.String(), nil, fmt.Errorf("AI 接口错误: %s", chunk.Error.Message)
		}
		if len(chunk.Choices) == 0 {
			continue
		}
		delta := chunk.Choices[0].Delta
		if delta.Content != "" {
			text.WriteString(delta.Content)
			ag.emitAgentEvent(agentEvent{Type: "delta", Content: delta.Content})
		}
		for _, tc := range delta.ToolCalls {
			idx := 0
			if tc.Index != nil {
				idx = *tc.Index
			}
			cur, ok := calls[idx]
			if !ok {
				cp := tc
				cur = &cp
				calls[idx] = cur
			} else {
				if tc.ID != "" {
					cur.ID = tc.ID
				}
				if tc.Function.Name != "" {
					cur.Function.Name += tc.Function.Name
				}
				cur.Function.Arguments += tc.Function.Arguments
			}
			cur.Type = "function"
		}
	}
	if err := scanner.Err(); err != nil {
		return text.String(), nil, fmt.Errorf("读取 AI 响应失败: %v", err)
	}

	var out []ToolCall
	for i := 0; i < len(calls); i++ {
		if c, ok := calls[i]; ok {
			if c.ID == "" {
				c.ID = fmt.Sprintf("call_%d_%d", time.Now().UnixNano(), i)
			}
			out = append(out, *c)
		}
	}
	return text.String(), out, nil
}
