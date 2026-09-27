import React from 'react'
import { EventsOn } from '../../wailsjs/runtime'
import { AgentChat, ListDevices } from '../../wailsjs/go/main/App'
import { agent } from '../../wailsjs/go/models'
import PageHeader from '../components/PageHeader'
import { Btn, Float, TextInput } from '../components/ui'
import { IconSend, IconTool, Spinner } from '../components/icons'
import { Message } from '../components/Toast'

interface Device {
  serial: string
  state: string
  model: string
}

interface ToolCallItem {
  id: string
  name: string
  args: string
  result?: string
  failed?: boolean
}

interface ChatMsg {
  role: 'user' | 'assistant'
  content: string
  toolCalls?: ToolCallItem[]
  streaming?: boolean
}

// agent:event 事件载荷（与后端 agentEvent 对应）
interface AgentEvent {
  type: 'delta' | 'tool_call' | 'tool_result' | 'done' | 'error'
  content?: string
  toolCalls?: { id?: string; function: { name?: string; arguments?: string } }[]
  error?: string
}

const AgentPage: React.FC = () => {
  const [messages, setMessages] = React.useState<ChatMsg[]>([])
  const [input, setInput] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [devices, setDevices] = React.useState<Device[]>([])
  const [serial, setSerial] = React.useState('')
  const [expandedTool, setExpandedTool] = React.useState('')
  const [devOpen, setDevOpen] = React.useState(false)
  const devBtnRef = React.useRef<HTMLSpanElement>(null)
  const bottomRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    ListDevices()
      .then((list) => {
        const online = ((list as Device[]) ?? []).filter((d) => d.state === 'device')
        setDevices(online)
        if (online.length > 0) setSerial((prev) => prev || online[0].serial)
      })
      .catch(() => setDevices([]))
  }, [])

  // 后端流式事件 → 更新最后一条 assistant 消息
  React.useEffect(() => {
    const off = EventsOn('agent:event', (ev: AgentEvent) => {
      setMessages((prev) => {
        if (prev.length === 0) return prev
        const next = [...prev]
        const last = { ...next[next.length - 1] }
        if (last.role !== 'assistant') return prev
        if (ev.type === 'delta' && ev.content) {
          last.content += ev.content
        } else if (ev.type === 'tool_call' && ev.toolCalls) {
          last.toolCalls = [
            ...(last.toolCalls ?? []),
            ...ev.toolCalls.map((t, i) => ({
              id: t.id ?? `call_${Date.now()}_${i}`,
              name: t.function?.name ?? '?',
              args: t.function?.arguments ?? '',
            })),
          ]
        } else if (ev.type === 'tool_result' && ev.content) {
          // 内容形如 "toolName: 结果"；失败（错误:/拒绝执行:）标红并摘要
          const idx = ev.content.indexOf(': ')
          const name = idx > 0 ? ev.content.slice(0, idx) : ''
          const body = idx > 0 ? ev.content.slice(idx + 2) : ev.content
          const failed = body.startsWith('错误') || body.startsWith('拒绝执行')
          const calls = last.toolCalls
          if (calls && calls.length > 0) {
            // 匹配最近一个同名未回填的调用
            for (let i = calls.length - 1; i >= 0; i--) {
              if (calls[i].name === name && calls[i].result === undefined) {
                calls[i] = {
                  ...calls[i],
                  result: failed ? body.slice(0, 120) : 'ok',
                  failed,
                }
                break
              }
            }
          }
          if (failed) {
            last.content += (last.content ? '\n' : '') + `[工具失败] ${name}: ${body.slice(0, 200)}`
          }
        } else if (ev.type === 'error' && ev.error) {
          last.content += (last.content ? '\n\n' : '') + `[出错] ${ev.error}`
          last.streaming = false
        } else if (ev.type === 'done') {
          last.streaming = false
        }
        next[next.length - 1] = last
        return next
      })
    })
    return () => off()
  }, [])

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const send = async () => {
    const text = input.trim()
    if (!text || busy) return
    if (!serial) {
      Message.warning('没有在线设备，请先连接安卓设备')
      return
    }
    const history = [...messages, { role: 'user' as const, content: text }]
    setMessages([...history, { role: 'assistant', content: '', streaming: true }])
    setInput('')
    setBusy(true)
    try {
      const finalText = await AgentChat(
        agent.AgentChatRequest.createFrom({
          serial,
          messages: history.map((m) => ({ role: m.role, content: m.content })),
        }),
      )
      setMessages((prev) => {
        const next = [...prev]
        const last = next[next.length - 1]
        // 保留 tool 标签，只更新文本；后端 error 事件已把内容写入
        if (last?.role === 'assistant') {
          if (finalText.trim() || !last.content.trim()) {
            next[next.length - 1] = { ...last, content: finalText || last.content, streaming: false }
          } else {
            next[next.length - 1] = { ...last, streaming: false }
          }
        }
        return next
      })
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e)
      setMessages((prev) => {
        const next = [...prev]
        const last = next[next.length - 1]
        if (last?.role === 'assistant' && !last.content) {
          next[next.length - 1] = { ...last, content: `[出错] ${errMsg}`, streaming: false }
        }
        return next
      })
      Message.error(errMsg)
    } finally {
      setBusy(false)
    }
  }

  const fmtArgs = (args: string) => {
    try {
      return JSON.stringify(JSON.parse(args), null, 2)
    } catch {
      return args
    }
  }

  const inputRef = React.useRef<HTMLTextAreaElement>(null)
  const autoSize = (el: HTMLTextAreaElement) => {
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 130)}px`
  }

  return (
    <div className="page-card" style={{ height: 'calc(100vh - 8px)' }}>
      <PageHeader
        title={
          <>
            Agent
            <span ref={devBtnRef}>
              <Btn size="mini" onPress={() => setDevOpen(true)} aria-expanded={devOpen}>
                {serial || '选择设备'}
              </Btn>
            </span>
            <Float open={devOpen} onOpenChange={setDevOpen} triggerRef={devBtnRef}>
              <div className="device-terminal-quickmenu" style={{ width: 260 }}>
                {devices.map((d) => (
                  <div
                    key={d.serial}
                    className="device-terminal-quickitem"
                    onClick={() => {
                      setSerial(d.serial)
                      setDevOpen(false)
                    }}
                  >
                    {d.serial === serial ? '✓ ' : ''}{d.model || d.serial}（{d.serial}）
                  </div>
                ))}
                {devices.length === 0 && <div className="device-terminal-quickitem muted">无在线设备</div>}
              </div>
            </Float>
          </>
        }
      />

      {/* 消息区 */}
      <div className="chat-scroll selectable no-scrollbar">
        {messages.length === 0 && (
          <div className="chat-empty">
            设备助手：可以让我查设备信息、开/关投屏、启动应用。
            <br />
            例如「帮我看看这台设备的电量，然后开启投屏」
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`chat-msg chat-msg--${m.role}`}>
            <div className="chat-bubble">
              {m.toolCalls && m.toolCalls.length > 0 && (
                <div className="chat-tools" style={{ marginBottom: m.content ? 8 : 0 }}>
                  {m.toolCalls.map((t, ti) => {
                    const open = expandedTool === `${i}-${t.id || ti}`
                    return (
                      <React.Fragment key={t.id || ti}>
                        <button
                          type="button"
                          className={`chat-tool ${t.failed ? 'chat-tool--fail' : t.result ? 'chat-tool--ok' : 'chat-tool--run'}`}
                          onClick={() => setExpandedTool(open ? '' : `${i}-${t.id || ti}`)}
                        >
                          <IconTool />
                          {t.name} {t.result ? (t.failed ? '✗' : '✓') : '…'}
                        </button>
                        {open && (
                          <pre className="chat-tool-args">
                            {fmtArgs(t.args)}
                            {t.result && t.result !== 'ok' ? `\n→ ${t.result}` : ''}
                          </pre>
                        )}
                      </React.Fragment>
                    )
                  })}
                </div>
              )}
              {m.content}
              {m.streaming && m.content === '' && m.toolCalls && m.toolCalls.length > 0 && (
                <span className="chat-loading">
                  <Spinner size={12} /> 执行工具中…
                </span>
              )}
              {m.streaming && m.content === '' && (!m.toolCalls || m.toolCalls.length === 0) && (
                <span className="chat-loading">
                  <Spinner size={12} />
                </span>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* 输入区 */}
      <div className="chat-input-row">
        <textarea
          ref={inputRef}
          className="textarea"
          rows={1}
          value={input}
          placeholder="输入指令，Enter 发送，Shift+Enter 换行"
          onChange={(e) => {
            setInput(e.target.value)
            autoSize(e.target)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send()
            }
          }}
        />
        <Btn
          variant="primary"
          loading={busy}
          onPress={send}
          isDisabled={!input.trim() || !serial}
        >
          <IconSend />
          发送
        </Btn>
      </div>
    </div>
  )
}

export default AgentPage
