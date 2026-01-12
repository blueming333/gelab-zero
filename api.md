# GELab-Zero Backend API

本文档描述 `backend/api/app.py` 暴露的 FastAPI 接口（含本次补充的设备管理与任务状态查询）。

- 默认服务地址：`http://localhost:8000`
- 鉴权：当前版本**无鉴权**（如需对外网暴露，建议自行加鉴权/反向代理）
- 响应格式：除 SSE 外均为 JSON

---

## 0. 健康检查

### GET /health

用于探测服务是否存活。

**Response**
```json
{"status":"ok"}
```

---

## 1. Android 设备（ADB）管理

这些接口用于管理当前机器通过 ADB 连接的 Android 设备。

> 说明
> - 设备列表来自 `copilot_front_end.mobile_action_helper.list_devices()`。
> - 设备分辨率来自 `copilot_front_end.mobile_action_helper.get_device_wm_size(device_id)`。
> - 后端维护一个“当前选中设备”（进程内内存变量）。重启后会丢失。

### 1.1 列出已连接设备

#### GET /api/devices

**Response 200**
```json
[
  {"device_id":"emulator-5554","device_wm_size":[1080,2400]},
  {"device_id":"123456F","device_wm_size":[1080,2340]}
]
```

### 1.2 获取当前设备

#### GET /api/devices/current

返回当前选中设备；如果未选择，则返回列表第一个。

**Response 200**
```json
{"device_id":"emulator-5554","device_wm_size":[1080,2400]}
```

**Response 404**（无设备）
```json
{"detail":"no connected devices"}
```

### 1.3 选择/切换当前设备

#### POST /api/devices/select

**Request**
```json
{"device_id":"emulator-5554"}
```

**Response 200**
```json
{"device_id":"emulator-5554","device_wm_size":[1080,2400]}
```

**Response 400**（目标设备未连接）
```json
{"detail":"device not connected: emulator-5554"}
```

---

## 2. 任务管理

任务管理接口用于：启动任务、停止任务、查询任务状态、实时流式日志（SSE）、历史任务日志。

> 说明
> - 任务执行由 `backend/api/task_runner.py::TaskRunner` 负责。
> - `task_id`：本次运行的任务 ID（UUID）。
> - `session_id`：日志会话 ID，对应落地的 `*.jsonl` 文件名。
> - 实时日志使用 SSE：`GET /api/tasks/{task_id}/events`。

### 2.1 启动任务

#### POST /api/tasks

**Request** (`TaskRequest`)
```json
{
  "task": "打开微信，上下滑动",
  "model_name": "gelab-zero-4b-preview",
  "device_id": "emulator-5554",
  "max_steps": 200,
  "delay_after_capture": 1.5,
  "reflush_app": true,
  "auto_reply": true
}
```

字段说明（可选项可不传）：
- `task`：任务文本（必填）
- `model_name`：模型配置键（见 `/api/models`）
- `device_id`：指定设备；不传则使用当前选中设备或第一个设备
- `max_steps`：最大步骤数
- `delay_after_capture`：截图后延迟
- `reflush_app`：是否刷新应用
- `auto_reply`：是否自动回复

**Response 200** (`TaskResponse`)
```json
{
  "task_id": "6d2e...",
  "session_id": "70cdb46a-ba8e-4214-8fb4-991a42fa5188",
  "status": "running"
}
```

### 2.2 停止任务

#### POST /api/tasks/{task_id}/stop

**Response 200**
- 未结束时：
```json
{"status":"stopping"}
```
- 已结束时：
```json
{"status":"completed"}
```

### 2.3 查询任务状态（补充）

#### GET /api/tasks/{task_id}

用于查询当前任务的状态（running/completed/failed/stopped 等），并返回 `session_id`、错误信息等。

**Response 200** (`TaskStatusResponse`)
```json
{
  "task_id": "6d2e...",
  "session_id": "70cdb46a-ba8e-4214-8fb4-991a42fa5188",
  "status": "running",
  "created_at": 1734312345.12,
  "finished": false,
  "error": null
}
```

**Response 404**
```json
{"detail":"task not found"}
```

### 2.4 实时日志流（SSE）

#### GET /api/tasks/{task_id}/events

- `Content-Type: text/event-stream`
- 每条消息的格式为 SSE `data: <json>\n\n`

事件类型：
- `{"type":"message", ...}`：新增一条消息
- `{"type":"complete", ...}`：任务结束（completed/stopped）
- `{"type":"error", "error": "..."}`：SSE 层面的错误（例如 task_id 不存在）

**message 示例**
```json
{
  "type": "message",
  "session_id": "70cdb46a-ba8e-4214-8fb4-991a42fa5188",
  "task_id": "6d2e...",
  "log_index": 12,
  "message": {
    "role": "system",
    "content": "..."
  }
}
```

**complete 示例**
```json
{
  "type": "complete",
  "session_id": "70cdb46a-ba8e-4214-8fb4-991a42fa5188",
  "task_id": "6d2e...",
  "status": "completed"
}
```

> 客户端建议：断线重连时继续监听同一 `task_id` 的 SSE；也可以用 `/api/tasks/{task_id}` 查询状态。

### 2.5 历史任务列表

#### GET /api/tasks/history?limit=20

返回最近的历史记录（从日志目录读取 `*.jsonl`）。

**Response 200**
```json
[
  {
    "session_id": "70cdb46a-ba8e-4214-8fb4-991a42fa5188",
    "task": "打开微信，上下滑动",
    "model_name": "gelab-zero-4b-preview",
    "log_path": "running_log/.../traces/70cdb46a-ba8e-4214-8fb4-991a42fa5188.jsonl",
    "updated_at": 1734312400.12
  }
]
```

### 2.6 获取历史任务日志详情

#### GET /api/tasks/history/{session_id}

返回历史任务的结构化消息列表（供前端渲染）。

**Response 200**
```json
{
  "session_id": "70cdb46a-ba8e-4214-8fb4-991a42fa5188",
  "messages": [
    {"role":"system","content":"..."},
    {"role":"user","content":"..."}
  ]
}
```

**Response 404**
```json
{"detail":"session not found"}
```

### 2.7 删除历史任务

#### DELETE /api/tasks/history/{session_id}

删除对应的 `*.jsonl` 日志文件，并尝试删除相关图片。

**Response 200**
```json
{"deleted": true}
```

---

## 3. 模型列表

### GET /api/models

返回后端从 `model_config.yaml` 加载的模型注册表。

**Response 200**
```json
[
  {
    "name": "gelab-zero-4b-preview",
    "model_provider": "...",
    "args": {"max_tokens": 512, "temperature": 0.5},
    "model_name": "GELab-Zero-4B-preview"
  }
]
```
