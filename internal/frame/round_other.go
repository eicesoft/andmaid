//go:build !darwin

package frame

// RoundWindow 无需处理：Windows 11 的 frameless 窗口由 DWM 提供原生圆角与阴影
// （Wails 默认开启 frameless decorations），Win10 不支持圆角窗口，保持直角。
func RoundWindow() {}
