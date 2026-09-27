import React from 'react'
import {
  Button,
  Card,
  Dropdown,
  Input,
  Menu,
  Message,
  Modal,
  Progress,
  Space,
  Table,
  Typography,
  Tooltip,
} from '@arco-design/web-react'
import {
  IconDownload,
  IconCopy,
  IconScissor,
  IconDelete,
  IconPlus,
  IconUpload,
  IconRefresh,
  IconArrowUp,
  IconRight,
  IconFile,
  IconFolder,
  IconEdit,
  IconPaste,
  IconCompass,
  IconExport,
} from '@arco-design/web-react/icon'
import {
  CopyDeviceFiles,
  DeleteFiles,
  DownloadFile,
  InstallApk,
  ListDevices,
  ListFiles,
  ListStorages,
  Mkdir,
  MoveDeviceFiles,
  NewFile,
  PickAndInstallApk,
  RenameDeviceFile,
  UploadFiles,
} from '../../wailsjs/go/main/App'
import { EventsOn } from '../../wailsjs/runtime'
import PageHeader from '../components/PageHeader'
import type { main } from '../../wailsjs/go/models'

const { Text } = Typography

interface Device {
  serial: string
  state: string
  model: string
}

interface FilesPageProps {
  serial?: string
}

interface Entry extends main.FileEntry {}

interface InstallProgressEvent {
  serial: string
  file?: string
  percent: number
  stage: string
  message?: string
}

