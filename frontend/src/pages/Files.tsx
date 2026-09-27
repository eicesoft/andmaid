import React from 'react'
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
import { Btn, Float, ModalHost, TextInput, Tip, type ModalState } from '../components/ui'
import {
  IconArrowUp,
  IconCompass,
  IconCopy,
  IconDelete,
  IconDownload,
  IconEdit,
  IconExport,
  IconFile,
  IconFolder,
  IconPaste,
  IconPlus,
  IconRefresh,
  IconRight,
  IconScissor,
  IconUpload,
} from '../components/icons'
import { Message } from '../components/Toast'
import type { filemgr } from '../../wailsjs/go/models'

interface Device {
  serial: string
  state: string
  model: string
}

interface FilesPageProps {
  serial?: string
}

interface Entry extends filemgr.FileEntry {}

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
  const [storages, setStorages] = React.useState<filemgr.DeviceStorage[]>([])
  const [path, setPath] = React.useState('')
  const [entries, setEntries] = React.useState<Entry[]>([])
  const [loading, setLoading] = React.useState(false)
  const [selected, setSelected] = React.useState<string[]>([])
  const [history, setHistory] = React.useState<string[]>([])
  const [clip, setClip] = React.useState<{ op: 'copy' | 'cut'; paths: string[] } | null>(null)
  const [installing, setInstalling] = React.useState<InstallProgressEvent | null>(null)
  const [uploadPct, setUploadPct] = React.useState<number | null>(null)
  const [editing, setEditing] = React.useState<{ title: string; label: string; value: string; ok: (v: string) => void } | null>(null)
  const [editingValue, setEditingValue] = React.useState('')
  const [modal, setModal] = React.useState<ModalState | null>(null)

  // 下拉锚点
  const devBtnRef = React.useRef<HTMLSpanElement>(null)
  const storBtnRef = React.useRef<HTMLSpanElement>(null)
  const quickBtnRef = React.useRef<HTMLSpanElement>(null)
  const [devOpen, setDevOpen] = React.useState(false)
  const [storOpen, setStorOpen] = React.useState(false)
  const [quickOpen, setQuickOpen] = React.useState(false)

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fixedSerial])

  React.useEffect(() => {
    init()
  }, [init])

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

  const toggleSel = (name: string) => {
    setSelected((s) => (s.includes(name) ? s.filter((x) => x !== name) : [...s, name]))
  }

  const doDelete = () => {
    if (selPaths.length === 0) return
    setModal({
      title: '删除确认',
      okDanger: true,
      okText: '删除',
      children: `确定删除选中的 ${selected.length} 项？此操作不可恢复。`,
      onOk: async () => {
        try {
          await DeleteFiles(serial, selPaths)
          Message.success('已删除')
          list(serial, path, false)
        } catch (e) {
          Message.error(String(e))
        }
        setModal(null)
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
    setEditingValue(e.name)
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
    setEditingValue(isDir ? '新建文件夹' : '新建文件.txt')
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

  const doInstallApk = InstallApk
  void doInstallApk

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

  // 编辑弹窗（新建/重命名共用）
  const editingModal: ModalState | null = editing
    ? {
        title: editing.title,
        children: (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label className="muted" style={{ fontSize: 12 }}>{editing.label}</label>
            <TextInput
              value={editingValue}
              onChange={setEditingValue}
              clearable={false}
              ariaLabel={editing.label}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const v = editingValue
                  if (!v.trim()) {
                    Message.warning('名称不能为空')
                    return
                  }
                  editing.ok(v)
                  setEditing(null)
                }
              }}
            />
          </div>
        ),
        onOk: () => {
          const v = editingValue
          if (!v.trim()) {
            Message.warning('名称不能为空')
            return
          }
          editing.ok(v)
          setEditing(null)
        },
      }
    : null

  // 删除确认（单行操作走这里，批量复用 doDelete 的 modal）
  const confirmDeleteOne = (e: Entry) => {
    setModal({
      title: '删除确认',
      okDanger: true,
      okText: '删除',
      children: `确定删除「${e.name}」？此操作不可恢复。`,
      onOk: async () => {
        const full = path === '/' ? `/${e.name}` : `${path}/${e.name}`
        try {
          await DeleteFiles(serial, [full])
          Message.success('已删除')
          list(serial, path, false)
        } catch (err) {
          Message.error(String(err))
        }
        setModal(null)
      },
    })
  }

  return (
    <div className={`page-card page-card--pad-top`}>
      {!fixedSerial && (
        <PageHeader
          title={
            <>
              文件管理
              <span className="muted">{serial ? serial : '未选择设备'}</span>
            </>
          }
        />
      )}
      <div className={`files-card-body ${fixedSerial ? '' : ''}`}>
        <div className="files-toolbar">
          <div style={{ display: 'flex', gap: 4 }}>
            <Tip tip="后退">
              <Btn size="small" iconOnly isDisabled={history.length < 2} onPress={goBack} aria-label="后退">
                <IconArrowUp style={{ transform: 'rotate(180deg)' }} />
              </Btn>
            </Tip>
            <Tip tip="上级目录">
              <Btn size="small" iconOnly isDisabled={!path || path === '/'} onPress={goUp} aria-label="上级目录">
                <IconArrowUp />
              </Btn>
            </Tip>
          </div>
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
          <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
            {!fixedSerial && (
              <>
                <span ref={devBtnRef}>
                  <Btn size="small" isDisabled={!hasOnline} onPress={() => setDevOpen(true)} aria-expanded={devOpen}>
                    {serial ? `设备: ${serial}` : '选择设备'}
                  </Btn>
                </span>
                <Float open={devOpen} onOpenChange={setDevOpen} triggerRef={devBtnRef} placement="bottom end">
                  <div className="device-terminal-quickmenu">
                    {online.map((d) => (
                      <div
                        key={d.serial}
                        className="device-terminal-quickitem"
                        onClick={() => {
                          switchDevice(d.serial)
                          setDevOpen(false)
                        }}
                      >
                        {d.serial === serial ? '✓ ' : ''}{d.model || d.serial}
                      </div>
                    ))}
                    {online.length === 0 && (
                      <div className="device-terminal-quickitem muted">无在线设备</div>
                    )}
                  </div>
                </Float>
              </>
            )}
            {storages.length > 1 && (
              <>
                <span ref={storBtnRef}>
                  <Btn size="small" onPress={() => setStorOpen(true)} aria-expanded={storOpen}>
                    {storages.find((s) => s.id === storage)?.description || '存储'}
                  </Btn>
                </span>
                <Float open={storOpen} onOpenChange={setStorOpen} triggerRef={storBtnRef} placement="bottom end">
                  <div className="device-terminal-quickmenu">
                    {storages.map((s) => (
                      <div
                        key={s.id}
                        className="device-terminal-quickitem"
                        onClick={() => {
                          switchStorage(s.id)
                          setStorOpen(false)
                        }}
                      >
                        {s.id === storage ? '✓ ' : ''}{s.description}
                      </div>
                    ))}
                  </div>
                </Float>
              </>
            )}
          </div>
        </div>

        <div className="files-actions">
          <div style={{ display: 'flex', gap: 4 }}>
            <Tip tip="新建文件夹">
              <Btn size="small" iconOnly onPress={() => doNew(true)} aria-label="新建文件夹">
                <IconPlus />
              </Btn>
            </Tip>
            <Tip tip="上传文件">
              <Btn size="small" iconOnly isDisabled={!hasOnline} loading={uploadPct !== null} onPress={doUpload} aria-label="上传文件">
                <IconExport />
              </Btn>
            </Tip>
            <span ref={quickBtnRef}>
              <Btn size="small" iconOnly isDisabled={!hasOnline} onPress={() => setQuickOpen(true)} aria-label="常用目录" aria-expanded={quickOpen}>
                <IconCompass />
              </Btn>
            </span>
            <Float open={quickOpen} onOpenChange={setQuickOpen} triggerRef={quickBtnRef}>
              <div className="device-terminal-quickmenu">
                {QUICK_DIRS.map((d) => (
                  <div
                    key={d}
                    className="device-terminal-quickitem"
                    onClick={() => {
                      const target = storage === '/' ? `/${d}` : `${storage}/${d}`
                      list(serial, target, true)
                      setQuickOpen(false)
                    }}
                  >
                    {d}
                  </div>
                ))}
              </div>
            </Float>
          </div>
          <div style={{ display: 'flex', gap: 4, marginLeft: 16 }}>
            <Tip tip="下载到本机">
              <Btn
                size="small"
                iconOnly
                isDisabled={selPaths.length === 0 || selPaths.length > 1}
                onPress={() => {
                  const e = entries.find((x) => x.name === selected[0])
                  if (e) doDownload(e)
                }}
                aria-label="下载到本机"
              >
                <IconDownload />
              </Btn>
            </Tip>
            <Tip tip="复制">
              <Btn size="small" iconOnly isDisabled={selPaths.length === 0} onPress={() => { setClip({ op: 'copy', paths: selPaths }); Message.info(`已复制 ${selected.length} 项`) }} aria-label="复制">
                <IconCopy />
              </Btn>
            </Tip>
            <Tip tip="剪切">
              <Btn size="small" iconOnly isDisabled={selPaths.length === 0} onPress={() => { setClip({ op: 'cut', paths: selPaths }); Message.info(`已剪切 ${selected.length} 项`) }} aria-label="剪切">
                <IconScissor />
              </Btn>
            </Tip>
            <Tip tip="删除">
              <Btn size="small" iconOnly variant="danger" isDisabled={selPaths.length === 0} onPress={doDelete} aria-label="删除">
                <IconDelete />
              </Btn>
            </Tip>
            {clip && (
              <Tip tip={`粘贴 ${clip.paths.length} 项`}>
                <Btn size="small" iconOnly variant="primary" isDisabled={!hasOnline} onPress={doPaste} aria-label="粘贴">
                  <IconPaste />
                </Btn>
              </Tip>
            )}
            <Tip tip="安装 APK 到当前设备">
              <Btn size="small" iconOnly loading={!!installing} isDisabled={!hasOnline} onPress={doQuickInstall} aria-label="安装 APK">
                <IconUpload />
              </Btn>
            </Tip>
            <Tip tip="刷新">
              <Btn size="small" iconOnly loading={loading} onPress={() => list(serial, path, false)} aria-label="刷新">
                <IconRefresh />
              </Btn>
            </Tip>
          </div>
        </div>

        <div className="files-table table-wrap">
          <table className="table files-table-inner">
            <thead>
              <tr>
                <th style={{ width: 34 }}>
                  <input
                    type="checkbox"
                    aria-label="全选"
                    checked={entries.length > 0 && selected.length === entries.length}
                    onChange={(e) => setSelected(e.target.checked ? entries.map((x) => x.name) : [])}
                  />
                </th>
                <th>名称</th>
                <th style={{ width: 110 }}>大小</th>
                <th style={{ width: 155 }}>更新时间</th>
                <th style={{ width: 108 }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 && (
                <tr>
                  <td colSpan={5}>
                    <div className="table-empty">
                      {hasOnline ? (loading ? '加载中…' : '空目录') : '未检测到在线设备，请连接手机并开启 USB 调试'}
                    </div>
                  </td>
                </tr>
              )}
              {entries.map((e) => (
                <tr key={e.name} style={selected.includes(e.name) ? { background: 'var(--accent-weak)' } : undefined}>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`选择 ${e.name}`}
                      checked={selected.includes(e.name)}
                      onChange={() => toggleSel(e.name)}
                    />
                  </td>
                  <td>
                    <Tip tip={e.name}>
                      <span
                        className={`files-name ${e.isDir ? 'files-name--dir' : ''}`}
                        onDoubleClick={() => openEntry(e)}
                        onClick={() => e.isDir && openEntry(e)}
                      >
                        {e.isDir ? <IconFolder style={{ color: '#f7b500' }} /> : <IconFile style={{ color: 'var(--ink-3)' }} />}
                        {e.name}
                      </span>
                    </Tip>
                  </td>
                  <td>{e.isDir ? '-' : fmtSize(e.size)}</td>
                  <td>{fmtTime(e.modTime)}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 2 }}>
                      <Tip tip="下载到本机">
                        <Btn size="mini" iconOnly onPress={() => doDownload(e)} aria-label="下载">
                          <IconDownload />
                        </Btn>
                      </Tip>
                      <Tip tip="重命名">
                        <Btn size="mini" iconOnly onPress={() => doRename(e)} aria-label="重命名">
                          <IconEdit />
                        </Btn>
                      </Tip>
                      <Tip tip="删除">
                        <Btn size="mini" iconOnly variant="danger" onPress={() => confirmDeleteOne(e)} aria-label="删除">
                          <IconDelete />
                        </Btn>
                      </Tip>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="files-status">
          <span className="muted-2">{entries.length} 项{selected.length > 0 ? `，已选 ${selected.length} 项` : ''}</span>
          <span className="muted-2">{serial}[{storage}]</span>
        </div>
      </div>

      {/* 新建/重命名弹窗 */}
      <ModalHost modal={editingModal} onClose={() => setEditing(null)} />

      {/* APK 安装进度弹窗 */}
      <ModalHost
        modal={
          installing
            ? {
                title: '安装 APK',
                closable: installing.stage === 'done' || installing.stage === 'error',
                children: (
                  <div className="selectable" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <span>
                      {installing.stage === 'pushing' && '正在推送 APK 到设备…'}
                      {installing.stage === 'installing' && '设备正在安装，请勿断开连接…'}
                      {installing.stage === 'done' && '安装成功'}
                      {installing.stage === 'error' && `安装失败：${installing.message || '未知错误'}`}
                    </span>
                    {installing.stage !== 'error' && (
                      <div className={`progress ${installing.stage === 'done' ? 'progress--success' : ''}`}>
                        <div
                          className="progress-inner"
                          style={{ width: `${installing.percent < 0 ? 0 : installing.percent}%` }}
                        />
                      </div>
                    )}
                    {installing.percent < 0 && installing.stage !== 'done' && (
                      <span className="muted">进度未知，取决于文件大小与设备速度</span>
                    )}
                  </div>
                ),
              }
            : null
        }
        onClose={() => setInstalling(null)}
      />

      {/* 普通确认弹窗（删除等） */}
      <ModalHost modal={modal} onClose={() => setModal(null)} />

      {/* 上传进度条 */}
      {uploadPct !== null && uploadPct >= 0 && uploadPct < 100 && (
        <div className="files-upload-bar">
          <span className="muted">上传中…</span>
          <progress value={uploadPct} max={100} />
        </div>
      )}
    </div>
  )
}

export default FilesPage
