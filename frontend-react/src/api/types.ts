export interface TaskRequest {
  task: string
  model_name?: string
  device_id?: string
  max_steps?: number
  delay_after_capture?: number
  reflush_app?: boolean
  auto_reply?: boolean
}

export interface TaskResponse {
  task_id: string
  session_id?: string
  status?: string | { value: string }
}

export type MessageContent =
  | string
  | Array<{
      type: 'text' | 'image_url'
      text?: string
      image_url?: { url: string }
    }>

export interface ChatMessage {
  role: string
  content: MessageContent
}

export interface StreamEvent {
  type: 'message' | 'error' | 'complete'
  session_id?: string
  task_id?: string
  log_index?: number
  message?: ChatMessage
  status?: string
  error?: string
}

export interface HistoryItem {
  session_id: string
  task: string
  model_name: string
  log_path?: string
  updated_at?: number
}

export interface HistoryDetail {
  session_id: string
  messages: ChatMessage[]
}

export interface ModelInfo {
  name: string
  model_name?: string
  label?: string
  provider?: string
}

