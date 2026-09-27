package main

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"os/exec"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// 设备终端：交互式 adb shell。
// 后端起 `adb shell -tt`（设备端分配 pty），stdout 流式推 shell:data 事件，
// stdin 通过 WriteShell 写入——前端 xterm.js 的按键直通设备，获得真终端体验。
// 每台设备同时只保留一个 shell 会话；会话有唯一 ID，重启即换新 ID，
// 前端按 ID 过滤事件，旧会话的退出事件不会污染新会话。

type shellProc struct {
	id     string
	cmd    *exec.Cmd
	stdin  io.WriteCloser
	cancel context.CancelFunc
	done   chan struct{} // 关闭表示进程已退出
}

var (
	shellMu    sync.Mutex
	shellProcs = make(map[string]*shellProc)
	shellSeq   int
	writeMu    sync.Mutex // 串行化 stdin 写入
)

// StartShell 启动设备交互 shell（已存在则先终止旧的），返回会话 ID。
// rows/cols 为前端终端尺寸，用于设备端 stty，保证长行正确折行。
func (a *App) StartShell(serial string, rows int, cols int) (string, error) {
	serial = strings.TrimSpace(serial)
	if serial == "" {
		return "", fmt.Errorf("设备序列号不能为空")
	}
	if rows <= 0 {
		rows = 24
	}
	if cols <= 0 {
		cols = 80
	}
	if err := a.ensureAdbServer(); err != nil {
		return "", err
	}

	// 旧的还活着先停
	_ = a.stopShell(serial, true)

	shellMu.Lock()
	adb := a.adbPath()
	// -tt 强制设备端 pty：有回显、颜色、光标控制；stty 同步尺寸后 exec 换正式 shell
	sizeCmd := fmt.Sprintf("stty rows %d cols %d; exec sh", rows, cols)
	ctx, cancel := context.WithCancel(a.ctx)
	cmd := exec.CommandContext(ctx, adb, "-s", serial, "shell", "-tt", sizeCmd)
	stdin, err := cmd.StdinPipe()
	if err != nil {
		cancel()
		shellMu.Unlock()
		return "", fmt.Errorf("打开 shell stdin 失败: %v", err)
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		cancel()
		shellMu.Unlock()
		return "", fmt.Errorf("打开 shell stdout 失败: %v", err)
	}
	shellSeq++
	p := &shellProc{
		id:     fmt.Sprintf("%s#%d", serial, shellSeq),
		cmd:    cmd,
		stdin:  stdin,
		cancel: cancel,
		done:   make(chan struct{}),
	}
	shellProcs[serial] = p
	shellMu.Unlock()

	if err := cmd.Start(); err != nil {
		shellMu.Lock()
		if cur, ok := shellProcs[serial]; ok && cur == p {
			delete(shellProcs, serial)
		}
		shellMu.Unlock()
		cancel()
		return "", fmt.Errorf("启动 adb shell 失败: %v", err)
	}

	// 输出流：UTF-8 边界安全地推给前端
	go a.pumpShellOutput(serial, p, stdout)

	// 退出清理
	go func() {
		_ = cmd.Wait()
		close(p.done)
		shellMu.Lock()
		if cur, ok := shellProcs[serial]; ok && cur == p {
			delete(shellProcs, serial)
		}
		shellMu.Unlock()
		runtime.EventsEmit(a.ctx, "shell:exit", map[string]string{
			"serial": serial,
			"id":     p.id,
		})
	}()

	// 起动即失败（设备离线等）靠 shell:exit 事件通知前端
	return p.id, nil
}

// WriteShell 向设备 shell 的 stdin 写数据（按键、粘贴、快捷命令）
func (a *App) WriteShell(serial string, data string) error {
	shellMu.Lock()
	p, ok := shellProcs[serial]
	shellMu.Unlock()
	if !ok {
		return fmt.Errorf("设备 %s shell 未运行", serial)
	}
	writeMu.Lock()
	defer writeMu.Unlock()
	_, err := io.WriteString(p.stdin, data)
	if err != nil {
		return fmt.Errorf("写入 shell 失败: %v", err)
	}
	return nil
}

// StopShell 终止设备 shell 会话
func (a *App) StopShell(serial string) error {
	return a.stopShell(strings.TrimSpace(serial), false)
}

// StopShellSession 仅当设备当前会话 ID 等于 expectID 时终止；
// 不匹配（已被新会话替换/已退出）静默成功——防止旧请求误杀新会话
func (a *App) StopShellSession(serial string, expectID string) error {
	serial = strings.TrimSpace(serial)
	shellMu.Lock()
	p, ok := shellProcs[serial]
	shellMu.Unlock()
	if !ok || p.id != expectID {
		return nil
	}
	return a.stopShell(serial, false)
}

// ShellAlive 设备 shell 是否在运行
func (a *App) ShellAlive(serial string) bool {
	shellMu.Lock()
	defer shellMu.Unlock()
	_, ok := shellProcs[strings.TrimSpace(serial)]
	return ok
}

// ---------- 内部 ----------

func (a *App) stopShell(serial string, quiet bool) error {
	shellMu.Lock()
	p, ok := shellProcs[serial]
	shellMu.Unlock()
	if !ok {
		if quiet {
			return nil
		}
		return fmt.Errorf("设备 %s shell 未运行", serial)
	}
	p.cancel()
	select {
	case <-p.done:
	case <-time.After(3 * time.Second):
		_ = p.cmd.Process.Kill()
	}
	return nil
}

// pumpShellOutput 读 adb 输出并按 UTF-8 字符边界切块推送给前端
func (a *App) pumpShellOutput(serial string, p *shellProc, r io.Reader) {
	reader := bufio.NewReaderSize(r, 4096)
	var pending []byte
	buf := make([]byte, 4096)
	for {
		n, err := reader.Read(buf)
		if n > 0 {
			pending = append(pending, buf[:n]...)
			// 只 flush 完整 UTF-8 序列，残缺尾部留给下一轮
			cut := utf8Cut(pending)
			if cut > 0 {
				runtime.EventsEmit(a.ctx, "shell:data", map[string]string{
					"serial": serial,
					"id":     p.id,
					"data":   string(pending[:cut]),
				})
				pending = append(pending[:0], pending[cut:]...)
			}
		}
		if err != nil {
			if len(pending) > 0 {
				runtime.EventsEmit(a.ctx, "shell:data", map[string]string{
					"serial": serial,
					"id":     p.id,
					"data":   string(pending),
				})
			}
			return
		}
		select {
		case <-p.done:
			return
		default:
		}
	}
}

// utf8Cut 返回 b 前缀中完整 UTF-8 序列的字节数；无完整字符返回 0
func utf8Cut(b []byte) int {
	i := 0
	for i < len(b) {
		r, size := utf8.DecodeRune(b[i:])
		if r == utf8.RuneError && size <= 1 {
			// 首字节可能是多字节序列开头但数据不全
			if i+utf8.UTFMax > len(b) && isUTF8Prefix(b[i:]) {
				return i
			}
			// 真·非法字节，跳过 1 字节照常输出
			i++
			continue
		}
		i += size
	}
	return i
}

// isUTF8Prefix 判断 b 是否为截断的多字节 UTF-8 序列开头
func isUTF8Prefix(b []byte) bool {
	if len(b) == 0 {
		return false
	}
	c := b[0]
	var want int
	switch {
	case c&0xE0 == 0xC0:
		want = 2
	case c&0xF0 == 0xE0:
		want = 3
	case c&0xF8 == 0xF0:
		want = 4
	default:
		return false
	}
	return len(b) < want
}
