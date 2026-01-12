import { Badge, Button, Group, ScrollArea, Stack, Text, Timeline, Title } from '@mantine/core'
import { IconListDetails, IconTrash } from '@tabler/icons-react'
import dayjs from 'dayjs'
import type { HistoryItem } from '../api/types'

type Props = {
  items: HistoryItem[]
  loading?: boolean
  activeSessionId?: string | null
  onSelect: (item: HistoryItem) => void
  onDelete: (item: HistoryItem) => Promise<void> | void
}

export function HistoryPanel({ items, loading, activeSessionId, onSelect, onDelete }: Props) {
  const timelineItems = items.map((item) => {
    const isActive = activeSessionId === item.session_id
    return {
      bullet: <IconListDetails size={14} />,
      title: (
        <Group gap="xs" wrap="nowrap">
          <Text fw={600} lineClamp={2} w="100%">
            {item.task}
          </Text>
          <Badge variant="light" color="blue">
            {item.model_name}
          </Badge>
        </Group>
      ),
      children: (
        <Group justify="space-between" align="center">
          <Text size="xs" c="dimmed">
            {item.updated_at ? dayjs(item.updated_at * 1000).format('MM-DD HH:mm:ss') : item.session_id}
          </Text>
          <Group gap="xs">
            <Button size="xs" variant={isActive ? 'filled' : 'light'} onClick={() => onSelect(item)}>
              查看
            </Button>
            <Button
              size="xs"
              variant="subtle"
              color="red"
              leftSection={<IconTrash size={14} />}
              onClick={() => onDelete(item)}
            >
              删除
            </Button>
          </Group>
        </Group>
      ),
      color: isActive ? 'blue' : 'gray',
    }
  })

  return (
    <Stack gap="xs">
      <Group justify="space-between">
        <Title order={6} m={0}>
          历史 Session
        </Title>
        <Text size="sm" c="dimmed">
          共 {items.length} 条
        </Text>
      </Group>
      <ScrollArea h="100%" type="auto">
        {items.length === 0 ? (
          <Text c="dimmed" size="sm">
            暂无历史记录
          </Text>
        ) : (
          <Timeline bulletSize={18} lineWidth={2} active={-1} color="blue">
            {timelineItems.map((t, idx) => (
              <Timeline.Item key={idx} {...t} />
            ))}
          </Timeline>
        )}
      </ScrollArea>
    </Stack>
  )
}

