import { Form, Input, InputNumber, Select, Switch, Button, Space, Typography } from 'antd'
import { useState } from 'react'
import type { TaskRequest } from '../api/types'
import type { ModelInfo } from '../api/types'

type Props = {
  models: ModelInfo[]
  loading?: boolean
  defaultModelName?: string
  onSubmit: (payload: TaskRequest) => Promise<void> | void
}

const { TextArea } = Input
const { Title, Text } = Typography

export function TaskComposer({ models, loading, defaultModelName, onSubmit }: Props) {
  const [form] = Form.useForm<TaskRequest>()
  const [submitting, setSubmitting] = useState(false)

  // 后端期望传递的是模型“key”（name），显示用 model_name
  const initialModel =
    defaultModelName ||
    models.find((m) => m.model_name === defaultModelName)?.name ||
    models?.[0]?.name ||
    models?.[0]?.model_name

  const handleFinish = async (values: TaskRequest) => {
    setSubmitting(true)
    try {
      await onSubmit(values)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="card" style={{ padding: 16 }}>
      <Title level={4} style={{ marginBottom: 12 }}>
        发布任务
      </Title>
      <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
        结合模型选择、任务文本与可选参数，实时推送到后端执行并开启流式跟踪。
      </Text>
      <Form
        form={form}
        layout="vertical"
        initialValues={{ model_name: initialModel, reflush_app: true, auto_reply: true }}
        onFinish={handleFinish}
      >
        <Form.Item
          name="task"
          label="任务描述"
          rules={[{ required: true, message: '请输入任务描述' }]}
        >
          <TextArea rows={4} placeholder="例如：打开微信并发送一条消息给张三" />
        </Form.Item>

        <Form.Item name="model_name" label="模型选择" rules={[{ required: true, message: '请选择模型' }]}>
          <Select
            loading={loading}
            placeholder="请选择模型"
            options={models.map((m) => ({
              label: m.label || m.model_name || m.name,
              value: m.name, // 向后端传递模型 key（model_config 的键）
            }))}
          />
        </Form.Item>

        <Form.Item name="device_id" label="设备 ID" tooltip="留空则使用后端默认设备">
          <Input placeholder="可选，例如 emulator-5554" />
        </Form.Item>

        <Space style={{ width: '100%' }} size="middle" wrap>
          <Form.Item name="max_steps" label="最大步骤" style={{ flex: 1 }}>
            <InputNumber min={1} placeholder="可选" style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="delay_after_capture" label="截图后延迟(ms)" style={{ flex: 1 }}>
            <InputNumber min={0} placeholder="可选" style={{ width: '100%' }} />
          </Form.Item>
        </Space>

        <Space style={{ width: '100%' }} size="middle" wrap>
          <Form.Item name="reflush_app" label="重启目标 App" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="auto_reply" label="自动回复" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Space>

        <Form.Item>
          <Button type="primary" htmlType="submit" block loading={submitting || loading}>
            发布并开始跟踪
          </Button>
        </Form.Item>
      </Form>
    </div>
  )
}

