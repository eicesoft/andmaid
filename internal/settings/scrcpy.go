// Package settings 管理应用持久化设置：scrcpy 命令行参数（settings.json）
// 与 AI 服务参数（ai.json）。
package settings

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
)

// ScrcpySettings 对应 scrcpy 命令行参数，按 bin/help.txt 文档分类。
// 指针字段 nil = 未设置（不生成对应命令行参数）。
type ScrcpySettings struct {
	// 基础
	Fullscreen         *bool   `json:"fullscreen"`         // -f, --fullscreen
	StayAwake          *bool   `json:"stayAwake"`          // -w, --stay-awake
	TurnScreenOff      *bool   `json:"turnScreenOff"`      // -S, --turn-screen-off
	ShowTouches        *bool   `json:"showTouches"`        // -t, --show-touches
	DisableScreensaver *bool   `json:"disableScreensaver"` // --disable-screensaver
	AlwaysOnTop        *bool   `json:"alwaysOnTop"`        // --always-on-top
	WindowBorderless   *bool   `json:"windowBorderless"`   // --window-borderless
	WindowX            *string `json:"windowX"`            // --window-x
	WindowY            *string `json:"windowY"`            // --window-y
	WindowWidth        *int    `json:"windowWidth"`        // --window-width
	WindowHeight       *int    `json:"windowHeight"`       // --window-height
	WindowTitle        *string `json:"windowTitle"`        // --window-title

	// 视频
	VideoBitRate          *string  `json:"videoBitRate"`          // -b, --video-bit-rate
	MaxSize               *int     `json:"maxSize"`               // -m, --max-size
	MaxFPS                *float64 `json:"maxFps"`                // --max-fps
	VideoCodec            *string  `json:"videoCodec"`            // --video-codec
	VideoEncoder          *string  `json:"videoEncoder"`          // --video-encoder
	VideoCodecOptions     *string  `json:"videoCodecOptions"`     // --video-codec-options
	VideoBuffer           *int     `json:"videoBuffer"`           // --video-buffer
	VideoSource           *string  `json:"videoSource"`           // --video-source
	DisplayID             *string  `json:"displayId"`             // --display-id
	NewDisplay            *string  `json:"newDisplay"`            // --new-display
	CaptureOrientation    *string  `json:"captureOrientation"`    // --capture-orientation
	DisplayOrientation    *string  `json:"displayOrientation"`    // --display-orientation
	Angle                 *int     `json:"angle"`                 // --angle
	Crop                  *string  `json:"crop"`                  // --crop
	NoVideo               *bool    `json:"noVideo"`               // --no-video
	NoVideoPlayback       *bool    `json:"noVideoPlayback"`       // --no-video-playback
	NoWindow              *bool    `json:"noWindow"`              // --no-window
	NoDownsizeOnError     *bool    `json:"noDownsizeOnError"`     // --no-downsize-on-error
	NoMipmaps             *bool    `json:"noMipmaps"`             // --no-mipmaps
	PrintFps              *bool    `json:"printFps"`              // --print-fps
	RenderDriver          *string  `json:"renderDriver"`          // --render-driver
	DisplayImePolicy      *string  `json:"displayImePolicy"`      // --display-ime-policy
	NoVdDestroyContent    *bool    `json:"noVdDestroyContent"`    // --no-vd-destroy-content
	NoVdSystemDecorations *bool    `json:"noVdSystemDecorations"` // --no-vd-system-decorations

	// 声音
	NoAudio           *bool   `json:"noAudio"`           // --no-audio
	NoAudioPlayback   *bool   `json:"noAudioPlayback"`   // --no-audio-playback
	RequireAudio      *bool   `json:"requireAudio"`      // --require-audio
	AudioBitRate      *string `json:"audioBitRate"`      // --audio-bit-rate
	AudioBuffer       *int    `json:"audioBuffer"`       // --audio-buffer
	AudioOutputBuffer *int    `json:"audioOutputBuffer"` // --audio-output-buffer
	AudioCodec        *string `json:"audioCodec"`        // --audio-codec
	AudioEncoder      *string `json:"audioEncoder"`      // --audio-encoder
	AudioCodecOptions *string `json:"audioCodecOptions"` // --audio-codec-options
	AudioSource       *string `json:"audioSource"`       // --audio-source
	AudioDup          *bool   `json:"audioDup"`          // --audio-dup

	// 输入控制
	NoControl           *bool   `json:"noControl"`           // -n, --no-control
	Keyboard            *string `json:"keyboard"`            // --keyboard
	Mouse               *string `json:"mouse"`               // --mouse
	Gamepad             *string `json:"gamepad"`             // --gamepad
	MouseBind           *string `json:"mouseBind"`           // --mouse-bind
	OTG                 *bool   `json:"otg"`                 // --otg
	PreferText          *bool   `json:"preferText"`          // --prefer-text
	RawKeyEvents        *bool   `json:"rawKeyEvents"`        // --raw-key-events
	NoKeyRepeat         *bool   `json:"noKeyRepeat"`         // --no-key-repeat
	NoMouseHover        *bool   `json:"noMouseHover"`        // --no-mouse-hover
	LegacyPaste         *bool   `json:"legacyPaste"`         // --legacy-paste
	NoClipboardAutosync *bool   `json:"noClipboardAutosync"` // --no-clipboard-autosync
	ShortcutMod         *string `json:"shortcutMod"`         // --shortcut-mod

	// 录制
	Record            *string `json:"record"`            // -r, --record
	RecordFormat      *string `json:"recordFormat"`      // --record-format
	RecordOrientation *string `json:"recordOrientation"` // --record-orientation
	PushTarget        *string `json:"pushTarget"`        // --push-target

	// 连接
	Serial          *string `json:"serial"`          // -s, --serial（由打开投屏时的设备决定，一般不用）
	SelectUsb       *bool   `json:"selectUsb"`       // -d, --select-usb
	SelectTcpip     *bool   `json:"selectTcpip"`     // -e, --select-tcpip
	TCPIP           *string `json:"tcpip"`           // --tcpip
	Port            *string `json:"port"`            // -p, --port
	TunnelHost      *string `json:"tunnelHost"`      // --tunnel-host
	TunnelPort      *int    `json:"tunnelPort"`      // --tunnel-port
	ForceAdbForward *bool   `json:"forceAdbForward"` // --force-adb-forward
	KillAdbOnClose  *bool   `json:"killAdbOnClose"`  // --kill-adb-on-close

	// 高级
	Verbosity        *string `json:"verbosity"`        // -V, --verbosity
	ScreenOffTimeout *int    `json:"screenOffTimeout"` // --screen-off-timeout
	PowerOffOnClose  *bool   `json:"powerOffOnClose"`  // --power-off-on-close
	NoPowerOn        *bool   `json:"noPowerOn"`        // --no-power-on
	NoCleanup        *bool   `json:"noCleanup"`        // --no-cleanup
	PauseOnExit      *string `json:"pauseOnExit"`      // --pause-on-exit
	StartApp         *string `json:"startApp"`         // --start-app
	TimeLimit        *int    `json:"timeLimit"`        // --time-limit
}

