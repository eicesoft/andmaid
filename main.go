package main

import (
	"embed"
	"fmt"
	"os"
	"strings"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
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

	// Create an instance of the app structure
	app := NewApp()

	title := "Andmaid"
	if embedFlag != "" {
		title = fmt.Sprintf("Andmaid 内嵌投屏 - %s", embedFlag)
	}

	// Create application with options
	err := wails.Run(&options.App{
		Title:     title,
		Width:     1024,
		Height:    768,
		Frameless: true,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		BackgroundColour: &options.RGBA{R: 27, G: 38, B: 54, A: 1},
		OnStartup:        app.startup,
		Bind: []interface{}{
			app,
		},
	})

	if err != nil {
		println("Error:", err.Error())
	}
}
