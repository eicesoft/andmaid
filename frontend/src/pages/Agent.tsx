import React from 'react'
import { Button, Card, Input, Message, Select, Spin, Tag, Typography } from '@arco-design/web-react'
import { IconSend, IconLoading, IconTool } from '@arco-design/web-react/icon'
import { EventsOn } from '../../wailsjs/runtime'
import { AgentChat, ListDevices } from '../../wailsjs/go/main/App'
import { main } from '../../wailsjs/go/models'
import PageHeader from '../components/PageHeader'

const { Text } = Typography
const { TextArea } = Input

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
        main.AgentChatRequest.createFrom({
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
    } catch (e: any) {
      const errMsg = `${e?.message ?? e}`
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

  return (
    <Card className="settings-card" bodyStyle={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)' }}>
      <PageHeader
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%' }}>
            <span>Agent</span>
            <Select
              size="mini"
              style={{ width: 220 }}
              value={serial || undefined}
              placeholder="选择设备"
              onChange={setSerial}
            >
              {devices.map((d) => (
                <Select.Option key={d.serial} value={d.serial}>
                  {d.model || d.serial}（{d.serial}）
                </Select.Option>
              ))}
            </Select>
          </div>
        }
      />

      {/* 消息区 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 4px', minHeight: 0 }} className="no-scrollbar">
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--color-text-3)', marginTop: 80 }}>
            <Text type="secondary">
              设备助手：可以让我查设备信息、开/关投屏、启动应用。
              <br />
              例如「帮我看看这台设备的电量，然后开启投屏」
            </Text>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start', marginBottom: 12 }}>
            <div
              style={{
                maxWidth: '78%',
                padding: '8px 12px',
                borderRadius: 10,
                background: m.role === 'user' ? 'var(--color-primary-light-1)' : 'var(--color-fill-2)',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                lineHeight: 1.6,
              }}
            >
              {m.toolCalls && m.toolCalls.length > 0 && (
                <div style={{ marginBottom: m.content ? 8 : 0, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {m.toolCalls.map((t, ti) => {
                    const open = expandedTool === `${i}-${t.id || ti}`
                    return (
                      <React.Fragment key={t.id || ti}>
                        <Tag
                          size="small"
                          color={t.failed ? 'red' : t.result ? 'green' : 'arcoblue'}
                          icon={<IconTool />}
                          style={{ cursor: 'pointer', userSelect: 'none', margin: 0 }}
                          onClick={() => setExpandedTool(open ? '' : `${i}-${t.id || ti}`)}
                        >
                          {t.name} {t.result ? (t.failed ? '✗' : '✓') : '…'}
                        </Tag>
                        {open && (
                          <pre
                            style={{
                              flexBasis: '100%',
                              margin: 0,
                              padding: '6px 8px',
                              fontSize: 12,
                              background: 'var(--color-fill-1)',
                              borderRadius: 6,
                              whiteSpace: 'pre-wrap',
                              wordBreak: 'break-word',
                              color: 'var(--color-text-2)',
                            }}
                          >
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
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <IconLoading spin /> 执行工具中…
                </span>
              )}
              {m.streaming && m.content === '' && (!m.toolCalls || m.toolCalls.length === 0) && (
                <Spin size={16} style={{ display: 'inline-block' }} />
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef as any} />
      </div>

      {/* 输入区 */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', paddingTop: 8, borderTop: '1px solid var(--color-fill-2)' }}>
        <TextArea
          value={input}
          placeholder="输入指令，Enter 发送，Shift+Enter 换行"
          autoSize={{ minRows: 1, maxRows: 5 }}
          style={{ resize: 'none' }}
          onChange={setInput}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send()
            }
          }}
        />
        <Button type="primary" icon={<IconSend />} loading={busy} onClick={send} disabled={!input.trim() || !serial}>
          发送
        </Button>
      </div>
    </Card>
  )
}

export default AgentPage
