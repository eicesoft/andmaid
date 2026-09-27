# AGENTS.md

给 AI 编码代理的本项目工作指南。

## 项目概述

Andmaid——基于 Wails v2 的安卓设备管理桌面应用。Go 后端 + React/TS 前端，内置 adb 与 scrcpy（位于 `bin/`，勿改勿删）。核心功能：设备管理、scrcpy 投屏（含 Windows 内嵌窗口）、文件管理、adb 终端、AI 助手（OpenAI 兼容 + function calling）。

## 常用命令

```bash
# 开发（Vite 热更新 + Go 后端）
wails dev

# 构建产物到 build/bin/
wails build

# Go 检查与测试（在项目根目录）
go vet ./...
go build ./...
go test ./...

# 前端类型检查 + 构建（在 frontend/，需要 pnpm）
pnpm install
pnpm run build      # = tsc && vite build，tsc 即类型检查
```

项目无 lint 配置（无 golangci-lint / eslint），`go vet` + `tsc` 即检查手段。无测试文件，新增测试放同包 `*_test.go`，用 `go test ./...` 跑。

## 架构

```
main.go ──► app.go (Wails 绑定门面)
                │
    ┌───────────┼───────────┐
    device  filemgr  terminal  embed  agent  settings
    (Manager 各自持有 ctx，startup 时注入)
```

- **app.go 是唯一绑定层**：Wails 不展开嵌入字段，前端可见方法必须在此显式转发。新增服务方法后，在 app.go 加对应转发函数，否则前端调不到。
- **internal/ 各包独立**，互相只经 Manager 结构协作；`SetContext(ctx)` 注入 Wails runtime，事件用 `runtime.EventsEmit`，ctx 为 nil 时事件静默。
- **前端调用后端**：经 Wails 生成的绑定（`frontend/wailsjs/`），方法名与 app.go 导出方法一致。
- **设置持久化**：`internal/settings` 写 `%AppData%\andmaid\`（settings.json 存 scrcpy 参数、ai.json 存 AI 参数）。指针字段 nil = 未设置 = 不生成命令行参数。

## 关键约定

- 平台相关代码放 `internal/embed/{windows,other}.go` 式的按 GOOS 分文件；内嵌投屏仅 Windows 支持，`EmbedNative()` 判断。
- scrcpy/adb 二进制在 `bin/`，版本随发布打包，不进 .gitignore 之外的单品改动。
- `--embed=<serial>` 启动参数使进程进入内嵌投屏子窗口模式（main.go `parseArgs`），主窗口经 `OpenEmbedWindow` 拉起独立进程。
- 前端页面在 `frontend/src/pages/`：Home / Devices / Files / Agent / Settings / EmbedScreen。
- 提交信息、代码注释用中文，与现有风格一致。

## 注意事项

- `go.mod` 里有一行注释掉的 wails replace 指令（本地调试遗留），勿动。
- `probe_win.py` 是开发期 Win32 窗口探测脚本（调试内嵌窗口用），不参与构建。
- `Andmaid` / `Andmaid.exe` / `build/bin` / `frontend/dist` 均在 .gitignore，不要提交。
