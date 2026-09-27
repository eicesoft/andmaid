// Package filemgr 设备文件管理与 APK 安装（adb pull/push/shell 实现）。
package filemgr

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"

	"andmaid/internal/adb"
)

// 设备文件管理 + APK 安装：通过 adb 实现的轻量文件管理器后端。
// 全部走 `adb shell ls -l` / `adb pull` / `adb push`，不依赖设备端额外服务。

// FileEntry 文件管理列表中的一行
type FileEntry struct {
	Name    string    `json:"name"`
	IsDir   bool      `json:"isDir"`
	Size    int64     `json:"size"`
	ModTime time.Time `json:"modTime"`
	Mode    string    `json:"mode"`
}

// DeviceStorage 设备存储卷（内部存储 / SD 卡）
type DeviceStorage struct {
	ID          string `json:"id"`          // 根路径，如 /storage/emulated/0
	Description string `json:"description"` // 显示名，如 内部存储
}

// InstallProgress APK 安装进度事件载荷
type InstallProgress struct {
	Serial  string `json:"serial"`
	File    string `json:"file"`
	Percent int    `json:"percent"` // -1 表示未知（推送阶段 adb 不回报进度）
	Stage   string `json:"stage"`   // pushing / installing / done / error
	Message string `json:"message,omitempty"`
}

// listStorages 列出设备可写存储根目录
func (m *Manager) ListStorages(serial string) ([]DeviceStorage, error) {
	out, err := adb.Exec("-s", serial, "shell", "ls", "/storage")
	if err != nil {
		// 老设备回退 sdcard 路径
		return []DeviceStorage{{ID: "/sdcard", Description: "内部存储"}}, nil
	}
	var storages []DeviceStorage
	for _, line := range strings.Split(out, "\n") {
		name := strings.TrimSpace(strings.TrimRight(line, "\r"))
		if name == "" || name == "adb" || name == "self" {
			continue
		}
		if strings.Contains(name, "No such file") || strings.Contains(name, "Permission denied") {
			continue
		}
		if strings.ContainsAny(name, " :") {
			continue
		}
		desc := "外部存储"
		if name == "emulated" {
			desc = "内部存储"
		}
		storages = append(storages, DeviceStorage{ID: "/storage/" + name, Description: desc})
	}
	if storages == nil {
		storages = []DeviceStorage{{ID: "/sdcard", Description: "内部存储"}}
	}
	return storages, nil
}

// ListFiles 列出设备目录内容（adb shell ls -l）
func (m *Manager) ListFiles(serial string, path string) ([]FileEntry, error) {
	path = strings.TrimSpace(path)
	if path == "" {
		path = "/storage/emulated/0"
	}
	if !strings.HasPrefix(path, "/") {
		return nil, fmt.Errorf("非法路径: %s", path)
	}
	// 逐字节转义路径中特殊字符，防止 shell 注入
	if strings.ContainsAny(path, "\n\r") {
		return nil, fmt.Errorf("路径含非法字符")
	}

	out, err := adb.Exec("-s", serial, "shell", "ls", "-l", path)
	if err != nil {
		msg := strings.TrimSpace(out)
		if msg == "" {
			msg = err.Error()
		}
		if strings.Contains(msg, "No such file or directory") {
			return nil, fmt.Errorf("目录不存在（设备可能已断开）")
		}
		return nil, fmt.Errorf("读取目录失败: %s", msg)
	}

	entries := m.parseLsOutput(out, path)
	sort.Slice(entries, func(i, j int) bool {
		if entries[i].IsDir != entries[j].IsDir {
			return entries[i].IsDir
		}
		return strings.ToLower(entries[i].Name) < strings.ToLower(entries[j].Name)
	})
	return entries, nil
}

