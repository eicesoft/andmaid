import React from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { Layout, Menu } from '@arco-design/web-react'
import {
  IconHome,
  IconSettings,
  IconMobile,
} from '@arco-design/web-react/icon'
import { dragStyle, noDragStyle } from './draggable'
import WindowControls from './components/WindowControls'
import HomePage from './pages/Home'
import DevicePage from './pages/Devices'
import SettingsPage from './pages/Settings'
import EmbedScreenPage from './pages/EmbedScreen'
import { EmbedMode } from '../wailsjs/go/main/App'
import './App.css'

const { Sider, Content } = Layout

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
    <Layout style={{ height: '100vh', background: '#F8F7F5', position: 'relative' }}>
      <WindowControls />
      <Sider
        width={240}
        style={{
          background: '#F8F7F5',
          ...dragStyle,
        }}
      >
        <div className="app-logo">Andmaid</div>
        <Menu
          selectedKeys={[selectedKey]}
          onClickMenuItem={(key) => navigate(key)}
          style={{ width: '100%', ...noDragStyle }}
        >
          <Menu.Item key="/">
            <IconHome />
            首页
          </Menu.Item>
          <Menu.Item key="/devices">
            <IconMobile />
            设备管理
          </Menu.Item>
          <Menu.Item key="/settings">
            <IconSettings />
            设置
          </Menu.Item>
        </Menu>
      </Sider>
      <Layout style={{ background: '#F8F7F5' }}>
        <Content style={{ padding: '4px 4px 4px 0', height: '100%', overflow: 'hidden' }}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/devices" element={<DevicePage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Content>
      </Layout>
    </Layout>
  )
}

export default App