var (
	mu       sync.Mutex
	filePath string
)

func path() string {
	if filePath != "" {
		return filePath
	}
	dir, err := os.UserConfigDir()
	if err != nil {
		dir = "."
	}
	p := filepath.Join(dir, "andmaid", "settings.json")
	filePath = p
	return p
}

// Load 读取设置，不存在时返回默认值（全空）。
func Load() (*ScrcpySettings, error) {
	s := &ScrcpySettings{}
	data, err := os.ReadFile(path())
	if err != nil {
		if os.IsNotExist(err) {
			return s, nil
		}
		return nil, err
	}
	if err := json.Unmarshal(data, s); err != nil {
		return nil, fmt.Errorf("设置文件解析失败: %v", err)
	}
	return s, nil
}

// Save 原子写入设置
func Save(s *ScrcpySettings) error {
	mu.Lock()
	defer mu.Unlock()

	p := path()
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

// Reset 恢复默认（删除设置文件）
func Reset() error {
	mu.Lock()
	defer mu.Unlock()
	return os.Remove(path())
}

// QuoteArg Windows 命令行参数转义
func QuoteArg(s string) string {
	if s == "" {
		return `""`
	}
	if !strings.ContainsAny(s, " \t\"") {
		return s
	}
	var b strings.Builder
	b.WriteByte('"')
	slashes := 0
	for _, c := range s {
		switch c {
		case '\\':
			slashes++
			b.WriteByte('\\')
		case '"':
			for i := 0; i < slashes*2+1; i++ {
				b.WriteByte('\\')
			}
			slashes = 0
			b.WriteByte('"')
		default:
			slashes = 0
			b.WriteRune(c)
		}
	}
	for i := 0; i < slashes*2; i++ {
		b.WriteByte('\\')
	}
	b.WriteByte('"')
	return b.String()
}

func appendFlag(args []string, v *bool, flag string) []string {
	if v != nil && *v {
		return append(args, flag)
	}
	return args
}

func appendValue[T int | float64 | string](args []string, v *T, flag string) []string {
	if v == nil {
		return args
	}
	switch x := any(v).(type) {
	case *int:
		return append(args, flag+"="+strconv.Itoa(*x))
	case *float64:
		return append(args, flag+"="+strconv.FormatFloat(*x, 'f', -1, 64))
	case *string:
		s := strings.TrimSpace(*x)
		if s == "" {
			return args
		}
		return append(args, flag+"="+s)
	}
	return args
}

// BuildArgs 按设置生成 scrcpy 命令行参数（不含 -s serial，由调用方加）
// skipWindowOpts=true 时（内嵌模式）跳过窗口定位/标题/边框/全屏/置顶等参数，由嵌入逻辑自行控制
func (s *ScrcpySettings) BuildArgs(skipWindowOpts ...bool) []string {
	args := []string{}
	skipWin := len(skipWindowOpts) > 0 && skipWindowOpts[0]

	// 基础
	if !skipWin {
		args = appendFlag(args, s.Fullscreen, "--fullscreen")
		args = appendValue(args, s.WindowX, "--window-x")
		args = appendValue(args, s.WindowY, "--window-y")
		args = appendValue(args, s.WindowWidth, "--window-width")
		args = appendValue(args, s.WindowHeight, "--window-height")
		args = appendValue(args, s.WindowTitle, "--window-title")
		args = appendFlag(args, s.AlwaysOnTop, "--always-on-top")
		args = appendFlag(args, s.WindowBorderless, "--window-borderless")
	}
	args = appendFlag(args, s.StayAwake, "--stay-awake")
	args = appendFlag(args, s.TurnScreenOff, "--turn-screen-off")
	args = appendFlag(args, s.ShowTouches, "--show-touches")
	args = appendFlag(args, s.DisableScreensaver, "--disable-screensaver")

	// 视频
	args = appendValue(args, s.VideoBitRate, "--video-bit-rate")
	args = appendValue(args, s.MaxSize, "--max-size")
	args = appendValue(args, s.MaxFPS, "--max-fps")
	args = appendValue(args, s.VideoCodec, "--video-codec")
	args = appendValue(args, s.VideoEncoder, "--video-encoder")
	args = appendValue(args, s.VideoCodecOptions, "--video-codec-options")
	args = appendValue(args, s.VideoBuffer, "--video-buffer")
	args = appendValue(args, s.VideoSource, "--video-source")
	args = appendValue(args, s.DisplayID, "--display-id")
	args = appendValue(args, s.NewDisplay, "--new-display")
	args = appendValue(args, s.CaptureOrientation, "--capture-orientation")
	args = appendValue(args, s.DisplayOrientation, "--display-orientation")
	args = appendValue(args, s.Angle, "--angle")
	args = appendValue(args, s.Crop, "--crop")
	args = appendFlag(args, s.NoVideo, "--no-video")
	args = appendFlag(args, s.NoVideoPlayback, "--no-video-playback")
	args = appendFlag(args, s.NoWindow, "--no-window")
	args = appendFlag(args, s.NoDownsizeOnError, "--no-downsize-on-error")
	args = appendFlag(args, s.NoMipmaps, "--no-mipmaps")
	args = appendFlag(args, s.PrintFps, "--print-fps")
	args = appendValue(args, s.RenderDriver, "--render-driver")
	args = appendValue(args, s.DisplayImePolicy, "--display-ime-policy")
	args = appendFlag(args, s.NoVdDestroyContent, "--no-vd-destroy-content")
	args = appendFlag(args, s.NoVdSystemDecorations, "--no-vd-system-decorations")

	// 声音
	args = appendFlag(args, s.NoAudio, "--no-audio")
	args = appendFlag(args, s.NoAudioPlayback, "--no-audio-playback")
	args = appendFlag(args, s.RequireAudio, "--require-audio")
	args = appendValue(args, s.AudioBitRate, "--audio-bit-rate")
	args = appendValue(args, s.AudioBuffer, "--audio-buffer")
	args = appendValue(args, s.AudioOutputBuffer, "--audio-output-buffer")
	args = appendValue(args, s.AudioCodec, "--audio-codec")
	args = appendValue(args, s.AudioEncoder, "--audio-encoder")
	args = appendValue(args, s.AudioCodecOptions, "--audio-codec-options")
	args = appendValue(args, s.AudioSource, "--audio-source")
	args = appendFlag(args, s.AudioDup, "--audio-dup")

	// 输入控制
	args = appendFlag(args, s.NoControl, "--no-control")
	args = appendValue(args, s.Keyboard, "--keyboard")
	args = appendValue(args, s.Mouse, "--mouse")
	args = appendValue(args, s.Gamepad, "--gamepad")
	args = appendValue(args, s.MouseBind, "--mouse-bind")
	args = appendFlag(args, s.OTG, "--otg")
	args = appendFlag(args, s.PreferText, "--prefer-text")
	args = appendFlag(args, s.RawKeyEvents, "--raw-key-events")
	args = appendFlag(args, s.NoKeyRepeat, "--no-key-repeat")
	args = appendFlag(args, s.NoMouseHover, "--no-mouse-hover")
	args = appendFlag(args, s.LegacyPaste, "--legacy-paste")
	args = appendFlag(args, s.NoClipboardAutosync, "--no-clipboard-autosync")
	args = appendValue(args, s.ShortcutMod, "--shortcut-mod")

	// 录制
	if s.Record != nil && strings.TrimSpace(*s.Record) != "" {
		args = append(args, "--record="+QuoteArg(strings.TrimSpace(*s.Record)))
	}
	args = appendValue(args, s.RecordFormat, "--record-format")
	args = appendValue(args, s.RecordOrientation, "--record-orientation")
	args = appendValue(args, s.PushTarget, "--push-target")

	// 连接
	args = appendFlag(args, s.SelectUsb, "--select-usb")
	args = appendFlag(args, s.SelectTcpip, "--select-tcpip")
	if s.TCPIP != nil && strings.TrimSpace(*s.TCPIP) != "" {
		args = append(args, "--tcpip="+strings.TrimSpace(*s.TCPIP))
	}
	args = appendValue(args, s.Port, "--port")
	args = appendValue(args, s.TunnelHost, "--tunnel-host")
	args = appendValue(args, s.TunnelPort, "--tunnel-port")
	args = appendFlag(args, s.ForceAdbForward, "--force-adb-forward")
	args = appendFlag(args, s.KillAdbOnClose, "--kill-adb-on-close")

	// 高级
	args = appendValue(args, s.Verbosity, "--verbosity")
	args = appendValue(args, s.ScreenOffTimeout, "--screen-off-timeout")
	args = appendFlag(args, s.PowerOffOnClose, "--power-off-on-close")
	args = appendFlag(args, s.NoPowerOn, "--no-power-on")
	args = appendFlag(args, s.NoCleanup, "--no-cleanup")
	args = appendValue(args, s.PauseOnExit, "--pause-on-exit")
	args = appendValue(args, s.StartApp, "--start-app")
	args = appendValue(args, s.TimeLimit, "--time-limit")

	return args
}