// parseLsOutput 解析 `ls -l` 输出。toybox 与 busybox 行格式略有差异，取交集解析。
// 典型行: -rw-rw---- 1 root sdcard_rw 12345 2024-01-02 15:04 file.txt
//
//	drwxrwx--x 5 root sdcard_rw     4096 2024-01-02 15:04 Dir
func (m *Manager) parseLsOutput(out string, basePath string) []FileEntry {
	var entries []FileEntry
	for _, line := range strings.Split(out, "\n") {
		line = strings.TrimRight(line, "\r")
		if line == "" || strings.HasPrefix(line, "total ") || strings.HasPrefix(line, "List of") {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) < 6 {
			continue
		}
		mode := fields[0]
		// 权限位格式校验，避免把 "opendir failed" 等错误行当数据
		if len(mode) < 10 || (mode[0] != '-' && mode[0] != 'd' && mode[0] != 'l') {
			continue
		}
		isDir := mode[0] == 'd'
		// 找时间字段：从后往前定位 "YYYY-MM-DD HH:MM" 或 "MMM DD HH:MM"
		var nameIdx int
		var modTime time.Time
		found := false
		for i := len(fields) - 1; i >= 5; i-- {
			if len(fields[i]) == 5 && fields[i][2] == ':' {
				// toybox: date time；date 可能是 YYYY-MM-DD 或 MMM DD
				dateStr := fields[i-1]
				var t time.Time
				var err error
				if len(dateStr) == 10 && dateStr[4] == '-' {
					t, err = time.ParseInLocation("2006-01-02 15:04", dateStr+" "+fields[i], time.Local)
				} else {
					t, err = time.ParseInLocation("Jan _2 15:04", dateStr+" "+fields[i], time.Local)
				}
				if err == nil {
					modTime = t
					nameIdx = i + 1
					found = true
					break
				}
			}
		}
		if !found {
			// 无时间信息（某些 ls 变体），最后一列是名字
			nameIdx = len(fields)
		}
		if nameIdx >= len(fields) {
			continue
		}
		name := strings.Join(fields[nameIdx:], " ")
		name = strings.Trim(name, "\"")
		if name == "" || name == "." || name == ".." {
			continue
		}
		// size：名字列前第 3 列（size links 时间字段）
		var size int64
		if found && nameIdx-3 >= 1 {
			fmt.Sscanf(fields[nameIdx-3], "%d", &size)
		}
		entries = append(entries, FileEntry{
			Name:    name,
			IsDir:   isDir,
			Size:    size,
			ModTime: modTime,
			Mode:    mode,
		})
	}
	return entries
}

// Mkdir 在设备上新建目录
func (m *Manager) Mkdir(serial string, path string) error {
	if err := validateDevicePath(path); err != nil {
		return err
	}
	out, err := adb.Exec("-s", serial, "shell", "mkdir", "-p", deviceShellQuote(path))
	if err != nil {
		return fmt.Errorf("新建目录失败: %s", strings.TrimSpace(out))
	}
	// mkdir -p 已存在时不报错，静默成功
	return nil
}

// NewFile 在设备上新建空文件
func (m *Manager) NewFile(serial string, path string) error {
	if err := validateDevicePath(path); err != nil {
		return err
	}
	out, err := adb.Exec("-s", serial, "shell", "touch", deviceShellQuote(path))
	if err != nil {
		return fmt.Errorf("新建文件失败: %s", strings.TrimSpace(out))
	}
	return nil
}

// DeleteFiles 删除设备上多个文件/目录（目录递归）
func (m *Manager) DeleteFiles(serial string, paths []string) error {
	if len(paths) == 0 {
		return nil
	}
	args := []string{"-s", serial, "shell", "rm", "-rf"}
	for _, p := range paths {
		if err := validateDevicePath(p); err != nil {
			return err
		}
		args = append(args, deviceShellQuote(p))
	}
	out, err := adb.Exec(args...)
	if err != nil {
		return fmt.Errorf("删除失败: %s", strings.TrimSpace(out))
	}
	return nil
}

