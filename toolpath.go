package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
)

// findTool 在常见位置查找 bin 目录下的工具
func findTool(name string) (string, bool) {
	if binDir == "" {
		return "", false
	}
	candidates := []string{
		filepath.Join(binDir, name),                    // exe 同目录
		filepath.Join(binDir, "bin", name),             // exe/bin
		filepath.Join(binDir, "..", "..", "bin", name), // build/bin -> 项目/bin
	}
	for _, p := range candidates {
		if _, err := os.Stat(p); err == nil {
			if abs, err := filepath.Abs(p); err == nil {
				return abs, true
			}
			return p, true
		}
	}
	return "", false
}

// toolName 按平台补可执行文件后缀（windows: foo -> foo.exe）
func toolName(name string) string {
	if runtime.GOOS == "windows" && !strings.HasSuffix(strings.ToLower(name), ".exe") {
		return name + ".exe"
	}
	return name
}

// toolPath 查找程序目录或 bin 目录下的工具；找不到时回退 PATH
func (a *App) toolPath(name string) string {
	n := toolName(name)
	if p, ok := findTool(n); ok {
		return p
	}
	// 回退 PATH（macOS/Linux 用户可能用 brew 装了 scrcpy/adb）
	if p, err := exec.LookPath(n); err == nil {
		return p
	}
	return ""
}

func (a *App) adbPath() string {
	if p := a.toolPath("adb"); p != "" {
		return p
	}
	return "adb"
}

func (a *App) scrcpyPath() (string, error) {
	if p := a.toolPath("scrcpy"); p != "" {
		return p, nil
	}
	if runtime.GOOS == "windows" {
		return "", fmt.Errorf("未找到 scrcpy.exe，请将其与 adb.exe 放在程序同目录或 bin 目录下")
	}
	return "", fmt.Errorf("未找到 scrcpy，请安装（如 brew install scrcpy）或将其与 adb 放在程序同目录或 bin 目录下")
}
