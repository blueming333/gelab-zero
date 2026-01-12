import { Card, Empty, Image, Tag, Timeline, Typography } from 'antd'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ChatMessage } from '../api/types'

const { Paragraph, Text } = Typography

type Props = {
  messages: ChatMessage[]
  title?: string
  highlightType?: 'live' | 'history'
}

const statusTag: Record<NonNullable<Props['highlightType']>, { color: string; text: string }> = {
  live: { color: 'green', text: '实时' },
  history: { color: 'blue', text: '历史' },
}

function renderContent(msg: ChatMessage) {
  if (!msg) return null

  if (typeof msg.content === 'string') {
    return (
      <div className="message-md">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
      </div>
    )
  }

  if (Array.isArray(msg.content)) {
    return msg.content.map((item, idx) => {
      if (item.type === 'image_url' && item.image_url?.url) {
        return (
          <div key={idx} style={{ marginTop: 8, marginBottom: 8 }}>
            <Image src={item.image_url.url} alt="screenshot" className="message-image" />
          </div>
        )
      }
      if (item.type === 'text' && item.text) {
        return (
          <div key={idx} className="message-md">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{item.text}</ReactMarkdown>
          </div>
        )
      }
      return null
    })
  }

  return null
}

export function TimelineView({ messages, title, highlightType = 'live' }: Props) {
  const tag = statusTag[highlightType]

  return (
    <div className="card timeline-container">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <Text strong>{title || '任务轨迹'}</Text>
          <Tag color={tag.color} style={{ marginLeft: 8 }}>
            {tag.text}
          </Tag>
        </div>
        <Text type="secondary">总计 {messages.length} 条</Text>
      </div>

      {messages.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无数据" />
      ) : (
        <Timeline
          mode="start"
          items={messages.map((msg, idx) => ({
            color: msg.role === 'system' ? 'blue' : 'green',
            title: <Text type="secondary">#{idx + 1}</Text>,
            content: (
              <Card className="message-card" size="small" styles={{ body: { padding: 12 } }}>
                <Paragraph strong style={{ marginBottom: 6 }}>
                  {msg.role === 'system' ? '系统' : '用户/Agent'}
                </Paragraph>
                {renderContent(msg)}
              </Card>
            ),
          }))}
        />
      )}
    </div>
  )
}

