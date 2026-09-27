import React from 'react'
import { dragStyle, noDragStyle } from '../draggable'

interface PageHeaderProps {
  title: React.ReactNode
  extra?: React.ReactNode
}

// 各页面统一头部：左侧标题，右侧操作区，与设置页一致；整行可拖动窗口
const PageHeader: React.FC<PageHeaderProps> = ({ title, extra }) => (
  <div className="page-header" style={{ ...dragStyle }}>
    <h2 className="page-header-title">{title}</h2>
    {extra ? (
      <div className="page-header-extra" style={{ ...noDragStyle }}>{extra}</div>
    ) : null}
  </div>
)

export default PageHeader
