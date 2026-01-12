import { useState } from 'react'
import { Button, Flex, Space, Card, Grid, Stack, Text, Title, ScrollArea } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchHistoryDetail, listHistory, deleteHistory } from '../api/client'
import { HistoryPanel } from '../components/HistoryPanel'
import { TimelineView } from '../components/TimelineView'
import type { HistoryItem } from '../api/types'

function HistoryPage() {
  const queryClient = useQueryClient()
  const [active, setActive] = useState<HistoryItem | null>(null)
  const [messages, setMessages] = useState([])

  const {
    data: history = [],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['history'],
    queryFn: () => listHistory(50),
  })

  const handleSelect = async (item: HistoryItem) => {
    setActive(item)
    try {
      const detail = await fetchHistoryDetail(item.session_id)
      setMessages(detail.messages || [])
    } catch (err: any) {
      notifications.show({ color: 'red', message: err?.message || '加载历史失败' })
    }
  }

  const handleRefresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['history'] })
    refetch()
  }

  const handleDelete = async (item: HistoryItem) => {
    try {
      await deleteHistory(item.session_id)
      notifications.show({ color: 'green', message: '已删除' })
      if (active?.session_id === item.session_id) {
        setActive(null)
        setMessages([])
      }
      await handleRefresh()
    } catch (err: any) {
      notifications.show({ color: 'red', message: err?.message || '删除失败' })
    }
  }

  return (
    <div className="history-page">
      <Flex justify="space-between" align="center" style={{ marginBottom: 12 }}>
        <Space>
          <Title order={4} style={{ margin: 0 }}>
            历史记录
          </Title>
          <Text c="dimmed" size="sm">
            查看过往任务的轨迹与截图
          </Text>
        </Space>
        <Space>
          <Button variant="light" onClick={handleRefresh}>
            刷新
          </Button>
        </Space>
      </Flex>

      <Grid gutter="md">
        <Grid.Col span={4}>
          <Card withBorder padding="md" radius="md" shadow="sm" h="calc(100vh - 180px)">
            <ScrollArea h="100%" type="auto">
              <HistoryPanel
                items={history}
                loading={isLoading}
                activeSessionId={active?.session_id || null}
                onSelect={handleSelect}
                onDelete={handleDelete}
              />
            </ScrollArea>
          </Card>
        </Grid.Col>
        <Grid.Col span={8}>
          <Card withBorder padding="md" radius="md" shadow="sm" h="calc(100vh - 180px)">
            <ScrollArea h="100%" type="auto">
              <TimelineView
                messages={messages}
                title={active ? `Session: ${active.session_id}` : '请选择历史记录'}
                highlightType="history"
              />
            </ScrollArea>
          </Card>
        </Grid.Col>
      </Grid>
    </div>
  )
}

export default HistoryPage

