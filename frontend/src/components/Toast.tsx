import React from 'react'
import { createRoot } from 'react-dom/client'
import { IconCloseCircle, IconWarning } from './icons'

// 全局 Message：Arco Message 替代。命令式调用 toast.success('...')。

export type ToastKind = 'success' | 'error' | 'info' | 'warning'

interface ToastItem {
  id: number
  kind: ToastKind
  content: string
}

let push: ((t: ToastItem) => void) | null = null
let seq = 0
const host = document.createElement('div')
document.body.appendChild(host)
const root = createRoot(host)

const Region: React.FC = () => {
  const [items, setItems] = React.useState<ToastItem[]>([])

  React.useEffect(() => {
    push = (t) => {
      setItems((prev) => [...prev.slice(-4), t])
      window.setTimeout(() => {
        setItems((prev) => prev.filter((i) => i.id !== t.id))
      }, 3000)
    }
    return () => {
      push = null
    }
  }, [])

  if (items.length === 0) return null
  return (
    <div className="toast-region">
      {items.map((t) => (
        <div key={t.id} className={`toast toast--${t.kind}`}>
          {t.kind === 'error' ? <IconCloseCircle /> : <IconWarning />}
          <span>{t.content}</span>
        </div>
      ))}
    </div>
  )
}

root.render(<Region />)

const emit = (kind: ToastKind, content: string) => {
  push?.({ id: ++seq, kind, content })
}

export const Message = {
  success: (c: string) => emit('success', c),
  error: (c: string) => emit('error', c),
  info: (c: string) => emit('info', c),
  warning: (c: string) => emit('warning', c),
}
