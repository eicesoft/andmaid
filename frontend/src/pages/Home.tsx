import React from 'react'
import { Card, Input, Message, Space, Typography } from '@arco-design/web-react'
import { Greet } from '../../wailsjs/go/main/App'
import PageHeader from '../components/PageHeader'

const { Text } = Typography

const HomePage: React.FC = () => {
  const [name, setName] = React.useState('')
  const [greeting, setGreeting] = React.useState('')

  const onGreet = async () => {
    if (!name.trim()) {
      Message.warning('请输入名字')
      return
    }
    try {
      const result = await Greet(name)
      setGreeting(result)
    } catch (e) {
      Message.error(String(e))
    }
  }

  return (
    <Card>
      <PageHeader title="欢迎使用 Andmaid" />
      <Space direction="vertical" size="large" style={{ width: '100%', marginTop: 16 }}>
        <Text type="secondary">
          Wails v2 + Arco Design + React 框架已就绪。
        </Text>
        <Space>
          <Input
            placeholder="输入名字，测试 Go 绑定"
            style={{ width: 260 }}
            value={name}
            onChange={setName}
            onPressEnter={onGreet}
          />
          <Input.Search
            style={{ width: 140 }}
            searchButton
            defaultValue="打招呼"
            onSearch={onGreet}
          />
        </Space>
        {greeting && (
          <Card style={{ background: 'var(--color-fill-2)' }}>
            <Text>{greeting}</Text>
          </Card>
        )}
      </Space>
    </Card>
  )
}

export default HomePage
