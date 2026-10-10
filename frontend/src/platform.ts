// 运行平台判定：macOS 走系统红绿灯窗口控制规范，其余平台保持 Windows 样式
export const isMac =
  /mac/i.test(navigator.platform) || /mac os x/i.test(navigator.userAgent)
