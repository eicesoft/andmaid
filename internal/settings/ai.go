package settings

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// AI 服务接口参数设置，与 scrcpy 设置分开存（ai.json）。
// BaseURL 可为空：空时默认 https://api.openai.com/v1。

type AISettings struct {
	BaseURL      string   `json:"baseUrl"`      // OpenAI 兼容接口地址，空 = https://api.openai.com/v1
	APIKey       string   `json:"apiKey"`       // API Key
	Model        string   `json:"model"`        // 模型名，如 gpt-4o-mini
	Temperature  *float64 `json:"temperature"`  // 采样温度，nil = 不传
	SystemPrompt string   `json:"systemPrompt"` // 附加系统提示词（拼在设备信息后）
}

func aiPath() string {
	dir, err := os.UserConfigDir()
	if err != nil {
		dir = "."
	}
	return filepath.Join(dir, "andmaid", "ai.json")
}

// LoadAI 读取 AI 设置，不存在时返回默认值。
func LoadAI() (*AISettings, error) {
	s := &AISettings{}
	data, err := os.ReadFile(aiPath())
	if err != nil {
		if os.IsNotExist(err) {
			return s, nil
		}
		return nil, err
	}
	if err := json.Unmarshal(data, s); err != nil {
		return nil, fmt.Errorf("AI 设置解析失败: %v", err)
	}
	return s, nil
}

// BaseURLNorm 返回规范化 BaseURL（去尾斜杠；空时给官方地址）
func (s *AISettings) BaseURLNorm() string {
	u := strings.TrimRight(strings.TrimSpace(s.BaseURL), "/")
	if u == "" {
		u = "https://api.openai.com/v1"
	}
	return u
}

// SaveAI 原子写入 AI 设置
func SaveAI(s *AISettings) error {
	mu.Lock()
	defer mu.Unlock()

	p := aiPath()
	if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(s, "", "  ")
	if err != nil {
		return err
	}
	tmp := p + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, p)
}
