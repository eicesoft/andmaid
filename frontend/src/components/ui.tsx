import React from 'react'
import {
  Button as RAButton,
  Dialog,
  Modal as RAModal,
  ModalOverlay,
  Heading,
  Input as RAInput,
  Label,
  NumberField as RANumberField,
  Popover,
} from 'react-aria-components'
import { IconClose, Spinner } from './icons'

// ============ Button ============

interface BtnProps extends Omit<React.ComponentProps<typeof RAButton>, 'children'> {
  variant?: 'default' | 'primary' | 'danger' | 'text'
  size?: 'default' | 'small' | 'mini'
  iconOnly?: boolean
  loading?: boolean
  children?: React.ReactNode
}

export const Btn: React.FC<BtnProps> = ({ variant = 'default', size = 'default', iconOnly, loading, className, children, ...rest }) => (
  <RAButton
    {...rest}
    isDisabled={rest.isDisabled || loading}
    className={[
      'btn',
      variant === 'primary' ? 'btn--primary' : '',
      variant === 'danger' ? 'btn--danger' : '',
      variant === 'text' ? 'btn--text' : '',
      size === 'small' ? 'btn--small' : '',
      size === 'mini' ? 'btn--mini' : '',
      iconOnly ? 'btn--icon' : '',
      loading ? 'is-loading' : '',
      className ?? '',
    ].join(' ').trim() || undefined}
  >
    {loading && <Spinner size={size === 'mini' ? 10 : 12} />}
    {children}
  </RAButton>
)

// ============ TextInput（带可选清除按钮） ============

export const TextInput: React.FC<{
  value: string
  onChange: (v: string) => void
  placeholder?: string
  prefix?: React.ReactNode
  small?: boolean
  clearable?: boolean
  ariaLabel?: string
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void
}> = ({ value, onChange, placeholder, prefix, small, clearable = true, ariaLabel, onKeyDown }) => (
  <div className={`field ${small ? 'field--small' : ''} ${clearable ? 'field--with-clear' : ''}`}>
    {prefix && <span className="field-prefix">{prefix}</span>}
    <RAInput
      aria-label={ariaLabel ?? placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      onKeyDown={onKeyDown}
    />
    {clearable && value && (
      <button type="button" className="field-clear" onClick={() => onChange('')} aria-label="清空">
        <svg viewBox="0 0 48 48" width="8" height="8" fill="none" stroke="currentColor" strokeWidth={6} strokeLinecap="round">
          <path d="M8 8l32 32M40 8 8 40" />
        </svg>
      </button>
    )}
  </div>
)

// ============ NumberInput ============

export const NumberInput: React.FC<{
  value: number | null
  onChange: (v: number | null) => void
  min?: number
  max?: number
  step?: number
  placeholder?: string
}> = ({ value, onChange, min = -Infinity, max = Infinity, step = 1, placeholder = '默认' }) => (
  <RANumberField
    aria-label={placeholder}
    minValue={min}
    maxValue={max}
    step={step}
    value={value ?? undefined}
    onChange={(v) => onChange(typeof v === 'number' ? v : null)}
    className="num-field"
    style={{ width: '100%' }}
  >
    <RAButton slot="decrement" className="num-btn" aria-label="减少">−</RAButton>
    <RAInput />
    <RAButton slot="increment" className="num-btn" aria-label="增加">+</RAButton>
  </RANumberField>
)

// ============ Switch ============

export const Toggle: React.FC<{
  isSelected: boolean
  onChange: (v: boolean) => void
  ariaLabel?: string
}> = ({ isSelected, onChange, ariaLabel }) => (
  <RAButton
    aria-label={ariaLabel}
    aria-pressed={isSelected}
    className="switch"
    data-selected={isSelected}
    onPress={() => onChange(!isSelected)}
    style={{ border: 'none', padding: 0, background: undefined }}
  >
    <span className="switch-handle" />
  </RAButton>
)

// ============ Tooltip ============

// RAC TooltipTrigger 在本工程内 hover 不触发（原因未明），改用轻量自研实现：
// CSS 绝对定位 + hover/focus 显示，无 JS 状态。
export const Tip: React.FC<{ tip: string; children: React.ReactElement<{ className?: string }> }> = ({ tip, children }) =>
  React.cloneElement(children, {
    className: `${children.props.className ?? ''} tip-wrap`.trim(),
    'data-tip': tip,
  } as Partial<{ className: string; 'data-tip': string }>)

// ============ Popover 容器（下拉菜单等） ============

export const Float: React.FC<{
  open: boolean
  onOpenChange: (v: boolean) => void
  triggerRef: React.RefObject<HTMLElement | null>
  children: React.ReactNode
  placement?: 'bottom start' | 'bottom end' | 'bottom'
}> = ({ open, onOpenChange, triggerRef, children, placement = 'bottom start' }) => (
  <Popover
    isOpen={open}
    onOpenChange={onOpenChange}
    triggerRef={triggerRef}
    placement={placement}
    containerPadding={8}
    className="float-popover"
    style={{ background: 'transparent', border: 'none', boxShadow: 'none', outline: 'none' }}
  >
    {children}
  </Popover>
)

// ============ Modal（确认 / 表单） ============

export interface ModalState {
  title: React.ReactNode
  children: React.ReactNode
  onOk?: () => void
  okText?: string
  okDanger?: boolean
  closable?: boolean
  footer?: React.ReactNode
}

export const ModalHost: React.FC<{
  modal: ModalState | null
  onClose: () => void
}> = ({ modal, onClose }) => (
  <ModalOverlay
    isDismissable={modal?.closable ?? true}
    isOpen={!!modal}
    onOpenChange={(v) => { if (!v) onClose() }}
    className="modal-overlay"
  >
    <RAModal className="modal-host">
      <Dialog className="modal" role="alertdialog" aria-label={typeof modal?.title === 'string' ? modal.title : '对话框'}>
        <div className="modal-header">
          <Heading slot="title" style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>{modal?.title}</Heading>
          {(modal?.closable ?? true) && (
            <button type="button" className="modal-close" onClick={onClose} aria-label="关闭">
              <IconClose />
            </button>
          )}
        </div>
        <div className="modal-body">{modal?.children}</div>
        {(modal?.onOk || modal?.footer) && (
          <div className="modal-footer">
            {modal?.footer}
            {modal?.onOk && (
              <>
                <Btn onPress={onClose}>取消</Btn>
                <Btn variant={modal?.okDanger ? 'danger' : 'primary'} onPress={modal?.onOk}>
                  {modal?.okText ?? '确定'}
                </Btn>
              </>
            )}
          </div>
        )}
      </Dialog>
    </RAModal>
  </ModalOverlay>
)

// ============ Drawer ============

export const Drawer: React.FC<{
  open: boolean
  onClose: () => void
  width?: number
  title: React.ReactNode
  children: React.ReactNode
}> = ({ open, onClose, width = 792, title, children }) => (
  <ModalOverlay isDismissable isOpen={open} onOpenChange={(v) => { if (!v) onClose() }} className="drawer-overlay">
    <RAModal className="drawer-host">
      <Dialog className="drawer" style={{ width }} aria-label={typeof title === 'string' ? title : '面板'}>
        <div className="drawer-header">
          <span className="drawer-title">{title}</span>
          <button type="button" className="modal-close" onClick={onClose} aria-label="关闭">
            <IconClose />
          </button>
        </div>
        <div className="drawer-body">{children}</div>
      </Dialog>
    </RAModal>
  </ModalOverlay>
)
