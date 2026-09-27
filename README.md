# Andmaid

Android 设备管理助手（Android + Maid）。基于 Wails 的桌面应用，集成设备管理、scrcpy 投屏、文件管理、ADB 终端与 AI 助手，内置 adb / scrcpy，开箱即用。

## 功能

- **设备管理**：adb 设备枚举、状态探测、adb server 重启
- **投屏**：调用 scrcpy 投屏，支持同设备多开、应用模式投屏（锁定单个应用）、编码器选择；Windows 下支持内嵌投屏窗口（嵌入主窗口，带虚拟导航栏、音量、电源、截屏等控制）
- **文件管理**：浏览设备存储、新建/删除/重命名/复制/移动、上传下载、APK 安装卸载
- **终端**：每设备交互式 adb shell（xterm.js）
- **AI 助手**：OpenAI 兼容接口 + function calling，可查询设备信息、执行 adb shell、操作屏幕

## 技术栈

- 后端：Go 1.27 + Wails v2
- 前端：React 18 + TypeScript + Vite + Arco Design + xterm.js
- 依赖工具：adb、scrcpy（已内置在 `bin/`）

## 开发

环境要求：Go ≥ 1.27、Node.js ≥ 18、pnpm、Wails CLI（`go install github.com/wailsapp/wails/v2/cmd/wails@latest`）。

```bash
wails dev
```

Vite 热更新；浏览器访问 http://localhost:34115 可在 devtools 中直接调用 Go 方法。

## 构建

```bash
wails build
```

产物在 `build/bin/Andmaid.exe`。

## 项目结构

```
├── main.go               # 入口，--embed=<serial> 内嵌投屏模式
├── app.go                # Wails 绑定门面，转发各服务方法到前端
├── internal/
│   ├── adb/              # adb server 探测与重启
│   ├── device/           # 设备枚举、应用/编码器查询、scrcpy 进程管理
│   ├── filemgr/          # 设备文件管理、APK 安装
│   ├── terminal/         # adb shell 会话管理
│   ├── embed/            # Windows 内嵌投屏窗口
│   ├── agent/            # AI 助手（chat completions + tool call）
│   └── settings/         # 设置持久化（scrcpy.json / ai.json）
├── frontend/             # React 前端（pages: Home/Devices/Files/Agent/Settings/EmbedScreen）
└── bin/                  # 内置 adb、scrcpy 及运行库
```

## 配置文件

- scrcpy 参数：`%AppData%\andmaid\settings.json`
- AI 设置：`%AppData%\andmaid\ai.json`（BaseURL 留空时默认 `https://api.openai.com/v1`）

## 平台说明

内嵌投屏窗口依赖原生窗口操作，仅 Windows 支持；普通投屏、文件管理、终端等功能跨平台。
