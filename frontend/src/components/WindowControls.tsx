import React, { useCallback, useEffect, useState } from 'react'
import { WindowIsMaximised, WindowMinimise, WindowToggleMaximise, Quit } from '../../wailsjs/runtime'
import { noDragStyle } from '../draggable'

const WindowControls: React.FC = () => {
  const [maximized, setMaximized] = useState(false)

  const refreshMaximized = useCallback(async () => {
    try {
      setMaximized(await WindowIsMaximised())
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    refreshMaximized()
  }, [refreshMaximized])

  const onToggleMaximize = () => {
    WindowToggleMaximise()
    setTimeout(refreshMaximized, 150)
  }

  return (
    <div className="win-controls" style={noDragStyle}>
      <button className="win-btn" title="最小化" onClick={() => WindowMinimise()}>
        <svg width="10" height="10" viewBox="0 0 10 10">
          <path d="M0 5 H10" stroke="currentColor" strokeWidth="1" />
        </svg>
      </button>
      <button className="win-btn" title={maximized ? '还原' : '最大化'} onClick={onToggleMaximize}>
        {maximized ? (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor">
            <rect x="0.5" y="2.5" width="7" height="7" />
            <path d="M2.5 2.5 V0.5 H9.5 V7.5 H7.5" />
          </svg>
        ) : (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor">
            <rect x="0.5" y="0.5" width="9" height="9" />
          </svg>
        )}
      </button>
      <button className="win-btn win-btn-close" title="关闭" onClick={() => Quit()}>
        <svg width="10" height="10" viewBox="0 0 10 10">
          <path d="M0 0 L10 10 M10 0 L0 10" stroke="currentColor" strokeWidth="1" />
        </svg>
      </button>
    </div>
  )
}

export default WindowControls
