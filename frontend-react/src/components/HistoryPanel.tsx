import { List, Typography, Tag, Space, Button, Empty } from 'antd'
import dayjs from 'dayjs'
import type { HistoryItem } from '../api/types'

const { Text } = Typography

type Props = {
  items: HistoryItem[]
  loading?: boolean
  activeSessionId?: string | null
  onSelect: (item: HistoryItem) => void
}

export function HistoryPanel({ items, loading, activeSessionId, onSelect }: Props) {
  return (
    <div className="card history-panel" style={{ padding: 16 }}>
      <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 8 }}>
        <Text strong>历史 Session</Text>
        <Text type="secondary">共 {items.length} 条</Text>
      </Space>

      {items.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无历史记录" />
      ) : (
        <List
          loading={loading}
          itemLayout="horizontal"
          dataSource={items}
          renderItem={(item) => {
            const isActive = activeSessionId === item.session_id
            return (
              <List.Item
                actions={[
                  <Button
                    type={isActive ? 'primary' : 'link'}
                    size="small"
                    onClick={() => onSelect(item)}
                    key="open"
                  >
                    查看
                  </Button>,
                ]}
              >
                <List.Item.Meta
                  title={
                    <Space>
                      <Text>{item.task}</Text>
                      <Tag color="blue">{item.model_name}</Tag>
                    </Space>
                  }
                  description={
                    <Text type="secondary">
                      {item.updated_at ? dayjs(item.updated_at * 1000).format('MM-DD HH:mm:ss') : item.session_id}
                    </Text>
                  }
                />
              </List.Item>
            )
          }}
        />
      )}
    </div>
  )
}

