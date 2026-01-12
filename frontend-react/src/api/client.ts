import axios from 'axios'
import type {
  TaskRequest,
  TaskResponse,
  HistoryItem,
  HistoryDetail,
  StreamEvent,
  ModelInfo,
} from './types'

const API_BASE = import.meta.env.VITE_API_BASE || ''

const api = axios.create({
  baseURL: API_BASE || undefined,
  timeout: 20000,
})

export async function createTask(payload: TaskRequest): Promise<TaskResponse> {
  const { data } = await api.post('/api/tasks', payload)
  return data
}

export async function stopTask(taskId: string): Promise<void> {
  await api.post(`/api/tasks/${taskId}/stop`)
}

export async function listHistory(limit = 20): Promise<HistoryItem[]> {
  const { data } = await api.get('/api/tasks/history', { params: { limit } })
  return data || []
}

export async function fetchHistoryDetail(sessionId: string): Promise<HistoryDetail> {
  const { data } = await api.get(`/api/tasks/history/${sessionId}`)
  return data
}

export async function fetchModels(): Promise<ModelInfo[]> {
  const { data } = await api.get('/api/models')
  if (!data) return []
  if (Array.isArray(data)) {
    return data.map((item) =>
      typeof item === 'string'
        ? { name: item, model_name: item, label: item }
        : {
            name: item.name,
            model_name: item.model_name || item.name,
            label: item.label || item.model_name || item.name,
            provider: item.model_provider || item.provider,
          },
    )
  }
  if (Array.isArray(data.models)) {
    return data.models.map((item: any) =>
      typeof item === 'string'
        ? { name: item, model_name: item, label: item }
        : {
            name: item.name,
            model_name: item.model_name || item.name,
            label: item.label || item.model_name || item.name,
            provider: item.model_provider || item.provider,
          },
    )
  }
  return []
}

type StreamHandlers = {
  onMessage?: (event: StreamEvent) => void
  onError?: (err: Event) => void
}

export function openTaskStream(taskId: string, handlers: StreamHandlers): () => void {
  const url = `${API_BASE || ''}/api/tasks/${taskId}/events`
  const es = new EventSource(url)

  es.onmessage = (event) => {
    try {
      const data: StreamEvent = JSON.parse(event.data)
      handlers.onMessage?.(data)
    } catch (error) {
      console.error('parse stream event error', error)
    }
  }

  es.onerror = (err) => {
    handlers.onError?.(err)
    es.close()
  }

  return () => es.close()
}

