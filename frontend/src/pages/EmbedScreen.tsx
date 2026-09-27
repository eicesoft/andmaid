import React from 'react'
import {
  CloseEmbed,
  EmbedBack,
  EmbedFlashBehind,
  EmbedFlashRestore,
  EmbedHome,
  EmbedNative,
  EmbedNotifications,
  EmbedPower,
  EmbedRecents,
  EmbedScreen,
  EmbedScreenshot,
  EmbedVolDown,
  EmbedVolUp,
  HostTitle,
  ResizeEmbed,
} from '../../wailsjs/go/main/App'
import { EventsOn, Quit, WindowMinimise, WindowSetAlwaysOnTop } from '../../wailsjs/runtime'
import { dragStyle, noDragStyle } from '../draggable'
import { Btn, Tip } from '../components/ui'
import { Spinner } from '../components/icons'
import {
  IconArrowLeft,
  IconApps,
  IconCamera,
  IconClose,
  IconDown,
  IconHome,
  IconMinus,
  IconNotification,
  IconPoweroff,
  IconPushpin,
  IconRefresh,
  IconUp,
} from '../components/icons'
import { Message } from '../components/Toast'

const TOOLBAR_W = 52

interface Props {
  serial: string
}

/** 内嵌投屏窗口：Windows 上 scrcpy 无边框窗口经 SetParent 嵌入本窗口画面区，
 * macOS/Linux 上系统不支持跨进程嵌窗，投屏跑独立窗口，本窗口仅显示工具栏 */
