import React from 'react'
import {
  Button,
  Card,
  Divider,
  Input,
  InputNumber,
  Message,
  Select,
  Space,
  Switch,
  Tabs,
  Tooltip,
  Typography,
} from '@arco-design/web-react'
import { IconRefresh, IconSave } from '@arco-design/web-react/icon'
import { GetSettings, ResetSettings, SaveSettings } from '../../wailsjs/go/main/App'
import PageHeader from '../components/PageHeader'

const { Text } = Typography

// ---------- 类型 ----------
interface Settings {
  // 基础
  fullscreen?: boolean
  stayAwake?: boolean
  turnScreenOff?: boolean
  showTouches?: boolean
  disableScreensaver?: boolean
  alwaysOnTop?: boolean
  windowBorderless?: boolean
  windowX?: string
  windowY?: string
  windowWidth?: number | null
  windowHeight?: number | null
  windowTitle?: string
  // 视频
  videoBitRate?: string
  maxSize?: number | null
  maxFps?: number | null
  videoCodec?: string
  videoEncoder?: string
  videoCodecOptions?: string
  videoBuffer?: number | null
  videoSource?: string
  displayId?: string
  newDisplay?: string
  captureOrientation?: string
  displayOrientation?: string
  angle?: number | null
  crop?: string
  noVideo?: boolean
  noVideoPlayback?: boolean
  noWindow?: boolean
  noDownsizeOnError?: boolean
  noMipmaps?: boolean
  printFps?: boolean
  renderDriver?: string
  displayImePolicy?: string
  noVdDestroyContent?: boolean
  noVdSystemDecorations?: boolean
  // 声音
  noAudio?: boolean
  noAudioPlayback?: boolean
  requireAudio?: boolean
  audioBitRate?: string
  audioBuffer?: number | null
  audioOutputBuffer?: number | null
  audioCodec?: string
  audioEncoder?: string
  audioCodecOptions?: string
  audioSource?: string
  audioDup?: boolean
  // 输入
  noControl?: boolean
  keyboard?: string
  mouse?: string
  gamepad?: string
  mouseBind?: string
  otg?: boolean
  preferText?: boolean
  rawKeyEvents?: boolean
  noKeyRepeat?: boolean
  noMouseHover?: boolean
  legacyPaste?: boolean
  noClipboardAutosync?: boolean
  shortcutMod?: string
  // 录制
  record?: string
  recordFormat?: string
  recordOrientation?: string
  pushTarget?: string
  // 连接
  selectUsb?: boolean
  selectTcpip?: boolean
  tcpip?: string
  port?: string
  tunnelHost?: string
  tunnelPort?: number | null
  forceAdbForward?: boolean
  killAdbOnClose?: boolean
  // 高级
  verbosity?: string
  screenOffTimeout?: number | null
  powerOffOnClose?: boolean
  noPowerOn?: boolean
  noCleanup?: boolean
  pauseOnExit?: string
  startApp?: string
  timeLimit?: number | null
}

// ---------- 通用控件 ----------
const Row: React.FC<{
  label: string
  hint?: string
  children: React.ReactNode
}> = ({ label, hint, children }) => (
  <div style={{ display: 'flex', alignItems: 'center', minHeight: 40, gap: 12 }}>
    <div style={{ width: 150, flexShrink: 0 }}>
      <Text>{label}</Text>
      {hint && (
        <Tooltip content={hint}>
          <Text type="secondary" style={{ marginLeft: 4, cursor: 'help' }}>
            ?
          </Text>
        </Tooltip>
      )}
    </div>
    <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
  </div>
)

const SwitchRow: React.FC<{
  label: string
  hint?: string
  value?: boolean
  onChange: (v: boolean) => void
}> = ({ label, hint, value, onChange }) => (
  <Row label={label} hint={hint}>
    <Switch checked={!!value} onChange={onChange} />
  </Row>
)

const TextRow: React.FC<{
  label: string
  hint?: string
  placeholder?: string
  value?: string
  onChange: (v: string) => void
}> = ({ label, hint, placeholder, value, onChange }) => (
  <Row label={label} hint={hint}>
    <Input
      value={value ?? ''}
      placeholder={placeholder}
      allowClear
      onChange={onChange}
    />
  </Row>
)

