import React from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { EventsOn } from '../../wailsjs/runtime'
import { StartShell, StopShell, StopShellSession, WriteShell } from '../../wailsjs/go/main/App'
import { Btn, Float, Tip } from './ui'
import { IconStop, IconThunderbolt } from './icons'
import { noDragStyle } from '../draggable'

// 常用快捷命令（整段写入设备 shell，回车执行）
const QUICK_COMMANDS: { label: string; cmd: string }[] = [
  { label: '设备信息', cmd: 'getprop ro.product.model; getprop ro.build.version.release' },
  { label: '电量', cmd: 'dumpsys battery | grep -E "level|status|powered"' },
  { label: '分辨率', cmd: 'wm size; wm density' },
  { label: '已装应用', cmd: 'pm list packages -3' },
  { label: '内存', cmd: 'dumpsys meminfo | head -20' },
  { label: '磁盘', cmd: 'df -h /storage/emulated' },
  { label: 'IP 地址', cmd: 'ip addr show wlan0' },
]

interface Props {
  serial: string
}

const DeviceTerminal: React.FC<Props> = ({ serial }) => {
  const hostRef = React.useRef<HTMLDivElement>(null)
  const termRef = React.useRef<Terminal | null>(null)
  const fitRef = React.useRef<FitAddon | null>(null)
  const sessionIdRef = React.useRef('') // 当前 shell 会话 ID，事件过滤用
  const [running, setRunning] = React.useState(false)
  const [booting, setBooting] = React.useState(true)
  // Quick commands stay write-only
  const runQuick = (cmd: string) => {
    WriteShell(serial, cmd + '\n').catch((e) => console.error('write shell:', e))
  }

  React.useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'bar',
      fontSize: 13,
      fontFamily: "'JetBrains Mono', 'Cascadia Code', Consolas, 'Courier New', monospace",
      scrollback: 5000,
      theme: {
        background: '#1E1E1E',
        foreground: '#D4D4D4',
        cursor: '#AEAFAD',
        selectionBackground: '#264F78',
        black: '#000000',
        red: '#CD3131',
        green: '#0DBC79',
        yellow: '#E5E510',
        blue: '#2472C8',
        magenta: '#BC3FBC',
        cyan: '#11A8CD',
        white: '#E5E5E5',
        brightBlack: '#666666',
        brightRed: '#F14C4C',
        brightGreen: '#23D18B',
        brightYellow: '#F5F543',
        brightBlue: '#3B8EEA',
        brightMagenta: '#D670D6',
        brightCyan: '#29B8DB',
        brightWhite: '#E5E5E5',
        scrollbarSliderBackground: '#D4D4D448',
        scrollbarSliderHoverBackground: '#D4D4D473',
        scrollbarSliderActiveBackground: '#D4D4D48C',
      },
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(host)
    termRef.current = term
    fitRef.current = fit

    let alive = true
    // 订阅必须同步注册：放异步 boot 里 StrictMode 首轮 cleanup 时还没赋值，
    // 解绑失效导致重复订阅（「shell 已退出」显示两次的根因）。
    // 事件按 sessionIdRef 过滤：旧会话的 data/exit 全部丢弃
    const offData = EventsOn('shell:data', (payload: { serial: string; id: string; data: string }) => {
      if (!payload || payload.serial !== serial || payload.id !== sessionIdRef.current) return
      term.write(payload.data)
    })
    const offExit = EventsOn('shell:exit', (payload: { serial: string; id: string }) => {
      if (!payload || payload.serial !== serial || payload.id !== sessionIdRef.current) return
      sessionIdRef.current = ''
      setRunning(false)
      term.write('\r\n\x1b[90m[shell 已退出]\x1b[0m\r\n')
    })

    const boot = async () => {
      try {
        // 每次进入都重开会话：旧会话残留输出不回放，提示符重新打印
        const id = await StartShell(serial, term.rows || 24, term.cols || 80)
        if (!alive) {
          // effect 已卸载（StrictMode 首轮）：按会话 ID 精确关掉刚开的会话，
          // 不能按 serial 杀——第二轮 effect 可能已开了更新的会话
          if (id) StopShellSession(serial, id).catch(() => {})
          return
        }
        sessionIdRef.current = id || ''
        setRunning(true)
        setBooting(false)
        term.focus()
        fit.fit()
      } catch (e) {
        if (!alive) return
        setBooting(false)
        term.write(`\x1b[31mshell 启动失败: ${String(e)}\x1b[0m\r\n`)
      }
    }

    term.onData((data) => {
      // adb -tt 的 pty 不做 ICRNL 转换，裸 \r 只回显不提交行（表现为要按两次回车）；
      // Enter 统一映射为 \n
      const out = data.replace(/\r/g, '\n')
      WriteShell(serial, out).catch(() => {})
    })

    // 尺寸变化同步设备端 stty（简单方案：重设窗口即整页 resize 事件）
    const onResize = () => {
      if (!fitRef.current) return
      try {
        fitRef.current.fit()
        // adb 无原生窗口同步，写入 stty 重新换行
        WriteShell(serial, `stty rows ${term.rows} cols ${term.cols}\n`).catch(() => {})
      } catch {
        // 容器未挂载时跳过
      }
    }
    window.addEventListener('resize', onResize)

    boot()

    return () => {
      alive = false
      // 先置空：卸载后到达的退出事件不再写入已 dispose 的终端
      sessionIdRef.current = ''
      offData()
      offExit()
      window.removeEventListener('resize', onResize)
      // 组件卸载（抽屉关闭/切设备）时按当前会话 ID 精确结束 shell，不留孤儿进程；
      // ID 已被新会话替换时静默跳过，不误杀
      const sid = sessionIdRef.current
      if (sid) StopShellSession(serial, sid).catch(() => {})
      try {
        fit.dispose()
        term.dispose()
      } catch {
        // dispose 重复调用无害
      }
      termRef.current = null
      fitRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serial])

  const restart = async () => {
    const term = termRef.current
    if (!term) return
    setBooting(true)
    term.reset()
    try {
      await StopShell(serial)
    } catch {
      // 本来没跑
    }
    try {
      const id = await StartShell(serial, term.rows || 24, term.cols || 80)
      sessionIdRef.current = id || ''
      setRunning(true)
    } catch (e) {
      term.write(`\x1b[31mshell 启动失败: ${String(e)}\x1b[0m\r\n`)
    } finally {
      setBooting(false)
      term.focus()
    }
  }

  const stop = async () => {
    try {
      await StopShell(serial)
    } catch {
      // 已退出
    }
    setRunning(false)
  }

  const [quickOpen, setQuickOpen] = React.useState(false)
  const quickBtnRef = React.useRef<HTMLSpanElement>(null)

  return (
    <div className="device-terminal">
      <div className="device-terminal-toolbar">
        <span ref={quickBtnRef} style={noDragStyle}>
          <Btn size="small" onPress={() => setQuickOpen(true)} aria-expanded={quickOpen}>
            <IconThunderbolt />
            快捷命令
          </Btn>
        </span>
        <Float open={quickOpen} onOpenChange={setQuickOpen} triggerRef={quickBtnRef}>
          <div className="device-terminal-quickmenu">
            {QUICK_COMMANDS.map((q) => (
              <div
                key={q.label}
                className="device-terminal-quickitem"
                onClick={() => {
                  runQuick(q.cmd)
                  setQuickOpen(false)
                }}
              >
                {q.label}
              </div>
            ))}
          </div>
        </Float>
        <span className={`state-pill state-pill--${running ? 'online' : 'offline'}`}>
          <span className="state-pill-dot" />
          {running ? '已连接' : '未连接'}
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <Tip tip="重启 shell">
            <Btn size="small" loading={booting} onPress={restart} aria-label="重启 shell">
              重启
            </Btn>
          </Tip>
          <Btn size="small" isDisabled={!running} onPress={stop}>
            <IconStop />
            断开
          </Btn>
        </div>
      </div>
      <div className="device-terminal-host" ref={hostRef} />
    </div>
  )
}

export default DeviceTerminal
