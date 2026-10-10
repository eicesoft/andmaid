package main

import (
	"context"
	"embed"
	"fmt"
	"os"
	"runtime"
	"strings"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/mac"
)

//go:embed all:frontend/dist
var assets embed.FS

// embedFlag 解析 --embed=<serial> 启动参数（内嵌投屏新窗口模式）
var embedFlag string

func parseArgs() {
	for _, arg := range os.Args[1:] {
		if strings.HasPrefix(arg, "--embed=") {
			embedFlag = strings.TrimPrefix(arg, "--embed=")
		}
	}
}

func main() {
	parseArgs()

	app := NewApp()

	title := "Andmaid"
	if embedFlag != "" {
		title = fmt.Sprintf("Andmaid 内嵌投屏 - %s", embedFlag)
	}

	err := wails.Run(&options.App{
		Title:  title,
		Width:  1024,
		Height: 768,
		// macOS 用原生框架（红绿灯为系统绘制）；Windows/Linux 保持无边框自绘按钮
		Frameless: runtime.GOOS != "darwin",
		Mac: &mac.Options{
			// 隐藏标题条、内容延伸到顶，仅保留原生红绿灯浮在内容左上角
			TitleBar: mac.TitleBarHidden(),
		},
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		BackgroundColour: &options.RGBA{R: 27, G: 38, B: 54, A: 1},
		OnStartup:        app.startup,
		// 退出兜底：关闭所有内嵌投屏，防止 scrcpy 残留
		OnShutdown: func(context.Context) {
			app.embedWin.CloseAll()
		},
		Bind: []interface{}{
			app,
		},
	})

	if err != nil {
		println("Error:", err.Error())
	}
}
