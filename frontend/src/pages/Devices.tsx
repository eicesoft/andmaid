import React from 'react'
import PageHeader from '../components/PageHeader'
import DeviceTerminal from '../components/DeviceTerminal'
import FilesPage from './Files'
import { Btn, Drawer, Float, ModalHost, TextInput, Tip } from '../components/ui'
import {
  IconCode,
  IconCloseCircle,
  IconDesktop,
  IconExpand,
  IconFolder,
  IconLaunch,
  IconRefresh,
  IconSearch,
} from '../components/icons'
import { Message } from '../components/Toast'
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
  const [confirmDel, setConfirmDel] = React.useState<{ title: string; children: string; onOk: () => void } | null>(null)

  // 「启动应用」弹层的锚点按钮：按行渲染多个，用 Map 管理
  const launchBtnRefs = React.useRef<Map<string, HTMLSpanElement>>(new Map())

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

  const fetchApps = React.useCallback(async (serial: string) => {
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
  }, [])

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
    setAppKeyword('')
    fetchApps(serial)
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

  const askCloseAll = (record: Device) => {
    const sids = Object.keys(screens).filter((id) => id.startsWith(record.serial + '#'))
    if (sids.length > 0) {
      setConfirmDel({
        title: '关闭投屏',
        children: `关闭 ${record.serial} 的 ${sids.length} 个投屏会话？`,
        onOk: () => {
          sids.forEach((id) => closeScreen(id))
          setConfirmDel(null)
        },
      })
    } else {
      Message.info('内嵌投屏请在投屏窗口内停止')
    }
  }

  return (
    <div className="page-card">
      <PageHeader
        title={
          <>
            设备管理
            <span className="muted">共 {devices.length} 台设备</span>
            <Btn
              iconOnly
              loading={loading}
              onPress={refresh}
              aria-label="刷新设备列表"
            >
              <IconRefresh />
            </Btn>
          </>
        }
      />
      <div className="table-wrap" style={{ marginTop: 12 }}>
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 280 }}>名称</th>
              <th style={{ width: 90 }}>状态</th>
              <th style={{ width: 160 }}>投屏</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {devices.length === 0 && (
              <tr>
                <td colSpan={4}>
                  <div className="table-empty">未检测到设备，请连接手机并开启 USB 调试</div>
                </td>
              </tr>
            )}
            {devices.map((record) => {
              const sessions = Object.keys(screens).filter((id) => id.startsWith(record.serial + '#'))
              const hasCast = sessions.length > 0 || embeds[record.serial]
              return (
                <tr key={record.serial}>
                  <td>
                    <div className="device-name-cell">
                      <span className="device-name">{record.serial}</span>
                      {record.model && <span className="device-model">{record.model}</span>}
                    </div>
                  </td>
                  <td>
                    <span className={`state-pill state-pill--${stateClass[record.state] || 'unknown'}`}>
                      <span className="state-pill-dot" />
                      {record.state === 'device' ? '在线' : record.state === 'offline' ? '离线' : record.state === 'unauthorized' ? '未授权' : record.state}
                    </span>
                  </td>
                  <td>
                    {embeds[record.serial] && <span className="device-cast device-cast--embed">内嵌中</span>}
                    {!embeds[record.serial] && sessions.length === 0 && (
                      <span className="device-cast device-cast--none">未启动</span>
                    )}
                    {sessions.map((id) => (
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
                      </span>
                    ))}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <Tip tip="窗口投屏">
                        <Btn
                          size="small"
                          iconOnly
                          isDisabled={record.state !== 'device'}
                          loading={opening === record.serial}
                          onPress={() => openScreen(record.serial)}
                          aria-label="窗口投屏"
                        >
                          <IconDesktop />
                        </Btn>
                      </Tip>
                      <Tip tip={embedNative ? '内嵌投屏' : '投屏 + 控制工具栏（macOS 不支持嵌入）'}>
                        <Btn
                          size="small"
                          iconOnly
                          isDisabled={record.state !== 'device'}
                          loading={openingEmbed === record.serial}
                          onPress={() => openEmbed(record.serial)}
                          aria-label="内嵌投屏"
                        >
                          <IconExpand />
                        </Btn>
                      </Tip>
                      <Tip tip="终端">
                        <Btn
                          size="small"
                          iconOnly
                          isDisabled={record.state !== 'device'}
                          onPress={() => setTerminalSerial(record.serial)}
                          aria-label="终端"
                        >
                          <IconCode />
                        </Btn>
                      </Tip>
                      <Tip tip="文件管理">
                        <Btn
                          size="small"
                          iconOnly
                          isDisabled={record.state !== 'device'}
                          onPress={() => setFilesSerial(record.serial)}
                          aria-label="文件管理"
                        >
                          <IconFolder />
                        </Btn>
                      </Tip>
                      <span
                        ref={(el) => {
                          if (el) launchBtnRefs.current.set(record.serial, el)
                          else launchBtnRefs.current.delete(record.serial)
                        }}
                      >
                        <Btn
                          size="small"
                          iconOnly
                          isDisabled={record.state !== 'device'}
                          loading={openingApp === record.serial}
                          onPress={() => {
                            if (appMenu.visible && appMenu.serial === record.serial) {
                              setAppMenu({ serial: '', visible: false })
                            } else {
                              openAppMenu(record.serial)
                            }
                          }}
                          aria-label="启动应用"
                          aria-expanded={appMenu.visible && appMenu.serial === record.serial}
                        >
                          <IconLaunch />
                        </Btn>
                      </span>
                      {hasCast && (
                        <Tip tip="关闭全部投屏">
                          <Btn
                            size="small"
                            iconOnly
                            onPress={() => askCloseAll(record)}
                            aria-label="关闭全部投屏"
                          >
                            <IconCloseCircle />
                          </Btn>
                        </Tip>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* 启动应用选择浮层 */}
      {devices.map((record) => (
        <Float
          key={record.serial}
          open={appMenu.visible && appMenu.serial === record.serial}
          onOpenChange={(v) => setAppMenu({ serial: v ? record.serial : '', visible: v })}
          triggerRef={{
            current: launchBtnRefs.current.get(record.serial) ?? null,
          }}
          placement="bottom end"
        >
          <div className="app-picker">
            <div style={{ display: 'flex', gap: 4 }}>
              <TextInput
                small
                prefix={<IconSearch />}
                placeholder="搜索应用名称或包名"
                value={appKeyword}
                onChange={setAppKeyword}
                ariaLabel="搜索应用"
              />
              <Btn
                size="small"
                iconOnly
                loading={appsLoading}
                onPress={() => fetchApps(record.serial)}
                aria-label="重新读取应用列表"
              >
                <IconRefresh />
              </Btn>
            </div>
            {appsLoading && <div className="app-picker-status">正在读取应用列表…</div>}
            {!appsLoading && appsError && <div className="app-picker-status app-picker-error">{appsError}</div>}
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
                      {a.system && <span className="tag tag--gray">系统</span>}
                      <span className="app-picker-name">{a.name}</span>
                    </div>
                    <span className="app-picker-pkg" title={a.package}>{a.package}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Float>
      ))}

      <Drawer
        open={!!terminalSerial}
        onClose={() => setTerminalSerial('')}
        title={
          <>
            <IconCode />
            <span>终端 - {terminalSerial}</span>
          </>
        }
      >
        {terminalSerial && <DeviceTerminal serial={terminalSerial} />}
      </Drawer>
      <Drawer
        open={!!filesSerial}
        onClose={() => setFilesSerial('')}
        title={
          <>
            <IconFolder />
            <span>文件管理 - {filesSerial}</span>
          </>
        }
      >
        {filesSerial && <FilesPage serial={filesSerial} />}
      </Drawer>

      <ModalHost modal={confirmDel} onClose={() => setConfirmDel(null)} />
    </div>
  )
}

export default DevicePage
