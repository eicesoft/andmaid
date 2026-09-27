import React from 'react'

// 内联 SVG 图标集（Arco 图标的等价重绘）。
// 统一 1em 视口，继承 currentColor，随字号缩放。

type IconProps = React.SVGProps<SVGSVGElement>

const make = (name: string, path: React.ReactNode, viewBox = '0 0 48 48') => {
  const Icon: React.FC<IconProps> = (props) => (
    <svg
      viewBox={viewBox}
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth={4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {path}
    </svg>
  )
  Icon.displayName = name
  return Icon
}

export const IconHome = make('IconHome', <path d="M6 20 24 6l18 14v22H28V28h-8v14H6V20Z" />)

export const IconMobile = make(
  'IconMobile',
  <>
    <rect x="12" y="4" width="24" height="40" rx="4" />
    <path d="M20 38h8" />
  </>,
)

export const IconSettings = make(
  'IconSettings',
  <>
    <circle cx="24" cy="24" r="7" />
    <path d="M24 4v6M24 38v6M4 24h6M38 24h6M9.9 9.9l4.2 4.2M33.9 33.9l4.2 4.2M38.1 9.9l-4.2 4.2M14.1 33.9l-4.2 4.2" />
  </>,
)

export const IconRobot = make(
  'IconRobot',
  <>
    <rect x="8" y="14" width="32" height="26" rx="6" />
    <path d="M24 6v8" />
    <circle cx="24" cy="5" r="2" fill="currentColor" stroke="none" />
    <circle cx="18" cy="26" r="2" fill="currentColor" stroke="none" />
    <circle cx="30" cy="26" r="2" fill="currentColor" stroke="none" />
  </>,
)

export const IconRefresh = make(
  'IconRefresh',
  <>
    <path d="M40 24a16 16 0 1 1-4.7-11.3" />
    <path d="M36 4v9h-9" />
  </>,
)

export const IconDesktop = make(
  'IconDesktop',
  <>
    <rect x="5" y="8" width="38" height="26" rx="3" />
    <path d="M16 42h16M24 34v8" />
  </>,
)

export const IconCloseCircle = make(
  'IconCloseCircle',
  <>
    <circle cx="24" cy="24" r="19" />
    <path d="M17 17l14 14M31 17L17 31" />
  </>,
)

export const IconExpand = make(
  'IconExpand',
  <>
    <rect x="6" y="10" width="36" height="28" rx="3" />
    <path d="M14 19l-4 5 4 5M34 19l4 5-4 5" />
  </>,
)

export const IconLaunch = make(
  'IconLaunch',
  <>
    <rect x="6" y="6" width="14" height="14" rx="3" />
    <rect x="28" y="6" width="14" height="14" rx="3" />
    <rect x="6" y="28" width="14" height="14" rx="3" />
    <path d="M30 30l12 12M42 30v12H30" />
  </>,
)

export const IconSearch = make(
  'IconSearch',
  <>
    <circle cx="21" cy="21" r="13" />
    <path d="M31 31l11 11" />
  </>,
)

export const IconCode = make('IconCode', <path d="M16 12 4 24l12 12M32 12l12 12-12 12" />)

export const IconFolder = make(
  'IconFolder',
  <path d="M6 10h13l5 6h18v24a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V10Z" />,
)

export const IconStop = make(
  'IconStop',
  <rect x="10" y="10" width="28" height="28" rx="3" fill="currentColor" stroke="none" />,
)

export const IconThunderbolt = make(
  'IconThunderbolt',
  <path d="M27 4 10 27h11l-2 17 17-24H25l2-16Z" />,
)

export const IconDownload = make(
  'IconDownload',
  <>
    <path d="M24 6v26M13 22l11 11 11-11" />
    <path d="M8 42h32" />
  </>,
)

export const IconCopy = make(
  'IconCopy',
  <>
    <rect x="16" y="14" width="26" height="30" rx="3" />
    <path d="M10 34H8a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h20a2 2 0 0 1 2 2v2" />
  </>,
)

export const IconScissor = make(
  'IconScissor',
  <>
    <circle cx="11" cy="14" r="5" />
    <circle cx="11" cy="34" r="5" />
    <path d="M15 17 40 36M15 31 40 12" />
  </>,
)

export const IconDelete = make(
  'IconDelete',
  <>
    <path d="M8 12h32M20 12V6h8v6M14 12l2 30h16l2-30" />
    <path d="M20 20v14M28 20v14" />
  </>,
)

export const IconPlus = make('IconPlus', <path d="M24 8v32M8 24h32" />)

export const IconUpload = make(
  'IconUpload',
  <>
    <path d="M24 38V12M13 22l11-11 11 11" />
    <path d="M8 42h32" />
  </>,
)

export const IconArrowUp = make('IconArrowUp', <path d="M24 40V8M12 20 24 8l12 12" />)

export const IconRight = make('IconRight', <path d="M18 8l14 16-14 16" />)

export const IconFile = make(
  'IconFile',
  <>
    <path d="M10 6h20l10 10v26H10V6Z" />
    <path d="M30 6v10h10" />
  </>,
)

export const IconEdit = make(
  'IconEdit',
  <>
    <path d="M40 8 18 30l-4 10 10-4L44 14l-4-6Z" />
    <path d="M8 44h32" />
  </>,
)

export const IconPaste = make(
  'IconPaste',
  <>
    <rect x="12" y="10" width="28" height="32" rx="3" />
    <rect x="18" y="4" width="16" height="10" rx="2" />
    <path d="M20 22h12M20 30h12" />
  </>,
)

export const IconCompass = make(
  'IconCompass',
  <>
    <circle cx="24" cy="24" r="19" />
    <path d="m31 17-4.5 9.5L17 31l4.5-9.5L31 17Z" />
  </>,
)

export const IconExport = make(
  'IconExport',
  <>
    <path d="M42 30v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V30" />
    <path d="M24 4v26M14 20l10-10 10 10" />
  </>,
)

export const IconSend = make('IconSend', <path d="M6 24 42 6 30 42l-8-14-16-4Z" />)

export const IconLoading = make('IconLoading', <path d="M24 6v10M24 32v10M6 24h10M32 24h10M11 11l7 7M30 30l7 7M37 11l-7 7M18 30l-7 7" />)

export const IconTool = make(
  'IconTool',
  <path d="M42 12 34 20l-6-6 8-8a10 10 0 0 0-13 12L8 33a4 4 0 1 0 6 6l15-15a10 10 0 0 0 13-12Z" />,
)

export const IconSave = make(
  'IconSave',
  <>
    <path d="M42 40a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h26l8 8v26Z" />
    <path d="M14 6v12h20V6M14 42V28h20v14" />
  </>,
)

export const IconArrowLeft = make('IconArrowLeft', <path d="M40 24H8M20 12 8 24l12 12" />)

export const IconApps = make(
  'IconApps',
  <>
    <rect x="6" y="6" width="14" height="14" rx="3" />
    <rect x="28" y="6" width="14" height="14" rx="3" />
    <rect x="6" y="28" width="14" height="14" rx="3" />
    <rect x="28" y="28" width="14" height="14" rx="3" />
  </>,
)

export const IconUp = make('IconUp', <path d="M8 32 24 16l16 16" />)

export const IconDown = make('IconDown', <path d="M8 16 24 32 40 16" />)

export const IconCamera = make(
  'IconCamera',
  <>
    <rect x="4" y="12" width="40" height="30" rx="4" />
    <circle cx="24" cy="27" r="9" />
    <path d="M16 12l4-6h8l4 6" />
  </>,
)

export const IconNotification = make(
  'IconNotification',
  <>
    <path d="M10 20a14 14 0 0 1 28 0v10l4 8H6l4-8V20Z" />
    <path d="M20 42a5 5 0 0 0 8 0" />
  </>,
)

export const IconPoweroff = make(
  'IconPoweroff',
  <>
    <circle cx="24" cy="24" r="18" />
    <path d="M24 10v14" />
  </>,
)

export const IconClose = make('IconClose', <path d="M8 8l32 32M40 8 8 40" />)

export const IconPushpin = make(
  'IconPushpin',
  <>
    <path d="M18 6h12l-2 14 8 8v4H12v-4l8-8-2-14Z" />
    <path d="M24 32v10" />
  </>,
)

export const IconMinus = make('IconMinus', <path d="M8 24h32" />)

export const IconWarning = make(
  'IconWarning',
  <>
    <circle cx="24" cy="24" r="19" />
    <path d="M24 14v12" />
    <circle cx="24" cy="34" r="1.5" fill="currentColor" stroke="none" />
  </>,
)

// 加载圈（Spin 替代）
export const Spinner: React.FC<{ size?: number; className?: string }> = ({ size = 16, className }) => (
  <span
    className={`spin ${className ?? ''}`}
    style={{ width: size, height: size }}
  />
)