// RenameDeviceFile 设备端重命名（同一目录内改名）
func (m *Manager) RenameDeviceFile(serial string, oldPath string, newName string) error {
	if err := validateDevicePath(oldPath); err != nil {
		return err
	}
	newName = strings.TrimSpace(newName)
	if newName == "" || strings.ContainsAny(newName, "/\\\r\n") {
		return fmt.Errorf("名称不合法")
	}
	dir := deviceDir(oldPath)
	newPath := dir + "/" + newName
	out, err := adb.Exec("-s", serial, "shell", "mv", deviceShellQuote(oldPath), deviceShellQuote(newPath))
	if err != nil {
		return fmt.Errorf("重命名失败: %s", strings.TrimSpace(out))
	}
	return nil
}

// CopyDeviceFiles 设备端复制多个文件/目录到目标目录（cp -r）
func (m *Manager) CopyDeviceFiles(serial string, srcs []string, destDir string) error {
	return m.deviceCpMv(serial, "cp -r", srcs, destDir)
}

// MoveDeviceFiles 设备端移动（剪切）多个文件/目录到目标目录
func (m *Manager) MoveDeviceFiles(serial string, srcs []string, destDir string) error {
	return m.deviceCpMv(serial, "mv", srcs, destDir)
}

func (m *Manager) deviceCpMv(serial string, verb string, srcs []string, destDir string) error {
	if len(srcs) == 0 {
		return nil
	}
	if err := validateDevicePath(destDir); err != nil {
		return err
	}
	args := []string{"-s", serial, "shell"}
	args = append(args, strings.Fields(verb)...)
	args = append(args, "-r")
	for _, p := range srcs {
		if err := validateDevicePath(p); err != nil {
			return err
		}
		args = append(args, deviceShellQuote(p))
	}
	args = append(args, deviceShellQuote(destDir))
	out, err := adb.Exec(args...)
	if err != nil {
		return fmt.Errorf("操作失败: %s", strings.TrimSpace(out))
	}
	return nil
}

// DownloadFile 从设备拉取文件到本机（adb pull），弹保存框选目标路径
func (m *Manager) DownloadFile(serial string, devicePath string) (string, error) {
	if err := validateDevicePath(devicePath); err != nil {
		return "", err
	}
	local, err := runtime.SaveFileDialog(m.ctx, runtime.SaveDialogOptions{
		DefaultFilename: filepath.Base(devicePath),
		Title:           "保存到本机",
	})
	if err != nil {
		return "", err
	}
	if local == "" {
		return "", nil // 用户取消
	}
	out, err := adb.Exec("-s", serial, "pull", devicePath, local)
	if err != nil {
		return "", fmt.Errorf("下载失败: %s", strings.TrimSpace(out))
	}
	return local, nil
}

// UploadFiles 弹多选框选本机文件后上传到设备目录（adb push），带进度事件 upload:progress
func (m *Manager) UploadFiles(serial string, deviceDir string) error {
	if err := validateDevicePath(deviceDir); err != nil {
		return err
	}
	files, err := runtime.OpenMultipleFilesDialog(m.ctx, runtime.OpenDialogOptions{
		Title: "选择要上传的文件",
	})
	if err != nil {
		return err
	}
	if len(files) == 0 {
		return nil
	}
	var total int64
	for _, f := range files {
		st, err := os.Stat(f)
		if err == nil && st.Mode().IsRegular() {
			total += st.Size()
		}
	}
	var done int64
	for _, f := range files {
		out, err := adb.Exec("-s", serial, "push", f, deviceDir)
		done += fileSizeOrZero(f)
		if total > 0 {
			m.emit("upload:progress", InstallProgress{
				Serial: serial, File: filepath.Base(f),
				Percent: int(done * 100 / total), Stage: "uploading", Message: filepath.Base(f),
			})
		}
		if err != nil {
			return fmt.Errorf("上传 %s 失败: %s", filepath.Base(f), strings.TrimSpace(out))
		}
	}
	m.emit("upload:progress", InstallProgress{Serial: serial, Percent: 100, Stage: "done"})
	return nil
}

