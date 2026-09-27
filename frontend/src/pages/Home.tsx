import React from 'react'
import { Button, Card, Message, Typography } from '@arco-design/web-react'
import { IconRefresh } from '@arco-design/web-react/icon'
import { AdbStatus, RestartAdbServer } from '../../wailsjs/go/main/App'
import type { adb as adbNS } from '../../wailsjs/go/models'
import PageHeader from '../components/PageHeader'

const { Text } = Typography

const HomePage: React.FC = () => {
  const [adb, setAdb] = React.useState<adbNS.Status | null>(null)
  const [adbLoading, setAdbLoading] = React.useState(false)
  const [restarting, setRestarting] = React.useState(false)

  const refreshAdb = React.useCallback(async () => {
    setAdbLoading(true)
    try {
      setAdb(await AdbStatus())
    } catch (e) {
      Message.error(String(e))
    } finally {
      setAdbLoading(false)
    }
  }, [])

  React.useEffect(() => {
    refreshAdb()
    const t = window.setInterval(refreshAdb, 5000)
    return () => window.clearInterval(t)
  }, [refreshAdb])

  const restartAdb = async () => {
    setRestarting(true)
    try {
      await RestartAdbServer()
      Message.success('adb server 已重启')
      await refreshAdb()
    } catch (e) {
      Message.error(String(e))
    } finally {
      setRestarting(false)
    }
  }

  const statePill = adb
    ? adb.running
      ? 'online'
      : 'offline'
    : 'unknown'
  const stateLabel = adb === null ? '检测中…' : adb.running ? '运行中' : '未运行'

  return (
    <Card>
      <PageHeader
        title={
          <Typography.Text>欢迎使用 Andmaid</Typography.Text>
        }
      />
      <div className="adb-status-bar" data-state={statePill} style={{ marginTop: 16 }}>
        {adb === null ? (
          <Text type="secondary">正在检测 adb server 状态…</Text>
        ) : adb.running ? (
          <>
            <span className="adb-status-item">
              <span className="adb-status-label">adb server</span>
              <span className="adb-status-value">{adb.version || '未知'}</span>
            </span>
            <span className="adb-status-divider" />
            <span className="adb-status-item">
              <span className="adb-status-label">已连接设备</span>
              <span className="adb-status-value">
                {adb.devices} 台
              </span>
            </span>
          </>
        ) : (
          <span className="adb-status-item adb-status-error">
            {adb.error || 'adb server 未运行，投屏前会自动拉起'}
          </span>
        )}
        <span className="adb-status-spacer" />
        <span className={`device-state device-state--${statePill}`}>
          <span className="device-state-dot" />
          {stateLabel}
        </span>
        <Button
          size="mini"
          icon={<IconRefresh />}
          loading={adbLoading || restarting}
          onClick={restartAdb}
        >
          重启
        </Button>
      </div>
    </Card>
  )
}

export default HomePage
