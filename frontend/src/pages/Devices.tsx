import React from 'react'
import {
  Button,
  Card,
  Drawer,
  Dropdown,
  Input,
  Message,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
} from '@arco-design/web-react'

import {
  IconDesktop,
  IconRefresh,
  IconCloseCircle,
  IconExpand,
  IconLaunch,
  IconSearch,
  IconCode,
  IconFolder,
} from '@arco-design/web-react/icon'
import {
  CloseScreen,
  EmbedNative,
  EmbedStatus,
  ListApps,
  ListDevices,
  OpenAppScreen,
  OpenScreen,
  OpenEmbedWindow,
  ScreenStatus,
} from '../../wailsjs/go/main/App'
import { EventsOn } from '../../wailsjs/runtime'
import PageHeader from '../components/PageHeader'
import DeviceTerminal from '../components/DeviceTerminal'
import FilesPage from './Files'

const { Text } = Typography

interface Device {
  serial: string
  state: string
  model: string
}

interface AndroidApp {
  name: string
  package: string
  system: boolean
}

const stateClass: Record<string, string> = {
  device: 'online',
  offline: 'offline',
  unauthorized: 'warn',
}

const DevicePage: React.FC = () => {
  const [devices, setDevices] = React.useState<Device[]>([])
  const [loading, setLoading] = React.useState(false)
  const [screens, setScreens] = React.useState<Record<string, boolean>>({})
  const [embeds, setEmbeds] = React.useState<Record<string, boolean>>({})
  const [opening, setOpening] = React.useState<string>('')
  const [openingEmbed, setOpeningEmbed] = React.useState<string>('')
  const [embedNative, setEmbedNative] = React.useState(true)
  const [appMenu, setAppMenu] = React.useState<{ serial: string; visible: boolean }>({ serial: '', visible: false })
  const [appsLoading, setAppsLoading] = React.useState(false)
  const [apps, setApps] = React.useState<AndroidApp[]>([])
  const [appsError, setAppsError] = React.useState('')
  const [appKeyword, setAppKeyword] = React.useState('')
  const [openingApp, setOpeningApp] = React.useState('')
  const [terminalSerial, setTerminalSerial] = React.useState('')
  const [filesSerial, setFilesSerial] = React.useState('')

  React.useEffect(() => {
    EmbedNative().then((v) => setEmbedNative(!!v)).catch(() => {})
  }, [])

  const refreshStatus = React.useCallback(async () => {
    try {
      const status = await ScreenStatus()
      setScreens(status || {})
      EmbedStatus().then(setEmbeds).catch(() => {})
    } catch {
      // 状态刷新失败不弹错，等下次刷新
    }
  }, [])

  const refresh = React.useCallback(async () => {
    setLoading(true)
    try {
      const [list, status] = await Promise.all([
        ListDevices(),
        ScreenStatus(),
      ])
      setDevices(list || [])
      setScreens(status || {})
      EmbedStatus().then(setEmbeds).catch(() => {})
    } catch (e) {
      Message.error(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    refresh()
  }, [refresh])

  // 内嵌投屏跑在独立进程，退出事件只发到该进程；轮询同步「内嵌中」状态
  React.useEffect(() => {
    const t = window.setInterval(() => {
      EmbedStatus().then(setEmbeds).catch(() => {})
    }, 3000)
    return () => window.clearInterval(t)
  }, [])

  React.useEffect(() => {
    const off = EventsOn('screen:exited', (sessionID: string) => {
      setScreens((s) => {
        if (!(sessionID in s)) return s
        const n = { ...s }
        delete n[sessionID]
        return n
      })
      Message.info(`${sessionID} 投屏已退出`)
    })
    return off
  }, [])

  const openScreen = async (serial: string) => {
    setOpening(serial)
    try {
      await OpenScreen(serial)
      Message.success(`已打开 ${serial} 投屏`)
      await refreshStatus()
    } catch (e) {
      Message.error(String(e))
    } finally {
      setOpening('')
    }
  }

  const openEmbed = async (serial: string) => {
    setOpeningEmbed(serial)
    try {
      await OpenEmbedWindow(serial)
      Message.success(embedNative ? `已打开 ${serial} 内嵌投屏` : `已打开 ${serial} 投屏（独立窗口 + 工具栏）`)
      setEmbeds((s) => ({ ...s, [serial]: true }))
    } catch (e) {
      Message.error(String(e))
    } finally {
      setOpeningEmbed('')
    }
  }

  const closeScreen = async (sessionID: string) => {
    try {
      await CloseScreen(sessionID)
      Message.info(`已关闭 ${sessionID} 投屏`)
      setScreens((s) => {
        const n = { ...s }
        delete n[sessionID]
        return n
      })
    } catch (e) {
      Message.error(String(e))
    }
  }

  const APPS_CACHE_KEY = 'andmaid.apps'
  const APPS_CACHE_TTL = 10 * 60 * 1000

  const readAppsCache = (serial: string): AndroidApp[] | null => {
    try {
      const raw = sessionStorage.getItem(APPS_CACHE_KEY)
      if (!raw) return null
      const all = JSON.parse(raw) as Record<string, { t: number; apps: AndroidApp[] }>
      const hit = all[serial]
      if (!hit || Date.now() - hit.t > APPS_CACHE_TTL) return null
      return hit.apps
    } catch {
      return null
    }
  }

  const writeAppsCache = (serial: string, apps: AndroidApp[]) => {
    try {
      const raw = sessionStorage.getItem(APPS_CACHE_KEY)
      const all = raw ? (JSON.parse(raw) as Record<string, { t: number; apps: AndroidApp[] }>) : {}
      all[serial] = { t: Date.now(), apps }
      sessionStorage.setItem(APPS_CACHE_KEY, JSON.stringify(all))
    } catch {
      // 缓存失败不影响功能
    }
  }

  const openAppMenu = async (serial: string) => {
    setAppMenu({ serial, visible: true })
    const cached = readAppsCache(serial)
    if (cached) {
      setApps(cached)
      setAppsError('')
      setAppKeyword('')
      setAppsLoading(false)
      return
    }
    setApps([])
    setAppsError('')
    setAppKeyword('')
    setAppsLoading(true)
    try {
      const list = await ListApps(serial)
      setApps(list || [])
      if (list && list.length > 0) writeAppsCache(serial, list)
    } catch (e) {
      setAppsError(String(e))
    } finally {
      setAppsLoading(false)
    }
  }

  const reloadApps = async (serial: string) => {
    setAppsLoading(true)
    setAppsError('')
    try {
      const list = await ListApps(serial)
      setApps(list || [])
      if (list && list.length > 0) writeAppsCache(serial, list)
    } catch (e) {
      setAppsError(String(e))
    } finally {
      setAppsLoading(false)
    }
  }

  const launchApp = async (serial: string, app: AndroidApp) => {
    setOpeningApp(app.package)
    try {
      await OpenAppScreen(serial, app.package)
      Message.success(`已打开 ${serial} 投屏并启动 ${app.name}`)
      await refreshStatus()
      setAppMenu({ serial: '', visible: false })
    } catch (e) {
      Message.error(String(e))
    } finally {
      setOpeningApp('')
    }
  }

  const filteredApps = apps
    .filter((a) => {
      const kw = appKeyword.trim().toLowerCase()
      if (!kw) return true
      return a.name.toLowerCase().includes(kw) || a.package.toLowerCase().includes(kw)
    })
    .sort(
      (a, b) =>
        Number(a.system) - Number(b.system) || a.name.localeCompare(b.name, 'zh-Hans-CN'),
    )

  return (
    <Card>
      <PageHeader
        title={
          <Space size={8}>
            设备管理
            <Typography.Text type="secondary">
              共 {devices.length} 台设备
            </Typography.Text>
            <Button
              icon={<IconRefresh />}
              loading={loading}
              onClick={refresh}
            />
          </Space>
        }
      />
      <Table
        className="device-table"
        size="small"
        border={{ wrapper: true, cell: false }}
        style={{ marginTop: 12 }}
        loading={loading}
        data={devices}
        pagination={false}
        rowKey="serial"
        noDataElement={<Text type="secondary">未检测到设备，请连接手机并开启 USB 调试</Text>}
        columns={[
          {
            title: '名称',
            dataIndex: 'serial',
            width: 280,
            render: (_: unknown, record: Device) => (
              <div className="device-name-cell">
                <span className="device-name">{record.serial}</span>
                {record.model && (
                  <span className="device-model">{record.model}</span>
                )}
              </div>
            ),          },
          {
            title: '状态',
            dataIndex: 'state',
            width: 90,
            render: (v: string) => (
              <span className={`device-state device-state--${stateClass[v] || 'unknown'}`}>
                <span className="device-state-dot" />
                {v === 'device' ? '在线' : v === 'offline' ? '离线' : v === 'unauthorized' ? '未授权' : v}
              </span>
            ),
          },
          {
            title: '投屏',
            width: 160,
            render: (_: unknown, record: Device) => {
              const sessions = Object.keys(screens).filter((id) => id.startsWith(record.serial + '#'))
              const items: React.ReactNode[] = []
              if (embeds[record.serial]) {
                items.push(<span key="embed" className="device-cast device-cast--embed">内嵌中</span>)
              }
              if (sessions.length === 0 && items.length === 0) {
                return <span className="device-cast device-cast--none">未启动</span>
              }
              for (const id of sessions) {
                items.push(
                  <span
                    key={id}
                    className="device-cast device-cast--live"
                    role="button"
                    tabIndex={0}
                    title="点击关闭该投屏"
                    onClick={() => closeScreen(id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') closeScreen(id)
                    }}
                  >
                    {id.split('#')[1] === '0' ? record.serial : `#${id.split('#')[1]}`}
                  </span>,
                )
              }
              return <Space size={4} wrap>{items}</Space>
            },
          },
          {
            title: '操作',
            render: (_: unknown, record: Device) => (
              <Space>
                <Tooltip content="窗口投屏">
                  <Button
                    size="small"
                    icon={<IconDesktop />}
                    disabled={record.state !== 'device'}
                    loading={opening === record.serial}
                    onClick={() => openScreen(record.serial)}
                  />
                </Tooltip>
                <Tooltip content={embedNative ? '内嵌投屏' : '投屏 + 控制工具栏（macOS 不支持嵌入）'}>
                  <Button
                    size="small"
                    icon={<IconExpand />}
                    disabled={record.state !== 'device'}
                    loading={openingEmbed === record.serial}
                    onClick={() => openEmbed(record.serial)}
                  />
                </Tooltip>
                <Tooltip content="终端">
                  <Button
                    size="small"
                    icon={<IconCode />}
                    disabled={record.state !== 'device'}
                    onClick={() => setTerminalSerial(record.serial)}
                  />
                </Tooltip>
                <Tooltip content="文件管理">
                  <Button
                    size="small"
                    icon={<IconFolder />}
                    disabled={record.state !== 'device'}
                    onClick={() => setFilesSerial(record.serial)}
                  />
                </Tooltip>
                <Dropdown
                  trigger="click"
                  position="br"
                  popupVisible={appMenu.visible && appMenu.serial === record.serial}
                  onVisibleChange={(v) => {
                    if (v && appMenu.serial !== record.serial) openAppMenu(record.serial)
                    else if (!v) setAppMenu({ serial: '', visible: false })
                  }}
                  droplist={
                    <div className="app-picker">
                      <div style={{ display: 'flex', gap: 4 }}>
                        <Input
                          size="small"
                          allowClear
                          prefix={<IconSearch />}
                          placeholder="搜索应用名称或包名"
                          value={appKeyword}
                          onChange={setAppKeyword}
                          style={{ flex: 1, width: 'auto' }}
                        />
                        <Button
                          size="small"
                          icon={<IconRefresh />}
                          loading={appsLoading}
                          onClick={() => reloadApps(record.serial)}
                        />
                      </div>
                      {appsLoading && (
                        <div className="app-picker-status">正在读取应用列表…</div>
                      )}
                      {!appsLoading && appsError && (
                        <div className="app-picker-status app-picker-error">{appsError}</div>
                      )}
                      {!appsLoading && !appsError && filteredApps.length === 0 && (
                        <div className="app-picker-status">无匹配应用</div>
                      )}
                      {!appsLoading && !appsError && filteredApps.length > 0 && (
                        <div className="app-picker-list">
                          {filteredApps.map((a) => (
                            <div
                              key={a.package}
                              className="app-picker-item"
                              onClick={() => launchApp(record.serial, a)}
                            >
                              <div className="app-picker-item-main">
                                {a.system && <Tag size="small" color="gray">系统</Tag>}
                                <span className="app-picker-name">{a.name}</span>
                              </div>
                              <span className="app-picker-pkg" title={a.package}>{a.package}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  }
                >
                  <Button
                    size="small"
                    icon={<IconLaunch />}
                    disabled={record.state !== 'device'}
                    loading={openingApp === record.serial}
                    onClick={() => openAppMenu(record.serial)}
                  />
                </Dropdown>
                {(Object.keys(screens).some((id) => id.startsWith(record.serial + '#')) || embeds[record.serial]) && (
                  <Button
                    size="small"
                    icon={<IconCloseCircle />}
                    onClick={() => {
                      const sids = Object.keys(screens).filter((id) => id.startsWith(record.serial + '#'))
                      if (sids.length > 0) sids.forEach((id) => closeScreen(id))
                      else Message.info('内嵌投屏请在投屏窗口内停止')
                    }}
                  />
                )}
              </Space>
            ),
          },
        ]}
      />
      <Drawer
        width={792}
        title={
          <Space size={8}>
            <IconCode />
            <span>终端 - {terminalSerial}</span>
          </Space>
        }
        visible={!!terminalSerial}
        onCancel={() => setTerminalSerial('')}
        unmountOnExit
        footer={null}
      >
        {terminalSerial && <DeviceTerminal serial={terminalSerial} />}
      </Drawer>
      <Drawer
        width={792}
        title={
          <Space size={8}>
            <IconFolder />
            <span>文件管理 - {filesSerial}</span>
          </Space>
        }
        visible={!!filesSerial}
        onCancel={() => setFilesSerial('')}
        unmountOnExit
        footer={null}
      >
        {filesSerial && <FilesPage serial={filesSerial} />}
      </Drawer>
    </Card>
  )
}

export default DevicePage