const EmbedScreenPage: React.FC<Props> = ({ serial }) => {
  const [running, setRunning] = React.useState(false)
  const [starting, setStarting] = React.useState(true)
  const [error, setError] = React.useState('')
  const [tipText, setTipText] = React.useState('')
  const [alwaysOnTop, setAlwaysOnTop] = React.useState(false)
  const [nativeEmbed, setNativeEmbed] = React.useState(true)
  const areaRef = React.useRef<HTMLDivElement>(null)
  const startedRef = React.useRef(false)

  React.useEffect(() => {
    EmbedNative().then((v) => setNativeEmbed(!!v)).catch(() => {})
  }, [])

  // 物理像素换算（WebView2 的 CSS px × dpr = 物理 px）
  const dpr = () => window.devicePixelRatio || 1

  const areaRect = () => {
    const el = areaRef.current
    if (!el) return null
    const r = el.getBoundingClientRect()
    if (r.width < 50 || r.height < 50) return null
    return r
  }

  const start = React.useCallback(async () => {
    setError('')
    try {
      const title = await HostTitle()
      let rect: DOMRect | null = null
      if (nativeEmbed) {
        // 等窗口定形后再取坐标
        for (let i = 0; i < 20 && !rect; i++) {
          rect = areaRect()
          if (!rect) await new Promise((r) => setTimeout(r, 150))
        }
        if (!rect) throw new Error('画面区未就绪')
      }
      const winX = rect ? Math.round((window.screenX + rect.left) * dpr()) : 100
      const winY = rect ? Math.round((window.screenY + rect.top) * dpr()) : 100
      const w = rect ? Math.max(200, Math.round(rect.width * dpr())) : 400
      const h = rect ? Math.max(200, Math.round(rect.height * dpr())) : 700
      await EmbedScreen(serial, title, winX, winY, w, h, TOOLBAR_W)
      setRunning(true)
    } catch (e) {
      setError(String(e))
    } finally {
      setStarting(false)
    }
  }, [serial, nativeEmbed])

  React.useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    start()
  }, [start])

  // 尺寸变化：同步 scrcpy 子窗口（父客户区坐标系，物理像素）。仅 Windows 原生嵌入需要
  React.useEffect(() => {
    if (!running || !nativeEmbed) return
    let timer = 0
    const sync = () => {
      const r = areaRect()
      if (!r) return
      ResizeEmbed(
        serial,
        Math.round(r.left * dpr()),
        Math.round(r.top * dpr()),
        Math.max(200, Math.round(r.width * dpr())),
        Math.max(200, Math.round(r.height * dpr())),
        TOOLBAR_W
      ).catch(() => {})
    }
    const onResize = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(sync, 150)
    }
    window.addEventListener('resize', onResize)
    // 嵌入完成后多次补同步：scrcpy 建窗、SetParent、SDL 首帧各阶段都可能重设窗口尺寸
    const timers = [300, 800, 1500, 2500, 4000].map((ms) => window.setTimeout(sync, ms))
    return () => {
      window.removeEventListener('resize', onResize)
      window.clearTimeout(timer)
      timers.forEach((t) => window.clearTimeout(t))
    }
  }, [running, serial, nativeEmbed])

  // 退出事件
  React.useEffect(() => {
    const off = EventsOn('embed:exited', (s: string) => {
      if (s === serial) {
        setRunning(false)
        Message.info('投屏已退出')
      }
    })
    return off
  }, [serial])

  const stop = async (quit = true) => {
    try {
      await CloseEmbed(serial)
    } catch {
      /* 已退出也允许关窗 */
    }
    if (quit) Quit()
  }

  const restart = async () => {
    setRunning(false)
    setStarting(true)
    await stop(false)
    start()
  }

  const act = async (fn: (s: string) => Promise<void>, name: string) => {
    try {
      await fn(serial)
    } catch (e) {
      Message.error(`${name}失败: ${e}`)
    }
  }

  const shot = async () => {
    try {
      const p = await EmbedScreenshot(serial)
      flashBehind(() => Message.success(`已保存: ${p}`))
    } catch (e) {
      flashBehind(() => Message.error(`截图失败: ${e}`))
    }
  }

  // Windows 原生嵌入时 scrcpy 子窗口盖在 WebView 之上，HTML Message 会被遮住。
  // 置底闪现 3.5s 让 Message 可见，然后恢复。非嵌入平台直接执行。
  const flashBehind = async (show: () => void) => {
    try {
      await EmbedFlashBehind(serial)
    } catch {
      show()
      return
    }
    show()
    window.setTimeout(() => {
      EmbedFlashRestore(serial).catch(() => {})
    }, 3500)
  }

  const tools: Array<{
    key: string
    icon: React.ReactNode
    title: string
    onClick: () => void
    always?: boolean
  }> = [
    { key: 'back', icon: <IconArrowLeft />, title: '返回', onClick: () => act(EmbedBack, '返回') },
    { key: 'home', icon: <IconHome />, title: '主页', onClick: () => act(EmbedHome, '主页') },
    { key: 'recents', icon: <IconApps />, title: '多任务', onClick: () => act(EmbedRecents, '多任务') },
    { key: 'volup', icon: <IconUp />, title: '音量 +', onClick: () => act(EmbedVolUp, '音量+') },
    { key: 'voldown', icon: <IconDown />, title: '音量 -', onClick: () => act(EmbedVolDown, '音量-') },
    { key: 'shot', icon: <IconCamera />, title: '截图', onClick: shot },
    { key: 'notif', icon: <IconNotification />, title: '通知栏', onClick: () => act(EmbedNotifications, '通知栏') },
    { key: 'power', icon: <IconPoweroff />, title: '电源', onClick: () => act(EmbedPower, '电源') },
    { key: 'restart', icon: <IconRefresh />, title: '重启投屏', onClick: restart, always: true },
  ]

  return (
    <div className="embed-root" style={{ ...dragStyle }}>
      {/* 画面区：Windows 上 SetParent 后 scrcpy 原生子窗口盖在此区域上；
          macOS/Linux 上显示提示（投屏在独立窗口） */}
      <div ref={areaRef} className="embed-area">
        {!running && (
          <div className="embed-placeholder">
            {starting && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                <Spinner size={32} />
                <span>正在启动投屏…</span>
              </div>
            )}
            {!starting && error && (
              <>
                <div className="embed-placeholder-error">启动失败</div>
                <div className="embed-placeholder-detail">{error}</div>
                <Btn size="small" onPress={restart}>
                  <IconRefresh />
                  重试
                </Btn>
              </>
            )}
            {!starting && !error && !nativeEmbed && (
              <>
                <div style={{ fontSize: 14 }}>投屏窗口已打开</div>
                <div className="embed-placeholder-detail" style={{ maxWidth: 360 }}>
                  macOS 不支持把投屏嵌入本窗口，画面显示在独立投屏窗口中。
                  可用右侧工具栏控制设备，关闭工具栏不会关闭投屏。
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* 右侧竖向工具栏：空白/分隔/把手可拖窗，仅 icon 按钮不拖 */}
      <div className="embed-toolbar" style={{ ...dragStyle }}>
        {/* 顶部窗口控制：关闭、置顶、最小化 */}
        <div className="embed-toolbar-top">
          <div style={noDragStyle}>
            <div
              onMouseEnter={() => setTipText('停止并关闭')}
              onMouseLeave={() => setTipText('')}
            >
              <button type="button" className="embed-tool-btn" onClick={() => stop()} aria-label="停止并关闭">
                <IconClose />
              </button>
            </div>
          </div>
          <div style={noDragStyle}>
            <div
              onMouseEnter={() => setTipText('最小化')}
              onMouseLeave={() => setTipText('')}
            >
              <button type="button" className="embed-tool-btn" onClick={() => WindowMinimise()} aria-label="最小化">
                <IconMinus />
              </button>
            </div>
          </div>
          <div style={noDragStyle}>
            <div
              onMouseEnter={() => setTipText(alwaysOnTop ? '取消置顶' : '窗口置顶')}
              onMouseLeave={() => setTipText('')}
            >
              <button
                type="button"
                className={`embed-tool-btn ${alwaysOnTop ? 'is-active' : ''}`}
                onClick={() => {
                  const next = !alwaysOnTop
                  setAlwaysOnTop(next)
                  WindowSetAlwaysOnTop(next)
                }}
                aria-label="窗口置顶"
              >
                <IconPushpin />
              </button>
            </div>
          </div>
        </div>
        <div className="embed-sep embed-sep--first" />
        {tools.map((t, i) => (
          <React.Fragment key={t.key}>
            {(i === 3 || i === 5 || i === 7) && <div className="embed-sep" />}
            <div style={noDragStyle}>
              <div
                onMouseEnter={() => setTipText(t.title)}
                onMouseLeave={() => setTipText('')}
              >
                <button
                  type="button"
                  className="embed-tool-btn"
                  disabled={!running && !t.always}
                  onClick={t.onClick}
                  aria-label={t.title}
                >
                  {t.icon}
                </button>
              </div>
            </div>
          </React.Fragment>
        ))}
        {/* hover 提示固定在栏底：原生投屏窗口永远盖住 webview 浮层 tooltip，改为栏内文字提示 */}
        <div className="embed-spacer" />
        <div className="embed-tip">{tipText}</div>
      </div>
    </div>
  )
}

export default EmbedScreenPage
