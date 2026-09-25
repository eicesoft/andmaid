import React from 'react'
import {
  Button,
  Card,
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
} from '@arco-design/web-react/icon'
import {
  CloseScreen,
  EmbedNative,
  EmbedStatus,
  ListDevices,
  OpenScreen,
  OpenEmbedWindow,
  ScreenStatus,
} from '../../wailsjs/go/main/App'
import { EventsOn } from '../../wailsjs/runtime'
import PageHeader from '../components/PageHeader'

const { Text } = Typography

interface Device {
  serial: string
  state: string
  model: string
}

const stateColor: Record<string, string> = {
  device: 'green',
  offline: 'red',
  unauthorized: 'orange',
}

const DevicePage: React.FC = () => {
  const [devices, setDevices] = React.useState<Device[]>([])
  const [loading, setLoading] = React.useState(false)
  const [screens, setScreens] = React.useState<Record<string, boolean>>({})
  const [embeds, setEmbeds] = React.useState<Record<string, boolean>>({})
  const [opening, setOpening] = React.useState<string>('')
  const [openingEmbed, setOpeningEmbed] = React.useState<string>('')
  const [embedNative, setEmbedNative] = React.useState(true)

  React.useEffect(() => {
    EmbedNative().then((v) => setEmbedNative(!!v)).catch(() => {})
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
    const off = EventsOn('screen:exited', (serial: string) => {
      setScreens((s) => {
        if (!(serial in s)) return s
        const n = { ...s }
        delete n[serial]
        return n
      })
      Message.info(`${serial} 投屏已退出`)
    })
    return off
  }, [])

  const openScreen = async (serial: string) => {
    setOpening(serial)
    try {
      await OpenScreen(serial)
      Message.success(`已打开 ${serial} 投屏`)
      setScreens((s) => ({ ...s, [serial]: true }))
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

  const closeScreen = async (serial: string) => {
    try {
      await CloseScreen(serial)
      Message.info(`已关闭 ${serial} 投屏`)
      setScreens((s) => {
        const n = { ...s }
        delete n[serial]
        return n
      })
    } catch (e) {
      Message.error(String(e))
    }
  }

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
        style={{ marginTop: 16 }}
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
              <Space>
                <Text>{record.serial}</Text>
                {record.model && (
                  <Text style={{ color: '#a6a6a6' }}>（{record.model}）</Text>
                )}
              </Space>
            ),
          },
          {
            title: '状态',
            dataIndex: 'state',
            width: 100,
            render: (v: string) => (
              <Tag color={stateColor[v] || 'gray'}>
                {v === 'device' ? '在线' : v === 'offline' ? '离线' : v === 'unauthorized' ? '未授权' : v}
              </Tag>
            ),
          },
          {
            title: '投屏',
            width: 100,
            render: (_: unknown, record: Device) =>
              screens[record.serial] ? (
                <Tag color="blue">窗口投屏</Tag>
              ) : embeds[record.serial] ? (
                <Tag color="cyan">内嵌中</Tag>
              ) : (
                <Tag color="gray">未启动</Tag>
              ),
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
                {(screens[record.serial] || embeds[record.serial]) && (
                  <Button
                    size="small"
                    icon={<IconCloseCircle />}
                    onClick={() => {
                      if (screens[record.serial]) closeScreen(record.serial)
                      else Message.info('内嵌投屏请在投屏窗口内停止')
                    }}
                  />
                )}
              </Space>
            ),
          },
        ]}
      />
    </Card>
  )
}

export default DevicePage