const fmtSize = (n: number) => {
  if (n <= 0) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`
}

const fmtTime = (iso: string) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const p = (v: number) => String(v).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

// 常用快捷目录（Android 标准用户目录）
const QUICK_DIRS = ['DCIM', 'Download', 'Movies', 'Music', 'Pictures', 'Documents']

const FilesPage: React.FC<FilesPageProps> = ({ serial: fixedSerial }) => {
  const [devices, setDevices] = React.useState<Device[]>([])
  const [serial, setSerial] = React.useState(fixedSerial || '')
  const [storage, setStorage] = React.useState('')
  const [storages, setStorages] = React.useState<main.DeviceStorage[]>([])
  const [path, setPath] = React.useState('')
  const [entries, setEntries] = React.useState<Entry[]>([])
  const [loading, setLoading] = React.useState(false)
  const [selected, setSelected] = React.useState<string[]>([])
  const [history, setHistory] = React.useState<string[]>([])
  const [clip, setClip] = React.useState<{ op: 'copy' | 'cut'; paths: string[] } | null>(null)
  const [installing, setInstalling] = React.useState<InstallProgressEvent | null>(null)
  const [uploadPct, setUploadPct] = React.useState<number | null>(null)
  const [editing, setEditing] = React.useState<{ title: string; label: string; value: string; ok: (v: string) => void } | null>(null)

  const online = devices.filter((d) => d.state === 'device')

  const loadStorages = React.useCallback(async (sn: string) => {
    try {
      const list = await ListStorages(sn)
      setStorages(list || [])
      const first = (list || [])[0]
      if (first) setStorage(first.id)
      return first ? first.id : ''
    } catch (e) {
      Message.error(String(e))
      return ''
    }
  }, [])

  const list = React.useCallback(async (sn: string, p: string, pushHist = true) => {
    setLoading(true)
    try {
      const list2 = await ListFiles(sn, p)
      setEntries(list2 || [])
      setPath(p)
      setSelected([])
      if (pushHist) setHistory((h) => [...h, p])
    } catch (e) {
      Message.error(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  // 初始：取设备列表，默认选第一台在线设备；指定 serial 时直接加载该设备
  const init = React.useCallback(async () => {
    if (fixedSerial) {
      const root = await loadStorages(fixedSerial)
      if (root) list(fixedSerial, root, true)
      return
    }
    try {
      const devs = await ListDevices()
      setDevices(devs || [])
      const first = (devs || []).find((d) => d.state === 'device')
      if (!first) {
        setSerial('')
        setEntries([])
        return
      }
      if (first.serial !== serial) {
        setSerial(first.serial)
        const root = await loadStorages(first.serial)
        if (root) list(first.serial, root, true)
      }
    } catch (e) {
      Message.error(String(e))
    }
  }, [fixedSerial, serial, list, loadStorages])

  React.useEffect(() => {
    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const switchDevice = async (sn: string) => {
    if (!sn || sn === serial) return
    setSerial(sn)
    setHistory([])
    setClip(null)
    const root = await loadStorages(sn)
    if (root) list(sn, root, true)
  }

  const switchStorage = async (sid: string) => {
    setStorage(sid)
    list(serial, sid, true)
  }

  const goUp = () => {
    if (path === '/' || path === '') return
    const parent = path.replace(/\/+$/, '').replace(/\/[^/]+$/, '') || '/'
    list(serial, parent, true)
  }

  const goBack = () => {
    if (history.length < 2) return
    const h = [...history]
    h.pop()
    const prev = h[h.length - 1]
    setHistory(h)
    list(serial, prev, false)
  }

  const openEntry = (e: Entry) => {
    if (!e.isDir) return
    const child = path === '/' ? `/${e.name}` : `${path}/${e.name}`
    list(serial, child, true)
  }

  const selPaths = selected.map((name) => (path === '/' ? `/${name}` : `${path}/${name}`))

  const doDelete = () => {
    if (selPaths.length === 0) return
    Modal.confirm({
      title: '删除确认',
      content: `确定删除选中的 ${selected.length} 项？此操作不可恢复。`,
      okButtonProps: { status: 'danger' },
      onOk: async () => {
        try {
          await DeleteFiles(serial, selPaths)
          Message.success('已删除')
          list(serial, path, false)
        } catch (e) {
          Message.error(String(e))
        }
      },
    })
  }

  const doPaste = async () => {
    if (!clip) return
    try {
      if (clip.op === 'copy') await CopyDeviceFiles(serial, clip.paths, path)
      else await MoveDeviceFiles(serial, clip.paths, path)
      Message.success(clip.op === 'copy' ? '复制完成' : '移动完成')
      if (clip.op === 'cut') setClip(null)
      list(serial, path, false)
    } catch (e) {
      Message.error(String(e))
    }
  }

  const doRename = (e: Entry) => {
    setEditing({
      title: '重命名',
      label: '新名称',
      value: e.name,
      ok: async (v: string) => {
        const full = path === '/' ? `/${e.name}` : `${path}/${e.name}`
        try {
          await RenameDeviceFile(serial, full, v.trim())
          Message.success('已重命名')
          list(serial, path, false)
        } catch (err) {
          Message.error(String(err))
        }
      },
    })
  }

  const doNew = (isDir: boolean) => {
    setEditing({
      title: isDir ? '新建文件夹' : '新建文件',
      label: '名称',
      value: isDir ? '新建文件夹' : '新建文件.txt',
      ok: async (v: string) => {
        const full = path === '/' ? `/${v.trim()}` : `${path}/${v.trim()}`
        try {
          if (isDir) await Mkdir(serial, full)
          else await NewFile(serial, full)
          Message.success('已创建')
          list(serial, path, false)
        } catch (err) {
          Message.error(String(err))
        }
      },
    })
  }

  const doDownload = async (e: Entry) => {
    const full = path === '/' ? `/${e.name}` : `${path}/${e.name}`
    try {
      const saved = await DownloadFile(serial, full)
      if (saved) Message.success(`已保存到 ${saved}`)
    } catch (err) {
      Message.error(String(err))
    }
  }

  const doUpload = async () => {
    setUploadPct(-1)
    try {
      await UploadFiles(serial, path)
    } catch (e) {
      Message.error(String(e))
    } finally {
      setUploadPct(null)
      list(serial, path, false)
    }
  }

  const doQuickInstall = async () => {
    // 顶栏「安装App」：选设备后直接装（多台时用第一台在线设备，可在设备下拉切换）
    if (online.length === 0) {
      Message.warning('未检测到在线设备')
      return
    }
    const sn = online.some((d) => d.serial === serial) ? serial : online[0].serial
    if (sn !== serial) await switchDevice(sn)
    try {
      await PickAndInstallApk(sn)
    } catch (e) {
      Message.error(String(e))
    } finally {
      setInstalling(null)
    }
  }

  React.useEffect(() => {
    const off1 = EventsOn('install:progress', (p: InstallProgressEvent) => {
      setInstalling(p)
      if (p.stage === 'done') {
        Message.success(p.message || '安装成功')
        window.setTimeout(() => setInstalling(null), 800)
      } else if (p.stage === 'error') {
        window.setTimeout(() => setInstalling(null), 2500)
      }
    })
    const off2 = EventsOn('upload:progress', (p: InstallProgressEvent) => {
      setUploadPct(p.percent)
    })
    return () => {
      off1()
      off2()
    }
  }, [])

  // 面包屑分段
  const crumbs: { name: string; path: string }[] = []
  if (storage) {
    crumbs.push({ name: storages.find((s) => s.id === storage)?.description || storage, path: storage })
    if (path && path !== storage) {
      let acc = storage === '/' ? '' : storage
      for (const seg of path.slice(storage.length).split('/').filter(Boolean)) {
        acc = `${acc}/${seg}`
        crumbs.push({ name: seg, path: acc })
      }
    }
  }

  const hasOnline = online.length > 0

  return (
    <Card className="files-card" bodyStyle={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {!fixedSerial && (
        <PageHeader
          title={
            <Space size={8}>
              文件管理
              <Typography.Text type="secondary">
                {serial ? serial : '未选择设备'}
              </Typography.Text>
            </Space>
          }
          extra={null}
        />
      )}
      <div className="files-toolbar" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Space size={4}>
          <Tooltip content="后退">
            <Button size="small" icon={<IconArrowUp style={{ transform: 'rotate(180deg)' }} />} disabled={history.length < 2} onClick={goBack} />
          </Tooltip>
          <Tooltip content="上级目录">
            <Button size="small" icon={<IconArrowUp />} disabled={!path || path === '/'} onClick={goUp} />
          </Tooltip>
        </Space>
        {/* 面包屑路径条 */}
        <div className="files-crumbs">
          {crumbs.map((c, i) => (
            <span key={c.path} className="files-crumb">
              {i > 0 && <IconRight className="files-crumb-sep" />}
              <span
                className="files-crumb-link"
                onClick={() => c.path !== path && list(serial, c.path, true)}
              >
                {c.name}
              </span>
            </span>
          ))}
        </div>
        <Space size={8} style={{ marginLeft: 'auto' }}>
          {!fixedSerial && (
            <Dropdown
              trigger="click"
              droplist={
                <Menu>
                  {online.map((d) => (
                    <Menu.Item key={d.serial} onClick={() => switchDevice(d.serial)}>
                      {d.serial === serial ? '✓ ' : ''}{d.model || d.serial}
                    </Menu.Item>
                  ))}
                  {online.length === 0 && <Menu.Item key="none" disabled>无在线设备</Menu.Item>}
                </Menu>
              }
            >
              <Button size="small" disabled={!hasOnline}>
                {serial ? `设备: ${serial}` : '选择设备'}
              </Button>
            </Dropdown>
          )}
          {storages.length > 1 && (
            <Dropdown
              trigger="click"
              droplist={
                <Menu>
                  {storages.map((s) => (
                    <Menu.Item key={s.id} onClick={() => switchStorage(s.id)}>
                      {s.id === storage ? '✓ ' : ''}{s.description}
                    </Menu.Item>
                  ))}
                </Menu>
              }
            >
              <Button size="small">{storages.find((s) => s.id === storage)?.description || '存储'}</Button>
            </Dropdown>
          )}
        </Space>
      </div>

      <div className="files-actions" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
        <Space size={4}>
          <Tooltip content="新建文件夹">
            <Button size="small" icon={<IconPlus />} onClick={() => doNew(true)} />
          </Tooltip>
          <Tooltip content="上传文件">
            <Button size="small" icon={<IconExport />} disabled={!hasOnline} loading={uploadPct !== null} onClick={doUpload} />
          </Tooltip>
          <Dropdown
            trigger="click"
            droplist={
              <Menu>
                {QUICK_DIRS.map((d) => (
                  <Menu.Item key={d} onClick={() => {
                    const target = storage === '/' ? `/${d}` : `${storage}/${d}`
                    list(serial, target, true)
                  }}>
                    {d}
                  </Menu.Item>
                ))}
              </Menu>
            }
          >
            <Button size="small" icon={<IconCompass />} disabled={!hasOnline} />
          </Dropdown>
        </Space>
        <Space size={4} style={{ marginLeft: 16 }}>
          <Tooltip content="下载到本机">
            <Button size="small" icon={<IconDownload />} disabled={selPaths.length === 0 || selPaths.length > 1} onClick={() => {
              const e = entries.find((x) => x.name === selected[0])
              if (e) doDownload(e)
            }} />
          </Tooltip>
          <Tooltip content="复制">
            <Button size="small" icon={<IconCopy />} disabled={selPaths.length === 0} onClick={() => { setClip({ op: 'copy', paths: selPaths }); Message.info(`已复制 ${selected.length} 项`) }} />
          </Tooltip>
          <Tooltip content="剪切">
            <Button size="small" icon={<IconScissor />} disabled={selPaths.length === 0} onClick={() => { setClip({ op: 'cut', paths: selPaths }); Message.info(`已剪切 ${selected.length} 项`) }} />
          </Tooltip>
          <Tooltip content="删除">
            <Button size="small" icon={<IconDelete />} disabled={selPaths.length === 0} status="danger" onClick={doDelete} />
          </Tooltip>
          {clip && (
            <Tooltip content={`粘贴 ${clip.paths.length} 项`}>
              <Button size="small" type="primary" icon={<IconPaste />} disabled={!hasOnline} onClick={doPaste} />
            </Tooltip>
          )}
          <Tooltip content="安装 APK 到当前设备">
            <Button size="small" icon={<IconUpload />} loading={!!installing} disabled={!hasOnline} onClick={doQuickInstall} />
          </Tooltip>
          <Tooltip content="刷新">
            <Button size="small" icon={<IconRefresh />} loading={loading} onClick={() => list(serial, path, false)} />
          </Tooltip>
        </Space>
      </div>

      <Table
        className="files-table"
        size="small"
        border={{ wrapper: false, cell: false }}
        style={{ marginTop: 8 }}
        loading={loading}
        data={entries}
        pagination={false}
        rowKey="name"
        rowSelection={{
          type: 'checkbox',
          selectedRowKeys: selected,
          onChange: (keys: (string | number)[]) => setSelected(keys.map(String)),
        }}
        noDataElement={<Text type="secondary">{hasOnline ? '空目录' : '未检测到在线设备，请连接手机并开启 USB 调试'}</Text>}
        columns={[
          {
            title: '名称',
            dataIndex: 'name',
            width: 320,
            ellipsis: true,
            render: (_: unknown, e: Entry) => (
              <Tooltip content={e.name}>
                <span className={`files-name ${e.isDir ? 'files-name--dir' : ''}`} onDoubleClick={() => openEntry(e)} onClick={() => e.isDir && openEntry(e)}>
                  {e.isDir ? <IconFolder style={{ color: '#f7b500', marginRight: 6 }} /> : <IconFile style={{ color: 'var(--color-text-3)', marginRight: 6 }} />}
                  {e.name}
                </span>
              </Tooltip>
            ),
          },
          {
            title: '大小',
            dataIndex: 'size',
            width: 110,
            render: (v: number, e: Entry) => (e.isDir ? '-' : fmtSize(v)),
          },
          {
            title: '更新时间',
            dataIndex: 'modTime',
            width: 155,
            render: (v: string) => fmtTime(v),
          },
          {
            title: '操作',
            width: 108,
            render: (_: unknown, e: Entry) => (
              <Space size={2}>
                <Tooltip content="下载到本机">
                  <Button size="mini" icon={<IconDownload />} onClick={() => doDownload(e)} />
                </Tooltip>
                <Tooltip content="重命名">
                  <Button size="mini" icon={<IconEdit />} onClick={() => doRename(e)} />
                </Tooltip>
                <Tooltip content="删除">
                  <Button size="mini" icon={<IconDelete />} status="danger" onClick={() => {
                    const full = path === '/' ? `/${e.name}` : `${path}/${e.name}`
                    Modal.confirm({
                      title: '删除确认',
                      content: `确定删除「${e.name}」？此操作不可恢复。`,
                      okButtonProps: { status: 'danger' },
                      onOk: async () => {
                        try {
                          await DeleteFiles(serial, [full])
                          Message.success('已删除')
                          list(serial, path, false)
                        } catch (err) {
                          Message.error(String(err))
                        }
                      },
                    })
                  }} />
                </Tooltip>
              </Space>
            ),
          },
        ]}
      />
      <div className="files-status">
        <Text type="secondary">{entries.length} 项{selected.length > 0 ? `，已选 ${selected.length} 项` : ''}</Text>
        <Text type="secondary">{serial}[{storage}]</Text>
      </div>

      {/* 新建/重命名弹窗 */}
      <Modal
        title={editing?.title}
        visible={!!editing}
        autoFocus
        focusLock
        onOk={() => {
          if (!editing) return
          const v = editing.value
          if (!v.trim()) { Message.warning('名称不能为空'); return }
          editing.ok(v)
          setEditing(null)
        }}
        onCancel={() => setEditing(null)}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Typography.Text>{editing?.label}</Typography.Text>
          <Input value={editing?.value} onChange={(v) => setEditing((s) => (s ? { ...s, value: v } : s))} />
        </Space>
      </Modal>

      {/* APK 安装进度弹窗 */}
      <Modal title="安装 APK" visible={!!installing} footer={null} closable={installing?.stage === 'done' || installing?.stage === 'error'} maskClosable={false} onCancel={() => setInstalling(null)}>
        {installing && (
          <Space direction="vertical" style={{ width: '100%' }}>
            <Typography.Text>
              {installing.stage === 'pushing' && '正在推送 APK 到设备…'}
              {installing.stage === 'installing' && '设备正在安装，请勿断开连接…'}
              {installing.stage === 'done' && '安装成功'}
              {installing.stage === 'error' && `安装失败：${installing.message || '未知错误'}`}
            </Typography.Text>
            {installing.stage !== 'error' && (
              <Progress percent={installing.percent < 0 ? 0 : installing.percent} status={installing.stage === 'done' ? 'success' : 'normal'} />
            )}
            {installing.percent < 0 && installing.stage !== 'done' && (
              <Text type="secondary">进度未知，取决于文件大小与设备速度</Text>
            )}
          </Space>
        )}
      </Modal>

      {/* 上传进度条 */}
      {uploadPct !== null && uploadPct >= 0 && uploadPct < 100 && (
        <div className="files-upload-bar">
          <Text type="secondary">上传中…</Text>
          <Progress style={{ width: 220 }} percent={uploadPct} size="small" />
        </div>
      )}
    </Card>
  )
}

export default FilesPage
