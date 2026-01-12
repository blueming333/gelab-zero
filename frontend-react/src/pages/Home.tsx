import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createTask, fetchModels, openTaskStream, stopTask } from '../api/client'
import type { ChatMessage, TaskRequest, TaskResponse } from '../api/types'
import {
  Button,
  Card,
  Grid,
  Group,
  Loader,
  Stack,
  Text,
  Title,
  Badge,
  rem,
  Flex,
  ScrollArea,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconPlayerStop, IconPlugConnectedX, IconRefresh } from '@tabler/icons-react'
import { TaskComposer } from '../components/TaskComposer'
import { TimelineView } from '../components/TimelineView'

type StreamStatus = 'idle' | 'streaming' | 'done' | 'error'

function HomePage() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [currentTask, setCurrentTask] = useState<TaskResponse | null>(null)
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const [streamStatus, setStreamStatus] = useState<StreamStatus>('idle')
  const [cleanup, setCleanup] = useState<(() => void) | null>(null)

  const apiBase = import.meta.env.VITE_API_BASE || '（相对地址，需本地代理）'

  const { data: models = [], isLoading: loadingModels } = useQuery({
    queryKey: ['models'],
    queryFn: fetchModels,
  })

  useEffect(() => {
    return () => {
      cleanup?.()
    }
  }, [cleanup])

  const statusColor = useMemo(() => {
    switch (streamStatus) {
      case 'streaming':
        return 'green'
      case 'done':
        return 'blue'
      case 'error':
        return 'red'
      default:
        return 'default'
    }
  }, [streamStatus])

  const preferredModel =
    models.find((m) => (m.model_name || m.name) === 'gelab-zero-4b-preview') ||
    models.find((m) => m.name === 'local') ||
    (models.length > 0 ? models[0] : undefined)

  const handleStartTask = async (payload: TaskRequest) => {
    cleanup?.()
    setMessages([])
    setStreamStatus('streaming')
    try {
      const resp = await createTask(payload)
      setCurrentTask(resp)
      setCurrentSessionId(resp.session_id || null)
      setStreamStatus('streaming')
      startStream(resp.task_id)
      notifications.show({ color: 'green', message: '任务已发布，开始流式跟踪' })
    } catch (error: any) {
      setStreamStatus('error')
      notifications.show({ color: 'red', message: error?.message || '任务发布失败' })
    }
  }

  const startStream = (taskId: string) => {
    const stop = openTaskStream(taskId, {
      onMessage: (evt) => {
        if (evt.type === 'message' && evt.message) {
          setMessages((prev) => [...prev, evt.message!])
        }
        if (evt.type === 'error') {
          const errMsg = evt.error || (evt.message as any) || '任务执行出错'
          setStreamStatus('error')
          notifications.show({ color: 'red', message: errMsg })
          stop()
          setCleanup(null)
        }
        if (evt.type === 'complete') {
          setStreamStatus('done')
          notifications.show({ color: 'green', message: '任务已完成' })
          stop()
          setCleanup(null)
        }
      },
      onError: () => {
        if (streamStatus === 'streaming') {
          setStreamStatus('error')
          notifications.show({ color: 'red', message: 'SSE 连接异常' })
        }
      },
    })
    setCleanup(() => stop)
  }

  const handleStop = async () => {
    if (!currentTask?.task_id) return
    try {
      await stopTask(currentTask.task_id)
      notifications.show({ color: 'blue', message: '已请求停止任务' })
    } catch (error: any) {
      notifications.show({ color: 'red', message: error?.message || '停止任务失败' })
    }
  }

  return (
    <div className="app">
      <Grid gutter="md" style={{ height: '100%', flex: 1 }}>
        <Grid.Col span={4} style={{ display: 'flex', flexDirection: 'column' }}>
          <Stack gap="md" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <Card withBorder padding="md" radius="md" shadow="sm" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'auto' }}>
              <Stack gap="sm">
                <Group justify="space-between" align="center">
                  <Title order={5}>发布任务</Title>
                  <Badge variant="light" color="blue">
                    {apiBase || '相对路径'}
                  </Badge>
                </Group>
                <TaskComposer
                  models={models}
                  loading={loadingModels}
                  defaultModelName={preferredModel?.name}
                  onSubmit={handleStartTask}
                />
                {preferredModel && (
                  <Text size="sm" c="dimmed">
                    默认模型：{preferredModel.model_name || preferredModel.name}（键：{preferredModel.name}）
                  </Text>
                )}
              </Stack>
            </Card>
          </Stack>
        </Grid.Col>
        <Grid.Col span={8} style={{ display: 'flex', flexDirection: 'column' }}>
          <Stack gap="md" style={{ height: '100%' }}>
            <Card withBorder padding="sm" radius="md" shadow="sm">
              <Group justify="space-between" align="center">
                <Group gap="sm">
                  <Text fw={600}>当前状态</Text>
                  <Badge color={statusColor}>{streamStatus}</Badge>
                  {currentSessionId && (
                    <Badge variant="outline" color="grape">
                      Session: {currentSessionId}
                    </Badge>
                  )}
                </Group>
                <Group gap="xs">
                  <Button
                    variant="light"
                    leftSection={<IconPlayerStop size={16} />}
                    disabled={!currentTask?.task_id}
                    onClick={handleStop}
                  >
                    停止
                  </Button>
                  <Button
                    variant="outline"
                    leftSection={<IconRefresh size={16} />}
                    disabled={!currentTask?.task_id || streamStatus !== 'done'}
                    onClick={() => currentTask?.task_id && startStream(currentTask.task_id)}
                  >
                    重连
                  </Button>
                </Group>
              </Group>
            </Card>

            <Card
              withBorder
              padding="md"
              radius="md"
              shadow="sm"
              h="calc(100vh - 220px)"
            >
              {streamStatus === 'streaming' && messages.length === 0 ? (
                <Flex h="100%" align="center" justify="center">
                  <Loader color="blue" />
                </Flex>
              ) : (
                <ScrollArea 
                  h="100%"
                  type="auto"
                >
                  <TimelineView
                    messages={messages}
                    title="实时轨迹"
                    highlightType="live"
                  />
                </ScrollArea>
              )}
            </Card>
          </Stack>
        </Grid.Col>
      </Grid>
    </div>
  )
}

export default HomePage

