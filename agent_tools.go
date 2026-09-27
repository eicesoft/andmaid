package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
)

// Agent 工具执行 + 设备上下文（设备信息带入系统提示）。

// pickSerial 选目标设备：显式 serial 非空校验存在；空则取第一台在线设备
func (a *App) pickSerial(serial string) (string, error) {
	serial = strings.TrimSpace(serial)
	devices, err := a.ListDevices()
	if err != nil {
		return "", err
	}
	var online []Device
	for _, d := range devices {
		if d.State == "device" {
			online = append(online, d)
		}
	}
	if serial != "" {
		for _, d := range online {
			if d.Serial == serial {
				return serial, nil
			}
		}
		return "", fmt.Errorf("设备 %s 不在线", serial)
	}
	if len(online) == 0 {
		return "", fmt.Errorf("没有在线设备，请先连接安卓设备")
	}
	return online[0].Serial, nil
}

// agentDeviceContext 汇总设备信息给系统提示（无设备时返回占位说明）
func (a *App) agentDeviceContext(serial string) string {
	devices, err := a.ListDevices()
	var b strings.Builder
	if err != nil {
		return fmt.Sprintf("（设备列表获取失败: %v）", err)
	}
	if len(devices) == 0 {
		return "当前没有任何 adb 设备连接。"
	}
	b.WriteString("adb 设备列表：\n")
	var serials []string
	for _, d := range devices {
		state := d.State
		if state == "device" {
			state = "在线"
		}
		mark := ""
		if serial != "" && d.Serial == serial {
			mark = "（当前会话目标）"
		}
		b.WriteString(fmt.Sprintf("- 序列号 %s 型号 %s 状态 %s%s\n", d.Serial, d.Model, state, mark))
		if d.State == "device" {
			serials = append(serials, d.Serial)
		}
	}
	// 第一台在线设备的简要信息直接带入
	if len(serials) > 0 {
		if info := a.agentDeviceInfoBrief(serials[0]); info != "" {
			b.WriteString("\n第一台在线设备（" + serials[0] + "）信息：\n" + info)
		}
	}
	sessions := a.ScreenStatus()
	if len(sessions) > 0 {
		keys := make([]string, 0, len(sessions))
		for k := range sessions {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		b.WriteString("\n运行中的投屏会话：" + strings.Join(keys, ", ") + "\n")
	}
	return b.String()
}

// agentDeviceInfoBrief 简要设备信息（属性名 + 值）
func (a *App) agentDeviceInfoBrief(serial string) string {
	props := map[string]string{
		"Android 版本":  "ro.build.version.release",
		"SDK":         "ro.build.version.sdk",
		"型号":          "ro.product.model",
		"品牌":          "ro.product.brand",
		"Android ID":  "",
	}
	var lines []string
	for label, prop := range props {
		if prop == "" {
			continue
		}
		out, err := a.runAdb("-s", serial, "shell", "getprop", prop)
		if err != nil {
			continue
		}
		if v := strings.TrimSpace(out); v != "" {
			lines = append(lines, fmt.Sprintf("%s=%s", label, v))
		}
	}
	// 分辨率
	if out, err := a.runAdb("-s", serial, "shell", "wm", "size"); err == nil {
		if v := strings.TrimSpace(out); v != "" {
			lines = append(lines, "分辨率 "+strings.ReplaceAll(v, "\n", " "))
		}
	}
	sort.Strings(lines)
	return strings.Join(lines, "\n")
}

// execAgentTool 按工具名执行，返回给模型的结果文本（总是字符串，错误也作为文本返回）
func (a *App) execAgentTool(defaultSerial, name, argsJSON string) string {
	var args map[string]interface{}
	if s := strings.TrimSpace(argsJSON); s != "" {
		if err := json.Unmarshal([]byte(s), &args); err != nil {
			return "错误: 参数解析失败 " + err.Error()
		}
	}
	argStr := func(key string) string {
		if v, ok := args[key].(string); ok {
			return strings.TrimSpace(v)
		}
		return ""
	}
	argInt := func(key string) *int {
		if v, ok := args[key].(float64); ok {
			n := int(v)
			return &n
		}
		return nil
	}
	serialOr := func() string { return argStr("serial") }
	resolve := func() (string, error) { return a.pickSerial(serialOr()) }

	switch name {
	case "list_devices":
		devices, err := a.ListDevices()
		if err != nil {
			return "错误: " + err.Error()
		}
		if len(devices) == 0 {
			return "没有连接的设备"
		}
		var lines []string
		for _, d := range devices {
			lines = append(lines, fmt.Sprintf("%s | 状态 %s | 型号 %s", d.Serial, d.State, d.Model))
		}
		return strings.Join(lines, "\n")

	case "device_info":
		serial, err := resolve()
		if err != nil {
			return "错误: " + err.Error()
		}
		return a.agentDeviceInfo(serial)

	case "list_screens":
		sessions := a.ScreenStatus()
		if len(sessions) == 0 {
			return "当前没有运行中的投屏会话"
		}
		keys := make([]string, 0, len(sessions))
		for k := range sessions {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		return "运行中的投屏会话:\n" + strings.Join(keys, "\n")

	case "open_screen":
		serial, err := resolve()
		if err != nil {
			return "错误: " + err.Error()
		}
		if err := a.OpenScreen(serial); err != nil {
			return "错误: " + err.Error()
		}
		return "已对设备 " + serial + " 开启投屏窗口"

	case "close_screen":
		sid := argStr("sessionId")
		if sid == "" {
			return "错误: sessionId 不能为空"
		}
		if err := a.CloseScreen(sid); err != nil {
			return "错误: " + err.Error()
		}
		return "已关闭投屏会话 " + sid

	case "open_app_screen":
		pkg := argStr("package")
		if pkg == "" {
			return "错误: package 不能为空"
		}
		serial, err := resolve()
		if err != nil {
			return "错误: " + err.Error()
		}
		// Agent 场景禁用虚拟显示器：input tap / uiautomator dump 只作用于
		// 主屏（display 0），虚拟屏里的应用对注入和 dump 不可见，坐标全错。
		if err := a.OpenAppScreenOnMain(serial, pkg); err != nil {
			return "错误: " + err.Error()
		}
		return "已在设备 " + serial + " 上开屏并启动应用 " + pkg + "（主屏模式）"

	case "list_apps":
		serial, err := resolve()
		if err != nil {
			return "错误: " + err.Error()
		}
		apps, err := a.ListApps(serial)
		if err != nil {
			return "错误: " + err.Error()
		}
		filter := argStr("filter")
		kw := strings.ToLower(filter)
		var lines []string
		for _, ap := range apps {
			if kw != "" && !strings.Contains(strings.ToLower(ap.Name), kw) && !strings.Contains(strings.ToLower(ap.Package), kw) {
				continue
			}
			tag := ""
			if ap.System {
				tag = " [系统]"
			}
			lines = append(lines, ap.Name+" | "+ap.Package+tag)
		}
		if len(lines) == 0 {
			return "没有匹配的应用"
		}
		if len(lines) > 80 {
			lines = append(lines[:80], "...（共 "+fmt.Sprint(len(apps))+" 个，已截断）")
		}
		return strings.Join(lines, "\n")

	case "adb_shell":
		serial, err := resolve()
		if err != nil {
			return "错误: " + err.Error()
		}
		cmdline := argStr("command")
		if cmdline == "" {
			return "错误: command 不能为空"
		}
		return a.agentAdbShell(serial, cmdline)

	case "ui_dump":
		serial, err := resolve()
		if err != nil {
			return "错误: " + err.Error()
		}
		return a.agentUIDump(serial)

	case "tap":
		serial, err := resolve()
		if err != nil {
			return "错误: " + err.Error()
		}
		x, y := argInt("x"), argInt("y")
		if x == nil || y == nil {
			return "错误: x/y 必须为整数坐标"
		}
		out, err := a.runAdb("-s", serial, "shell", "input", "tap", fmt.Sprint(*x), fmt.Sprint(*y))
		if e := agentInputErr(out, err); e != "" {
			return e
		}
		return fmt.Sprintf("已点击 (%d, %d)", *x, *y)

	case "long_press":
		serial, err := resolve()
		if err != nil {
			return "错误: " + err.Error()
		}
		x, y := argInt("x"), argInt("y")
		if x == nil || y == nil {
			return "错误: x/y 必须为整数坐标"
		}
		ms := 800
		if d := argInt("durationMs"); d != nil && *d > 0 {
			ms = *d
		}
		out, err := a.runAdb("-s", serial, "shell", "input", "swipe",
			fmt.Sprint(*x), fmt.Sprint(*y), fmt.Sprint(*x), fmt.Sprint(*y), fmt.Sprint(ms))
		if e := agentInputErr(out, err); e != "" {
			return e
		}
		return fmt.Sprintf("已长按 (%d, %d) %dms", *x, *y, ms)

	case "swipe":
		serial, err := resolve()
		if err != nil {
			return "错误: " + err.Error()
		}
		x1, y1, x2, y2 := argInt("x1"), argInt("y1"), argInt("x2"), argInt("y2")
		if x1 == nil || y1 == nil || x2 == nil || y2 == nil {
			return "错误: x1/y1/x2/y2 必须为整数坐标"
		}
		ms := 300
		if d := argInt("durationMs"); d != nil && *d > 0 {
			ms = *d
		}
		out, err := a.runAdb("-s", serial, "shell", "input", "swipe",
			fmt.Sprint(*x1), fmt.Sprint(*y1), fmt.Sprint(*x2), fmt.Sprint(*y2), fmt.Sprint(ms))
		if e := agentInputErr(out, err); e != "" {
			return e
		}
		return fmt.Sprintf("已滑动 (%d,%d)→(%d,%d) %dms", *x1, *y1, *x2, *y2, ms)

	case "input_text":
		serial, err := resolve()
		if err != nil {
			return "错误: " + err.Error()
		}
		text := argStr("text")
		if text == "" {
			return "错误: text 不能为空"
		}
		return a.agentInputText(serial, text)

	case "key_event":
		serial, err := resolve()
		if err != nil {
			return "错误: " + err.Error()
		}
		key := argStr("key")
		if key == "" {
			return "错误: key 不能为空"
		}
		code, ok := agentKeyCodes[strings.ToUpper(key)]
		if !ok {
			// 允许直接传数字键码
			if isAllDigits(key) {
				code = key
			} else {
				return fmt.Sprintf("错误: 未知按键 %q，可用: back/home/enter/esc/menu/recent/volume_up/volume_down/power/tab/delete/search/dpad_up/dpad_down/dpad_left/dpad_right 或数字键码", key)
			}
		}
		out, err := a.runAdb("-s", serial, "shell", "input", "keyevent", code)
		if e := agentInputErr(out, err); e != "" {
			return e
		}
		return fmt.Sprintf("已发送按键 %s", key)

	default:
		return "错误: 未知工具 " + name
	}
}

// agentKeyEvents 允许 input 命令的注入类操作（Agent 专用，不走只读白名单）
var agentKeyCodes = map[string]string{
	"BACK": "4", "HOME": "3", "ENTER": "66", "ESC": "111", "MENU": "82",
	"RECENT": "187", "VOLUME_UP": "24", "VOLUME_DOWN": "25", "POWER": "26",
	"TAB": "61", "DELETE": "67", "SEARCH": "84",
	"DPAD_UP": "19", "DPAD_DOWN": "20", "DPAD_LEFT": "21", "DPAD_RIGHT": "22",
}

func isAllDigits(s string) bool {
	for _, c := range s {
		if c < '0' || c > '9' {
			return false
		}
	}
	return len(s) > 0
}

// agentInputErr 检查 input 命令结果。部分设备（EMUI 安全限制等）
// 注入失败时退出码为 0 但输出异常文本，必须检查输出。
func agentInputErr(out string, err error) string {
	o := strings.TrimSpace(out)
	if err != nil {
		if strings.Contains(o, "SecurityException") || strings.Contains(o, "INJECT_EVENTS") {
			return "错误: 设备拒绝注入（SecurityException）。请在设备「开发者选项」中开启「USB 调试（安全设置）」——允许通过 USB 模拟点击和输入"
		}
		return "错误: " + err.Error() + " " + o
	}
	if strings.Contains(o, "SecurityException") || strings.Contains(o, "INJECT_EVENTS") {
		return "错误: 设备拒绝注入（SecurityException）。请在设备「开发者选项」中开启「USB 调试（安全设置）」——允许通过 USB 模拟点击和输入"
	}
	if strings.Contains(o, "Error") || strings.Contains(o, "Exception") || strings.Contains(o, "必须予以指定") || strings.Contains(o, "must be specified") {
		return "错误: 命令执行异常: " + o
	}
	return ""
}

// agentDeviceInfo 详细设备信息（tool 用）
func (a *App) agentDeviceInfo(serial string) string {
	get := func(prop string) string {
		out, err := a.runAdb("-s", serial, "shell", "getprop", prop)
		if err != nil {
			return ""
		}
		return strings.TrimSpace(out)
	}
	shell := func(args ...string) string {
		out, err := a.runAdb(append([]string{"-s", serial, "shell"}, args...)...)
		if err != nil {
			return ""
		}
		return strings.TrimSpace(out)
	}
	sec := func(label, v string) string {
		if v == "" {
			return ""
		}
		return label + ": " + firstLine(v) + "\n"
	}
	var b strings.Builder
	b.WriteString(sec("型号", get("ro.product.model")))
	b.WriteString(sec("品牌", get("ro.product.brand")))
	b.WriteString(sec("Android 版本", get("ro.build.version.release")))
	b.WriteString(sec("SDK", get("ro.build.version.sdk")))
	b.WriteString(sec("安全补丁", get("ro.build.version.security_patch")))
	if v := shell("wm", "size"); v != "" {
		b.WriteString(sec("分辨率", v))
	}
	if v := shell("wm", "density"); v != "" {
		b.WriteString(sec("密度", v))
	}
	if v := shell("dumpsys", "battery"); v != "" {
		if m := regexp.MustCompile(`level:\s*(\d+)`).FindStringSubmatch(v); m != nil {
			b.WriteString("电量: " + m[1] + "%\n")
		}
	}
	if v := shell("df", "-h", "/storage/emulated"); v != "" {
		lines := strings.Split(v, "\n")
		if len(lines) > 1 {
			b.WriteString("存储: " + firstLine(lines[1]) + "\n")
		}
	}
	if v := shell("ip", "route"); v != "" {
		if m := regexp.MustCompile(`src (\d+\.\d+\.\d+\.\d+)`).FindStringSubmatch(v); m != nil {
			b.WriteString("IP: " + m[1] + "\n")
		}
	}
	if b.Len() == 0 {
		return "设备信息获取失败（设备可能已断开）"
	}
	return strings.TrimRight(b.String(), "\n")
}

// agentAdbShell 执行受限白名单外的只读 shell 命令（dumpsys/getprop/ps/ls 等）
func (a *App) agentAdbShell(serial, cmdline string) string {
	// 危险命令黑名单：写操作一律拒绝，Agent 只读。
	// 管道允许（grep/head 等纯读），但每段都过黑名单；重定向写入仍拒绝。
	lower := strings.ToLower(cmdline)
	danger := []string{"rm ", "reboot", "shutdown", "flash", "fastboot", "pm uninstall", "pm clear", "am force-stop", "input ", "settings put", "setprop", "mount", "chmod", "chown", "dd ", "mkfs"}
	for _, seg := range strings.Split(lower, "|") {
		for _, d := range danger {
			if strings.Contains(seg, d) {
				return "拒绝执行: 含危险操作 " + d
			}
		}
	}
	if strings.Contains(lower, ">") {
		return "拒绝执行: 不允许重定向写文件"
	}
	out, err := a.runAdbTimeout(30*time.Second, "-s", serial, "shell", cmdline)
	if err != nil {
		return "错误: " + err.Error() + "\n" + out
	}
	out = strings.TrimSpace(out)
	if len(out) > 4000 {
		out = out[:4000] + "\n...（输出已截断）"
	}
	if out == "" {
		return "（无输出）"
	}
	return out
}

// adbKeyboardIME ADBKeyboard 输入法组件名
const adbKeyboardIME = "com.android.adbkeyboard/.AdbIME"

// agentInputText 输入文本。
// 纯 ASCII 用 input text 直输；含非 ASCII 时经 ADBKeyboard 广播输入
// （input text 不支持中文）。ADBKeyboard 未装/未启用时自动安装（bin/ADBKeyboard.apk）
// 并切换，输入完恢复原输入法。
func (a *App) agentInputText(serial, text string) string {
	if isASCII(text) {
		escaped := strings.ReplaceAll(text, `%`, `\%`)
		escaped = strings.ReplaceAll(escaped, ` `, `%s`)
		if out, err := a.runAdb("-s", serial, "shell", "input", "text", escaped); err != nil {
			return "错误: 输入失败 " + err.Error() + " " + out
		}
		return "已输入文本: " + text
	}

	// 非 ASCII：走 ADBKeyboard
	origIME := ""
	if out, err := a.runAdb("-s", serial, "shell", "settings", "get", "secure", "default_input_method"); err == nil {
		origIME = strings.TrimSpace(out)
	}
	installed := false
	enabled := false
	if out, err := a.runAdb("-s", serial, "shell", "ime", "list", "-s"); err == nil {
		installed = strings.Contains(out, "com.android.adbkeyboard")
		enabled = installed // ime list -s 只列已启用的
	}
	needSwitch := origIME != "" && !strings.Contains(origIME, "com.android.adbkeyboard")

	if !enabled {
		if !installed {
			apk := filepath.Join(binDir, "ADBKeyboard.apk")
			if _, err := os.Stat(apk); err != nil {
				return "错误: 设备未装 ADBKeyboard 且程序目录缺少 bin/ADBKeyboard.apk，无法中文输入。当前输入: " + text
			}
			if out, err := a.runAdbTimeout(60*time.Second, "-s", serial, "install", "-r", "-g", apk); err != nil {
				return "错误: 自动安装 ADBKeyboard 失败 " + err.Error() + " " + out
			}
		}
		if out, err := a.runAdb("-s", serial, "shell", "ime", "enable", adbKeyboardIME); err != nil {
			return "错误: 启用 ADBKeyboard 失败 " + err.Error() + " " + out
		}
	}
	if needSwitch {
		if out, err := a.runAdb("-s", serial, "shell", "ime", "set", adbKeyboardIME); err != nil {
			return "错误: 切换 ADBKeyboard 失败 " + err.Error() + " " + out
		}
		defer func() {
			// 恢复原输入法，失败不打扰主流程
			_, _ = a.runAdb("-s", serial, "shell", "ime", "set", origIME)
		}()
	} else if origIME == "" {
		// 无默认输入法（少见），用完恢复到可读性无保障，同样切走
		if out, err := a.runAdb("-s", serial, "shell", "ime", "set", adbKeyboardIME); err != nil {
			return "错误: 切换 ADBKeyboard 失败 " + err.Error() + " " + out
		}
	}

	out, err := a.runAdb("-s", serial, "shell", "am", "broadcast",
		"-a", "ADB_INPUT_TEXT", "--es", "msg", text)
	if err != nil {
		return "错误: ADBKeyboard 广播失败 " + err.Error() + " " + out
	}
	if strings.Contains(out, "Exception") {
		return "错误: ADBKeyboard 未生效: " + out
	}
	return "已通过 ADBKeyboard 输入: " + text
}

func isASCII(s string) bool {
	for _, c := range s {
		if c > 127 {
			return false
		}
	}
	return true
}

// agentUIDump 用 uiautomator dump 导出当前屏幕控件树，提取可交互元素及坐标。
// 模型看不到屏幕，靠这个定位点击点。
func (a *App) agentUIDump(serial string) string {
	const dumpPath = "/sdcard/window_dump.xml"
	var xml string
	var lastOut string
	// 最多 3 次：页面忙等 idle、部分 ROM 写文件慢、偶发空产物
	for i := 0; i < 3; i++ {
		_, _ = a.runAdbTimeout(5*time.Second, "-s", serial, "shell", "rm", "-f", dumpPath)
		out, err := a.runAdbTimeout(30*time.Second, "-s", serial, "shell", "uiautomator", "dump", dumpPath)
		lastOut = strings.TrimSpace(out)
		if err != nil || strings.Contains(out, "ERROR") || strings.Contains(out, "could not get idle") {
			// 连续两次 busy 直接放弃：视频/动画页永远进不了 idle
			if i >= 1 {
				break
			}
			time.Sleep(800 * time.Millisecond)
			continue
		}
		// dump 命令返回时文件可能尚未完全落盘，等一拍再读（实测 500ms 稳定）
		time.Sleep(500 * time.Millisecond)
		// exec-out 无 pty，输出不被 \r\n 污染；失败回退 shell cat
		data, err := a.runAdbTimeout(15*time.Second, "-s", serial, "exec-out", "cat", dumpPath)
		if err != nil || !strings.Contains(data, "<node") {
			data, err = a.runAdbTimeout(15*time.Second, "-s", serial, "shell", "cat", dumpPath)
		}
		// 必须包含 <node 才算有效：部分 ROM 忽略路径参数或写延迟，cat 读到空/旧壳
		if err == nil && strings.Contains(data, "<node") {
			xml = data
			break
		}
		time.Sleep(800 * time.Millisecond)
	}
	if strings.TrimSpace(xml) == "" {
		hint := ""
		if strings.Contains(lastOut, "idle") || strings.Contains(lastOut, "ERROR") {
			return "错误: 当前页面正在播放视频/动画，UI 无法进入静止状态，导出失败。" +
				"替代方案：① 用 key_event back 返回上一页再试；② 用 swipe 上滑切换内容；" +
				"③ 用 adb_shell 跑 dumpsys window | grep mCurrentFocus 确认前台应用后改用 am start 直接打开目标页面；" +
				"④ 请用户在投屏窗口手动操作"
		}
		if lastOut != "" {
			hint = "；dump 命令输出: " + firstLine(lastOut)
		}
		return "错误: UI 导出失败，设备上未读到有效层级数据" + hint + "。可重试一次，若持续失败改用 adb_shell 查看当前前台应用（dumpsys window | grep mCurrentFocus）"
	}
	out := agentParseUIDump(xml)
	// 解析出 0 个元素：附诊断信息（常见于应用屏蔽无障碍或空壳层级）
	if strings.HasPrefix(out, "屏幕上没有") {
		compact := strings.TrimSpace(regexp.MustCompile(`\s+`).ReplaceAllString(xml, " "))
		if len(compact) > 400 {
			compact = compact[:400] + "..."
		}
		return out + "\n\n[诊断] 设备返回的原始层级（前 400 字符）:\n" + compact +
			"\n若只有一两个空壳节点，说明前台应用屏蔽了无障碍导出（如设置了 FLAG_SECURE 或鸿蒙安全限制），无法用 ui_dump 操作该页面"
	}
	return out
}

// uiNode 一个可交互控件
type uiNode struct {
	text      string
	desc      string
	class     string
	resID     string
	bounds    [4]int // x1 y1 x2 y2
	clickable bool
}

// agentParseUIDump 从 uiautomator XML 提取可交互节点为紧凑文本列表
func agentParseUIDump(xml string) string {
	var nodes []uiNode
	for _, m := range nodeRe.FindAllStringSubmatch(xml, -1) {
		attr := m[1]
		get := func(k string) string {
			sm := regexp.MustCompile(k + `="([^"]*)"`).FindStringSubmatch(attr)
			if sm == nil {
				return ""
			}
			return sm[1]
		}
		clickable := get("clickable") == "true"
		bm := boundsRe.FindStringSubmatch(get("bounds"))
		if bm == nil {
			continue
		}
		var b [4]int
		for i := 0; i < 4; i++ {
			b[i], _ = strconv.Atoi(bm[i+1])
		}
		w, h := b[2]-b[0], b[3]-b[1]
		if w <= 0 || h <= 0 {
			continue
		}
		// 全屏容器仅保留可点击的；普通节点需可点或有文本/描述
		if w >= 1080 && h >= 2000 && !clickable {
			continue
		}
		if !clickable && get("text") == "" && get("content-desc") == "" {
			continue
		}
		nodes = append(nodes, uiNode{
			text: get("text"), desc: get("content-desc"),
			class: get("class"), resID: get("resource-id"),
			bounds: b, clickable: clickable,
		})
	}
	if len(nodes) == 0 {
		return "屏幕上没有可交互元素（可能是纯文本页面或 WebView 未暴露控件）"
	}
	var b strings.Builder
	b.WriteString(fmt.Sprintf("共 %d 个元素（坐标为中心点，直接用于 tap）：\n", len(nodes)))
	for i, n := range nodes {
		cx, cy := (n.bounds[0]+n.bounds[2])/2, (n.bounds[1]+n.bounds[3])/2
		parts := []string{fmt.Sprintf("[%d]", i)}
		if n.text != "" {
			parts = append(parts, "文本="+n.text)
		}
		if n.desc != "" {
			parts = append(parts, "描述="+n.desc)
		}
		if n.resID != "" && n.resID != "null" {
			parts = append(parts, "id="+n.resID)
		}
		if n.class != "" {
			parts = append(parts, n.class)
		}
		if !n.clickable {
			parts = append(parts, "(不可点)")
		}
		parts = append(parts, fmt.Sprintf("中心=(%d,%d)", cx, cy))
		b.WriteString(strings.Join(parts, " ") + "\n")
	}
	return b.String()
}

var nodeRe = regexp.MustCompile(`(?s)<node([^>]*?)/?>`)
var boundsRe = regexp.MustCompile(`\[(\d+),(\d+)\]\[(\d+),(\d+)\]`)
