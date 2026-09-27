import React from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { dragStyle, noDragStyle } from './draggable'
import WindowControls from './components/WindowControls'
import { IconHome, IconMobile, IconRobot, IconSettings } from './components/icons'
import HomePage from './pages/Home'
import DevicePage from './pages/Devices'
import FilesPage from './pages/Files'
import SettingsPage from './pages/Settings'
import AgentPage from './pages/Agent'
import EmbedScreenPage from './pages/EmbedScreen'
import { EmbedMode } from '../wailsjs/go/main/App'

const MENU = [
  { key: '/', label: '首页', icon: <IconHome /> },
  { key: '/devices', label: '设备管理', icon: <IconMobile /> },
  { key: '/agent', label: 'Agent', icon: <IconRobot /> },
  { key: '/settings', label: '设置', icon: <IconSettings /> },
]

const App: React.FC = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const selectedKey = location.pathname
  const [embedSerial, setEmbedSerial] = React.useState<string | null>(null)
  const [embedLoaded, setEmbedLoaded] = React.useState(false)

  React.useEffect(() => {
    EmbedMode()
      .then((s) => {
        setEmbedSerial(s || null)
        setEmbedLoaded(true)
      })
      .catch(() => setEmbedLoaded(true))
  }, [])

  if (!embedLoaded) return null

  // 内嵌投屏窗口模式：整窗即投屏画面 + 工具栏
  if (embedSerial) {
    return <EmbedScreenPage serial={embedSerial} />
  }

  return (
    <div className="app-shell" style={{ ...dragStyle }}>
      <WindowControls />
      <aside className="app-sider">
        <div className="app-logo">Andmaid</div>
        <nav className="app-menu" style={{ ...noDragStyle }}>
          {MENU.map((m) => (
            <button
              key={m.key}
              type="button"
              className="app-menu-item"
              data-selected={selectedKey === m.key || undefined}
              onClick={() => navigate(m.key)}
            >
              {m.icon}
              {m.label}
            </button>
          ))}
        </nav>
      </aside>
      <main className="app-content">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/devices" element={<DevicePage />} />
          <Route path="/files" element={<FilesPage />} />
          <Route path="/agent" element={<AgentPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  )
}

export default App
