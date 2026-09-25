import React from 'react'
import { Space, Typography } from '@arco-design/web-react'
import { dragStyle, noDragStyle } from '../draggable'

const { Title } = Typography

interface PageHeaderProps {
  title: React.ReactNode
  extra?: React.ReactNode
}

// 各页面统一头部：左侧标题，右侧操作区，与设置页一致；整行可拖动窗口
const PageHeader: React.FC<PageHeaderProps> = ({ title, extra }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      height: 40,
      paddingRight: 150,
      ...dragStyle,
    }}
  >
    <Title heading={6} style={{ margin: 0, fontWeight: 700 }}>{title}</Title>
    {extra ? (
      <Space style={noDragStyle}>{extra}</Space>
    ) : null}
  </div>
)

export default PageHeader