const SelectRow: React.FC<{
  label: string
  hint?: string
  options: string[]
  value?: string
  onChange: (v: string) => void
}> = ({ label, hint, options, value, onChange }) => (
  <Row label={label} hint={hint}>
    <Select
      value={value || undefined}
      placeholder="默认"
      allowClear
      style={{ width: '100%' }}
      onChange={onChange}
    >
      {options.map((o) => (
        <Select.Option key={o} value={o}>
          {o}
        </Select.Option>
      ))}
    </Select>
  </Row>
)

const NumRow: React.FC<{
  label: string
  hint?: string
  min?: number
  max?: number
  step?: number
  value?: number | null
  onChange: (v: number | null) => void
}> = ({ label, hint, min, max, step, value, onChange }) => (
  <Row label={label} hint={hint}>
    <InputNumber
      value={value ?? undefined}
      min={min}
      max={max}
      step={step}
      placeholder="默认"
      style={{ width: '100%' }}
      onChange={onChange}
    />
  </Row>
)

const Section: React.FC<{ title: string }> = ({ title }) => (
  <Divider orientation="left" style={{ marginTop: 8 }}>
    {title}
  </Divider>
)

// ---------- 选项常量（来源 bin/help.txt）----------
const KBM_MODES = ['disabled', 'sdk', 'uhid', 'aoa']
const GAMEPAD_MODES = ['disabled', 'uhid', 'aoa']
const ORIENTATIONS = ['0', '90', '180', '270', 'flip0', 'flip90', 'flip180', 'flip270']
const REC_ORIENTATIONS = ['0', '90', '180', '270']
const AUDIO_SOURCES = [
  'output', 'playback', 'mic', 'mic-unprocessed', 'mic-camcorder',
  'mic-voice-recognition', 'mic-voice-communication',
  'voice-call', 'voice-call-uplink', 'voice-call-downlink', 'voice-performance',
]
const VIDEO_CODECS = ['h264', 'h265', 'av1']
const AUDIO_CODECS = ['opus', 'aac', 'flac', 'raw']
const REC_FORMATS = ['mp4', 'mkv', 'm4a', 'mka', 'opus', 'aac', 'flac', 'wav']
const RENDER_DRIVERS = ['direct3d', 'opengl', 'opengles2', 'opengles', 'metal', 'software']
const VERBOSITY = ['verbose', 'debug', 'info', 'warn', 'error']
const IME_POLICIES = ['local', 'fallback', 'hide']
const SHORTCUT_MOD_OPTIONS = ['lctrl', 'rctrl', 'lalt', 'ralt', 'lsuper', 'rsuper']

