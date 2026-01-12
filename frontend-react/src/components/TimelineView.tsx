import { Card, Image, Badge, Timeline, Text, Title, Center } from '@mantine/core'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ChatMessage } from '../api/types'
import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'

type Props = {
  messages: ChatMessage[]
  title?: string
  highlightType?: 'live' | 'history'
}

const statusTag: Record<NonNullable<Props['highlightType']>, { color: string; text: string }> = {
  live: { color: 'green', text: '实时' },
  history: { color: 'blue', text: '历史' },
}

function splitContent(msg: ChatMessage) {
  let imageUrl: string | null = null
  const texts: ReactNode[] = []

  if (!msg) return { imageUrl, texts }

  if (typeof msg.content === 'string') {
    texts.push(
      <div className="message-md" key="text-0">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
      </div>,
    )
    return { imageUrl, texts }
  }

  if (Array.isArray(msg.content)) {
    msg.content.forEach((item, idx) => {
      if (item.type === 'image_url' && item.image_url?.url && !imageUrl) {
        imageUrl = item.image_url.url
      }
      if (item.type === 'text' && item.text) {
        texts.push(
          <div key={`text-${idx}`} className="message-md">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{item.text}</ReactMarkdown>
          </div>,
        )
      }
    })
  }

  return { imageUrl, texts }
}

export function TimelineView({ messages, title, highlightType = 'live' }: Props) {
  const tag = statusTag[highlightType]
  const containerRef = useRef<HTMLDivElement | null>(null)
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const autoScrollEnabled = useRef(true)

  const getScrollEl = () => {
    const node = containerRef.current
    if (!node) return null

    // Mantine ScrollArea 的可滚动元素通常在 data-viewport 上
    const viewport = node.closest('[data-viewport], .mantine-ScrollArea-viewport') as HTMLElement | null
    return viewport || node
  }

  useEffect(() => {
    const el = getScrollEl()
    if (!el) return

    // 检测用户是否手动滚动到其他位置
    const handleScroll = () => {
      const threshold = 100
      const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= threshold
      autoScrollEnabled.current = isNearBottom
    }

    el.addEventListener('scroll', handleScroll)
    return () => el.removeEventListener('scroll', handleScroll)
  }, [])

  useEffect(() => {
    const el = getScrollEl()
    if (!el) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
      return
    }

    // 只有在启用自动滚动时才滚动到底部
    const scrollToBottom = () => {
      if (!autoScrollEnabled.current) return
      el.scrollTo({ top: el.scrollHeight, behavior: 'auto' })
    }

    // 立即滚动
    scrollToBottom()

    // 等待图片加载完成后再次滚动
    const imgs = Array.from(el.querySelectorAll('img'))
    const loadHandlers = imgs.map(() => scrollToBottom)
    imgs.forEach((img, idx) => {
      if (!img.complete) {
        img.addEventListener('load', loadHandlers[idx])
      }
    })

    // 延迟滚动，确保 DOM 更新完成
    const timer = setTimeout(scrollToBottom, 100)

    return () => {
      clearTimeout(timer)
      imgs.forEach((img, idx) => img.removeEventListener('load', loadHandlers[idx]))
    }
  }, [messages])

  return (
    <div className="timeline-container" ref={containerRef}>
      <div className="timeline-header">
        <div className="timeline-title">
          <Title order={6}>{title || '任务轨迹'}</Title>
          <Badge color={tag.color} ml="xs">
            {tag.text}
          </Badge>
        </div>
        <Text c="dimmed" size="sm">
          总计 {messages.length} 条
        </Text>
      </div>

      {messages.length === 0 ? (
        <Center c="dimmed" py="md" style={{ minHeight: 120 }}>
          暂无数据
        </Center>
      ) : (
        <Timeline bulletSize={16} lineWidth={2} active={-1}>
          {messages.map((msg, idx) => (
            <Timeline.Item
              key={idx}
              title={
                <Text c="dimmed" size="sm">
                  #{idx + 1}
                </Text>
              }
              bullet={
                <Badge color={msg.role === 'system' ? 'blue' : 'green'} variant="filled">
                  {msg.role}
                </Badge>
              }
            >
              <Card padding="sm" radius="md" withBorder shadow="xs" className="message-card">
                {(() => {
                  const { imageUrl, texts } = splitContent(msg)
                  const hasImage = Boolean(imageUrl)
                  return (
                    <div className={`timeline-item-row ${hasImage ? 'has-image' : 'no-image'}`}>
                      {imageUrl && (
                        <div className="timeline-image contain">
                          <Image
                            src={imageUrl}
                            alt="screenshot"
                            radius="md"
                            fit="contain"
                          />
                        </div>
                      )}
                      <div className="timeline-text">
                        <Badge variant="light" color="gray" w="fit-content">
                          {msg.role === 'system' ? '系统' : '用户/Agent'}
                        </Badge>
                        {texts.length ? texts : <Text size="sm">（无文本）</Text>}
                      </div>
                    </div>
                  )
                })()}
              </Card>
            </Timeline.Item>
          ))}
          <div ref={bottomRef} />
        </Timeline>
      )}
    </div>
  )
}