// InstallApk 安装本机 APK 到设备，带进度事件 install:progress。
// adb install 本身不回报进度；先 push 到 /data/local/tmp 显示上传进度，再 pm install。
func (m *Manager) InstallApk(serial string, apkPath string) error {
	apkPath = strings.TrimSpace(apkPath)
	if apkPath == "" {
		return fmt.Errorf("未选择 APK 文件")
	}
	st, err := os.Stat(apkPath)
	if err != nil {
		return fmt.Errorf("读取 APK 失败: %v", err)
	}
	if st.IsDir() || !strings.EqualFold(filepath.Ext(apkPath), ".apk") {
		return fmt.Errorf("请选择 .apk 文件")
	}
	emit := func(stage string, percent int, msg string) {
		m.emit("install:progress", InstallProgress{
			Serial: serial, File: filepath.Base(apkPath), Percent: percent, Stage: stage, Message: msg,
		})
	}

	tmp := "/data/local/tmp/andmaid_install.apk"
	// 覆盖旧临时文件，避免残留大文件占满空间
	_, _ = adb.Exec("-s", serial, "shell", "rm", "-f", tmp)

	emit("pushing", -1, "正在推送 APK…")
	out, err := adb.Exec("-s", serial, "push", apkPath, tmp)
	if err != nil {
		emit("error", 0, strings.TrimSpace(out))
		return fmt.Errorf("推送 APK 失败: %s", strings.TrimSpace(out))
	}
	emit("installing", -1, "正在安装…")
	out, err = adb.Exec("-s", serial, "shell", "pm", "install", "-r", tmp)
	if err != nil {
		msg := strings.TrimSpace(out)
		emit("error", 0, msg)
		_, _ = adb.Exec("-s", serial, "shell", "rm", "-f", tmp)
		return fmt.Errorf("安装失败: %s", firstLine(msg))
	}
	_, _ = adb.Exec("-s", serial, "shell", "rm", "-f", tmp)
	emit("done", 100, "安装成功")
	return nil
}

// PickAndInstallApk 弹文件选择框选 APK 后安装
func (m *Manager) PickAndInstallApk(serial string) error {
	picked, err := runtime.OpenFileDialog(m.ctx, runtime.OpenDialogOptions{
		Title: "选择 APK 文件",
		Filters: []runtime.FileFilter{
			{DisplayName: "APK 安装包 (*.apk)", Pattern: "*.apk"},
		},
	})
	if err != nil {
		return err
	}
	if picked == "" {
		return nil
	}
	return m.InstallApk(serial, picked)
}

// UninstallApp 卸载设备应用
func (m *Manager) UninstallApp(serial string, pkg string) error {
	pkg = strings.TrimSpace(pkg)
	if pkg == "" || strings.ContainsAny(pkg, " \t\r\n") {
		return fmt.Errorf("包名不合法")
	}
	out, err := adb.Exec("-s", serial, "shell", "pm", "uninstall", pkg)
	if err != nil {
		return fmt.Errorf("卸载失败: %s", firstLine(strings.TrimSpace(out)))
	}
	return nil
}

// ---------- 工具 ----------

func validateDevicePath(p string) error {
	p = strings.TrimSpace(p)
	if p == "" || !strings.HasPrefix(p, "/") {
		return fmt.Errorf("路径不合法: %q", p)
	}
	if strings.ContainsAny(p, "\r\n") || strings.Contains(p, "..") {
		return fmt.Errorf("路径不合法: %q", p)
	}
	return nil
}

// deviceShellQuote 设备端 shell 单引号转义
func deviceShellQuote(s string) string {
	return "'" + strings.ReplaceAll(s, "'", `'\''`) + "'"
}

func deviceDir(p string) string {
	i := strings.LastIndexByte(p, '/')
	if i <= 0 {
		return "/"
	}
	return p[:i]
}

func fileSizeOrZero(p string) int64 {
	st, err := os.Stat(p)
	if err != nil {
		return 0
	}
	return st.Size()
}

func firstLine(s string) string {
	if i := strings.IndexByte(s, '\n'); i >= 0 {
		return strings.TrimSpace(s[:i])
	}
	return s
}