// ---------- 页面 ----------
const SettingsPage: React.FC = () => {
  const [s, setS] = React.useState<Settings>({})
  const [loading, setLoading] = React.useState(false)
  const [saving, setSaving] = React.useState(false)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const v = await GetSettings()
      setS((v as Settings) ?? {})
    } catch (e: any) {
      Message.error(`读取设置失败: ${e?.message ?? e}`)
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    load()
  }, [load])

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) =>
    setS((prev) => ({ ...prev, [k]: v }))

  const save = async () => {
    setSaving(true)
    try {
      await SaveSettings(s as any)
      Message.success('设置已保存')
    } catch (e: any) {
      Message.error(`保存失败: ${e?.message ?? e}`)
    } finally {
      setSaving(false)
    }
  }

  const reset = async () => {
    try {
      await ResetSettings()
      setS({})
      Message.success('已恢复默认')
    } catch (e: any) {
      Message.error(`重置失败: ${e?.message ?? e}`)
    }
  }

  const sw = (k: keyof Settings) => (v: boolean) => set(k, v as any)
  const tx = (k: keyof Settings) => (v: string) => set(k, v)
  const sel = (k: keyof Settings) => (v: string) => set(k, v)
  const num = (k: keyof Settings) => (v: number | null) => set(k, v)

  return (
    <Card loading={loading} className="settings-card">
      <PageHeader
        title={
          <Space size={8}>
            设置
            <Tooltip content="恢复默认">
              <Button icon={<IconRefresh />} onClick={reset} />
            </Tooltip>
            <Tooltip content="保存设置">
              <Button icon={<IconSave />} loading={saving} onClick={save} />
            </Tooltip>
          </Space>
        }
      />

      <Tabs className="settings-grid" destroyOnHide={false} lazyload>
        {/* ================= 基础 ================= */}
        <Tabs.TabPane key="basic" title="基础">
          <Section title="设备行为" />
          <SwitchRow label="保持设备唤醒" hint="-w, --stay-awake：投屏期间设备连接时保持不休眠" value={s.stayAwake} onChange={sw('stayAwake')} />
          <SwitchRow label="关闭设备屏幕" hint="-S, --turn-screen-off：启动后立即关闭设备屏幕" value={s.turnScreenOff} onChange={sw('turnScreenOff')} />
          <SwitchRow label="显示触摸点" hint="-t, --show-touches：显示物理触摸点（退出时恢复）" value={s.showTouches} onChange={sw('showTouches')} />
          <SwitchRow label="禁用屏保" hint="--disable-screensaver：投屏期间禁用电脑屏保" value={s.disableScreensaver} onChange={sw('disableScreensaver')} />

          <Section title="窗口" />
          <SwitchRow label="全屏启动" hint="-f, --fullscreen" value={s.fullscreen} onChange={sw('fullscreen')} />
          <SwitchRow label="窗口置顶" hint="--always-on-top" value={s.alwaysOnTop} onChange={sw('alwaysOnTop')} />
          <SwitchRow label="无边框窗口" hint="--window-borderless" value={s.windowBorderless} onChange={sw('windowBorderless')} />
          <TextRow label="窗口标题" hint="--window-title，留空使用设备序列号" placeholder="默认为设备序列号" value={s.windowTitle} onChange={tx('windowTitle')} />
          <TextRow label="窗口 X 位置" hint="--window-x，默认 auto" placeholder="auto" value={s.windowX} onChange={tx('windowX')} />
          <TextRow label="窗口 Y 位置" hint="--window-y，默认 auto" placeholder="auto" value={s.windowY} onChange={tx('windowY')} />
          <NumRow label="窗口宽度" hint="--window-width，0 为自动" min={0} value={s.windowWidth ?? null} onChange={num('windowWidth')} />
          <NumRow label="窗口高度" hint="--window-height，0 为自动" min={0} value={s.windowHeight ?? null} onChange={num('windowHeight')} />
        </Tabs.TabPane>

        {/* ================= 视频 ================= */}
        <Tabs.TabPane key="video" title="视频">
          <Section title="编码" />
          <TextRow label="视频码率" hint="-b, --video-bit-rate，支持 K/M 后缀，默认 8M" placeholder="8M" value={s.videoBitRate} onChange={tx('videoBitRate')} />
          <NumRow label="最大尺寸" hint="-m, --max-size：限制宽高，0 为不限" min={0} value={s.maxSize ?? null} onChange={num('maxSize')} />
          <NumRow label="最大帧率" hint="--max-fps，Android 10+ 官方支持" min={1} max={120} value={s.maxFps ?? null} onChange={num('maxFps')} />
          <SelectRow label="视频编码" hint="--video-codec" options={VIDEO_CODECS} value={s.videoCodec} onChange={sel('videoCodec')} />
          <TextRow label="视频编码器" hint="--video-encoder，具体 MediaCodec 编码器名（--list-encoders 可列出）" placeholder="默认" value={s.videoEncoder} onChange={tx('videoEncoder')} />
          <TextRow label="编码器选项" hint="--video-codec-options，key[:type]=value[,...]，详见 Android MediaFormat 文档" placeholder="如 i-frame-interval=10" value={s.videoCodecOptions} onChange={tx('videoCodecOptions')} />
          <NumRow label="视频缓冲(ms)" hint="--video-buffer，加延迟抗抖动，默认 0" min={0} value={s.videoBuffer ?? null} onChange={num('videoBuffer')} />
          <SelectRow label="渲染驱动" hint="--render-driver：direct3d/opengl/opengles2/opengles/metal/software" options={RENDER_DRIVERS} value={s.renderDriver} onChange={sel('renderDriver')} />

          <Section title="画面来源" />
          <SelectRow label="视频来源" hint="--video-source：display 屏幕或 camera 摄像头（摄像头需 Android 12+）" options={['display', 'camera']} value={s.videoSource} onChange={sel('videoSource')} />
          <TextRow label="显示器 ID" hint="--display-id，默认 0（--list-displays 可列出）" placeholder="0" value={s.displayId} onChange={tx('displayId')} />
          <TextRow label="新建虚拟显示器" hint='--new-display，如 1920x1080、1920x1080/420、/240（仅密度）' placeholder="如 1920x1080/420" value={s.newDisplay} onChange={tx('newDisplay')} />
          <TextRow label="裁剪区域" hint="--crop，格式 width:height:x:y，按设备自然方向" placeholder="如 1080:1920:0:0" value={s.crop} onChange={tx('crop')} />

          <Section title="方向" />
          <SelectRow label="采集方向" hint="--capture-orientation，可加 @ 前缀锁定旋转（如 @90 或 @）" options={ORIENTATIONS} value={s.captureOrientation} onChange={sel('captureOrientation')} />
          <SelectRow label="显示方向" hint="--display-orientation" options={ORIENTATIONS} value={s.displayOrientation} onChange={sel('displayOrientation')} />
          <NumRow label="旋转角度" hint="--angle：顺时针旋转视频内容（度）" min={0} max={360} value={s.angle ?? null} onChange={num('angle')} />

          <Section title="关闭项" />
          <SwitchRow label="禁用视频转发" hint="--no-video" value={s.noVideo} onChange={sw('noVideo')} />
          <SwitchRow label="禁用视频播放" hint="--no-video-playback：不在本机播放画面" value={s.noVideoPlayback} onChange={sw('noVideoPlayback')} />
          <SwitchRow label="无窗口" hint="--no-window，隐含 --no-video-playback" value={s.noWindow} onChange={sw('noWindow')} />
          <SwitchRow label="出错不降清晰度" hint="--no-downsize-on-error：MediaCodec 出错时不自动降低分辨率重试" value={s.noDownsizeOnError} onChange={sw('noDownsizeOnError')} />
          <SwitchRow label="禁用 mipmap" hint="--no-mipmaps：禁用缩小画面时的 mipmap 生成" value={s.noMipmaps} onChange={sw('noMipmaps')} />
          <SwitchRow label="打印 FPS" hint="--print-fps：控制台输出帧率（MOD+i 可随时开关）" value={s.printFps} onChange={sw('printFps')} />
          <SelectRow label="IME 显示策略" hint="--display-ime-policy（虚拟显示器）" options={IME_POLICIES} value={s.displayImePolicy} onChange={sel('displayImePolicy')} />
          <SwitchRow label="虚拟屏保留内容" hint="--no-vd-destroy-content：关闭虚拟显示器时应用移回主屏而非销毁" value={s.noVdDestroyContent} onChange={sw('noVdDestroyContent')} />
          <SwitchRow label="虚拟屏禁用系统装饰" hint="--no-vd-system-decorations" value={s.noVdSystemDecorations} onChange={sw('noVdSystemDecorations')} />
        </Tabs.TabPane>

        {/* ================= 声音 ================= */}
        <Tabs.TabPane key="audio" title="声音">
          <Section title="开关" />
          <SwitchRow label="禁用音频转发" hint="--no-audio" value={s.noAudio} onChange={sw('noAudio')} />
          <SwitchRow label="禁用音频播放" hint="--no-audio-playback：不在本机播放声音" value={s.noAudioPlayback} onChange={sw('noAudioPlayback')} />
          <SwitchRow label="音频失败即退出" hint="--require-audio：默认音频采集失败时仅静音视频，开启后直接失败" value={s.requireAudio} onChange={sw('requireAudio')} />
          <SwitchRow label="音频复制" hint="--audio-dup：设备继续播放的同时转发音频，仅 --audio-source=playback 时可用" value={s.audioDup} onChange={sw('audioDup')} />

          <Section title="编码与来源" />
          <TextRow label="音频码率" hint="--audio-bit-rate，支持 K/M 后缀，默认 128K" placeholder="128K" value={s.audioBitRate} onChange={tx('audioBitRate')} />
          <SelectRow label="音频编码" hint="--audio-codec" options={AUDIO_CODECS} value={s.audioCodec} onChange={sel('audioCodec')} />
          <TextRow label="音频编码器" hint="--audio-encoder，具体 MediaCodec 编码器名" placeholder="默认" value={s.audioEncoder} onChange={tx('audioEncoder')} />
          <TextRow label="编码器选项" hint="--audio-codec-options，key[:type]=value[,...]" placeholder="如 bitrate=64000" value={s.audioCodecOptions} onChange={tx('audioCodecOptions')} />
          <SelectRow label="音频来源" hint="--audio-source：output 整体输出 / playback 应用播放（应用可拒绝）/ mic 及各类麦克风 / voice-call 通话" options={AUDIO_SOURCES} value={s.audioSource} onChange={sel('audioSource')} />

          <Section title="缓冲" />
          <NumRow label="音频缓冲(ms)" hint="--audio-buffer：低延迟但易卡顿，默认 50" min={0} value={s.audioBuffer ?? null} onChange={num('audioBuffer')} />
          <NumRow label="输出缓冲(ms)" hint="--audio-output-buffer：出现机器人音时调大（如 10），默认 5，其余情况勿改" min={0} value={s.audioOutputBuffer ?? null} onChange={num('audioOutputBuffer')} />
        </Tabs.TabPane>

        {/* ================= 输入控制 ================= */}
        <Tabs.TabPane key="input" title="输入控制">
          <Section title="总开关" />
          <SwitchRow label="只读模式" hint="-n, --no-control：镜像画面但禁止控制设备" value={s.noControl} onChange={sw('noControl')} />
          <SwitchRow label="OTG 模式" hint="--otg：模拟物理键鼠，无需 USB 调试，不镜像画面，仅 USB" value={s.otg} onChange={sw('otg')} />

          <Section title="输入方式" />
          <SelectRow label="键盘" hint="--keyboard：sdk 系统 API / uhid 模拟物理键盘 / aoa AOAv2 协议（仅 USB）；uhid/aoa 需在设备上配置键盘布局" options={KBM_MODES} value={s.keyboard} onChange={sel('keyboard')} />
          <SelectRow label="鼠标" hint="--mouse：sdk / uhid / aoa / disabled" options={KBM_MODES} value={s.mouse} onChange={sel('mouse')} />
          <SelectRow label="手柄" hint="--gamepad：disabled / uhid / aoa" options={GAMEPAD_MODES} value={s.gamepad} onChange={sel('gamepad')} />
          <TextRow label="鼠标键绑定" hint="--mouse-bind：4 字符序列[:次序列]，字符 +-=bhsn，默认 sdk 为 bhsn:++++，aoa/uhid 为 ++++:bhsn" placeholder="bhsn:++++" value={s.mouseBind} onChange={tx('mouseBind')} />

          <Section title="按键行为" />
          <SwitchRow label="文本注入优先" hint="--prefer-text：字母与空格按文本注入，避免组合键问题，但游戏 WASD 行为会变" value={s.preferText} onChange={sw('preferText')} />
          <SwitchRow label="原始按键事件" hint="--raw-key-events" value={s.rawKeyEvents} onChange={sw('rawKeyEvents')} />
          <SwitchRow label="禁用按键重复" hint="--no-key-repeat：长按不重复发送按键事件" value={s.noKeyRepeat} onChange={sw('noKeyRepeat')} />
          <SwitchRow label="禁用鼠标悬停" hint="--no-mouse-hover：不转发无点击的鼠标移动" value={s.noMouseHover} onChange={sw('noMouseHover')} />

          <Section title="剪贴板" />
          <SwitchRow label="兼容粘贴" hint="--legacy-paste：Ctrl+v 时以按键事件序列注入电脑剪贴板文本（部分设备异常时的变通）" value={s.legacyPaste} onChange={sw('legacyPaste')} />
          <SwitchRow label="禁用剪贴板自动同步" hint="--no-clipboard-autosync" value={s.noClipboardAutosync} onChange={sw('noClipboardAutosync')} />

          <Section title="快捷键" />
          <SelectRow label="快捷键修饰键" hint="--shortcut-mod：lctrl/rctrl/lalt/ralt/lsuper/rsuper，多组用英文逗号分隔，默认 lalt,lsuper" options={SHORTCUT_MOD_OPTIONS} value={s.shortcutMod} onChange={sel('shortcutMod')} />
        </Tabs.TabPane>

        {/* ================= 录制 ================= */}
        <Tabs.TabPane key="record" title="录制">
          <Section title="录制" />
          <TextRow label="录制文件路径" hint="-r, --record：录制到文件（.mp4/.mkv/.m4a/.mka/.opus/.aac/.flac/.wav）" placeholder="如 D:\\record.mp4" value={s.record} onChange={tx('record')} />
          <SelectRow label="录制格式" hint="--record-format：留空按文件扩展名推断" options={REC_FORMATS} value={s.recordFormat} onChange={sel('recordFormat')} />
          <SelectRow label="录制方向" hint="--record-orientation" options={REC_ORIENTATIONS} value={s.recordOrientation} onChange={sel('recordOrientation')} />
          <Section title="文件推送" />
          <TextRow label="推送目录" hint="--push-target：拖放文件推送到设备的目录，默认 /sdcard/Download/" placeholder="/sdcard/Download/" value={s.pushTarget} onChange={tx('pushTarget')} />
        </Tabs.TabPane>

        {/* ================= 连接 ================= */}
        <Tabs.TabPane key="network" title="连接">
          <Section title="设备选择" />
          <SwitchRow label="指定 USB 设备" hint="-d, --select-usb：仅有一台 USB 设备时使用" value={s.selectUsb} onChange={sw('selectUsb')} />
          <SwitchRow label="指定 TCP/IP 设备" hint="-e, --select-tcpip：仅有一台 TCP/IP 设备时使用" value={s.selectTcpip} onChange={sw('selectTcpip')} />
          <TextRow label="TCP/IP 地址" hint='--tcpip[=[+]ip[:port]]：填 ip:port 直接连接；+ip 强制重连；留空自动查找当前设备 IP 并启用 TCP/IP 模式' placeholder="如 192.168.1.100:5555" value={s.tcpip} onChange={tx('tcpip')} />

          <Section title="端口与隧道" />
          <TextRow label="本地监听端口" hint="-p, --port，格式 port[:port]，默认 27183:27199" placeholder="27183:27199" value={s.port} onChange={tx('port')} />
          <TextRow label="隧道主机" hint="--tunnel-host，默认 localhost，设置后自动启用 --force-adb-forward" placeholder="localhost" value={s.tunnelHost} onChange={tx('tunnelHost')} />
          <NumRow label="隧道端口" hint="--tunnel-port，0 为不强制" min={0} max={65535} value={s.tunnelPort ?? null} onChange={num('tunnelPort')} />
          <SwitchRow label="强制 adb 转发" hint="--force-adb-forward：不尝试 adb reverse" value={s.forceAdbForward} onChange={sw('forceAdbForward')} />
          <SwitchRow label="退出时关闭 adb" hint="--kill-adb-on-close" value={s.killAdbOnClose} onChange={sw('killAdbOnClose')} />
        </Tabs.TabPane>

        {/* ================= 高级 ================= */}
        <Tabs.TabPane key="advanced" title="高级">
          <Section title="日志与退出" />
          <SelectRow label="日志级别" hint="-V, --verbosity" options={VERBOSITY} value={s.verbosity} onChange={sel('verbosity')} />
          <SelectRow label="退出暂停" hint="--pause-on-exit：true 总是暂停 / false 从不 / if-error 仅出错时（防终端自动关闭）" options={['true', 'false', 'if-error']} value={s.pauseOnExit} onChange={sel('pauseOnExit')} />

          <Section title="电源与清理" />
          <NumRow label="屏幕关闭超时(秒)" hint="--screen-off-timeout：投屏期间设备锁屏超时，退出时恢复" min={0} value={s.screenOffTimeout ?? null} onChange={num('screenOffTimeout')} />
          <SwitchRow label="关闭时熄灭设备屏幕" hint="--power-off-on-close" value={s.powerOffOnClose} onChange={sw('powerOffOnClose')} />
          <SwitchRow label="启动不点亮屏幕" hint="--no-power-on" value={s.noPowerOn} onChange={sw('noPowerOn')} />
          <SwitchRow label="退出不清理" hint="--no-cleanup：不从设备删除 server，不恢复触摸显示/保活/电源状态" value={s.noCleanup} onChange={sw('noCleanup')} />

          <Section title="应用与限时" />
          <TextRow label="启动应用" hint='--start-app：包名；? 前缀按名称前缀匹配；+ 前缀先强制停止；可组合 +?，如 +?firefox' placeholder="如 com.example.app" value={s.startApp} onChange={tx('startApp')} />
          <NumRow label="镜像时限(秒)" hint="--time-limit：最长投屏时间" min={0} value={s.timeLimit ?? null} onChange={num('timeLimit')} />
        </Tabs.TabPane>
      </Tabs>
    </Card>
  )
}

export default SettingsPage
