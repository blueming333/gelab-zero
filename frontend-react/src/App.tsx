import { useEffect, useMemo, useState } from 'react'
import { Alert, Button, Col, Row, Space, Spin, Statistic, Tag, Typography, message } from 'antd'
import { useQuery } from '@tanstack/react-query'
import './App.css'
import { TaskComposer } from './components/TaskComposer'
import { TimelineView } from './components/TimelineView'
import { HistoryPanel } from './components/HistoryPanel'
import { createTask, fetchHistoryDetail, fetchModels, listHistory, openTaskStream, stopTask } from './api/client'
import type { ChatMessage, HistoryItem, TaskRequest, TaskResponse } from './api/types'

const { Text } = Typography

type StreamStatus = 'idle' | 'streaming' | 'done' | 'error' | 'history'

function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [currentTask, setCurrentTask] = useState<TaskResponse | null>(null)
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const [streamStatus, setStreamStatus] = useState<StreamStatus>('idle')
  const [cleanup, setCleanup] = useState<(() => void) | null>(null)
  const [activeHistory, setActiveHistory] = useState<HistoryItem | null>(null)

  const apiBase = import.meta.env.VITE_API_BASE || '（相对地址，需本地代理）'

  const { data: models = [], isLoading: loadingModels } = useQuery({
    queryKey: ['models'],
    queryFn: fetchModels,
  })

  const {
    data: history = [],
    isLoading: loadingHistory,
    refetch: refetchHistory,
  } = useQuery({
    queryKey: ['history'],
    queryFn: () => listHistory(30),
    refetchInterval: 20_000,
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
      case 'history':
        return 'default'
      default:
        return 'default'
    }
  }, [streamStatus])

  // 默认选中 model_config 键为 "local" 或 model_name 为 gelab-zero-4b-preview
  const preferredModel =
    models.find((m) => m.name === 'local') ||
    models.find((m) => (m.model_name || m.name) === 'gelab-zero-4b-preview') ||
    (models.length > 0 ? models[0] : undefined)

  const handleStartTask = async (payload: TaskRequest) => {
    cleanup?.()
    setMessages([])
    setActiveHistory(null)
    setStreamStatus('streaming')
    try {
      const resp = await createTask(payload)
      setCurrentTask(resp)
      setCurrentSessionId(resp.session_id || null)
      setStreamStatus('streaming')
      startStream(resp.task_id)
      message.success('任务已发布，开始流式跟踪')
      refetchHistory()
    } catch (error: any) {
      setStreamStatus('error')
      message.error(error?.message || '任务发布失败')
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
          message.error(errMsg)
          stop()
          setCleanup(null)
        }
        if (evt.type === 'complete') {
          setStreamStatus('done')
          message.success('任务已完成')
          stop()
          setCleanup(null)
        }
      },
      onError: () => {
        if (streamStatus === 'streaming') {
          setStreamStatus('error')
          message.error('SSE 连接异常')
        }
      },
    })
    setCleanup(() => stop)
  }

  const handleStop = async () => {
    if (!currentTask?.task_id) return
    try {
      await stopTask(currentTask.task_id)
      message.success('已请求停止任务')
    } catch (error: any) {
      message.error(error?.message || '停止任务失败')
    }
  }

  const handleOpenHistory = async (item: HistoryItem) => {
    cleanup?.()
    setStreamStatus('history')
    setActiveHistory(item)
    setCurrentTask(null)
    setCurrentSessionId(item.session_id)
    try {
      const detail = await fetchHistoryDetail(item.session_id)
      setMessages(detail.messages || [])
      message.info(`已加载历史会话 ${item.session_id}`)
    } catch (error: any) {
      message.error(error?.message || '加载历史失败')
    }
  }

  return (
    <div className="app">
      <div className="page-header">
        <div>
          <h2 className="page-title">实时任务跟踪（React 重构版）</h2>
          <Space>
            <Text type="secondary">API: {apiBase}</Text>
            <Tag color={statusColor}>状态: {streamStatus}</Tag>
            {currentSessionId && (
              <Tag color="purple">
                Session: <Text copyable style={{ marginLeft: 4 }}>{currentSessionId}</Text>
              </Tag>
            )}
          </Space>
        </div>
        <Space>
          <Statistic title="历史记录" value={history.length} />
          <Statistic title="模型数量" value={models.length} />
        </Space>
      </div>

      <div className="layout-grid">
        <div>
          <TaskComposer
            models={models}
            loading={loadingModels}
            defaultModelName={preferredModel?.name}
            onSubmit={handleStartTask}
          />
          {preferredModel && (
            <div style={{ marginTop: 8, color: '#64748b', fontSize: 13 }}>
              默认模型：{preferredModel.model_name || preferredModel.name}（键：{preferredModel.name}）
            </div>
          )}
          <div style={{ marginTop: 12 }}>
            <Alert
              type="info"
              showIcon
              title="提示"
              description="提交任务后自动通过 SSE 订阅实时日志；历史查看不会影响当前任务。"
            />
          </div>
          <HistoryPanel
            items={history}
            loading={loadingHistory}
            activeSessionId={activeHistory?.session_id || null}
            onSelect={handleOpenHistory}
          />
        </div>

        <div>
          <div className="card" style={{ marginBottom: 12, padding: 12 }}>
            <Row gutter={12} align="middle">
              <Col span={18}>
                <Space>
                  <Text strong>当前状态</Text>
                  <Tag color={statusColor}>{streamStatus}</Tag>
                </Space>
              </Col>
              <Col span={6} style={{ textAlign: 'right' }}>
                <Space>
                  <Button disabled={!currentTask?.task_id} onClick={handleStop}>
                    停止任务
                  </Button>
                  <Button
                    type="default"
                    disabled={!currentTask?.task_id || streamStatus !== 'done'}
                    onClick={() => currentTask?.task_id && startStream(currentTask.task_id)}
                  >
                    重连
                  </Button>
                </Space>
              </Col>
            </Row>
          </div>

          <Spin spinning={streamStatus === 'streaming' && messages.length === 0}>
            <TimelineView
              messages={messages}
              title={streamStatus === 'history' ? '历史轨迹' : '实时轨迹'}
              highlightType={streamStatus === 'history' ? 'history' : 'live'}
            />
          </Spin>
        </div>
      </div>
    </div>
  )
}

export default App
