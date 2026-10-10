import React from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import './style.css'
import './App.css'
import App from './App'
import { isMac } from './platform'

// 供 CSS 按平台微调布局（如 macOS 无右上角窗口按钮，去掉 header 右侧留位）
document.documentElement.dataset.platform = isMac ? 'darwin' : 'other'

const container = document.getElementById('root')

const root = createRoot(container!)

root.render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>
)
