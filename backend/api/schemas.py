from enum import Enum
from typing import Any, Dict, List, Optional, Union

from pydantic import BaseModel


class TaskStatus(str, Enum):
    pending = "pending"
    running = "running"
    completed = "completed"
    failed = "failed"
    stopped = "stopped"


class TaskRequest(BaseModel):
    task: str
    model_name: Optional[str] = None
    device_id: Optional[str] = None
    max_steps: Optional[int] = None
    delay_after_capture: Optional[float] = None
    reflush_app: Optional[bool] = True
    auto_reply: Optional[bool] = True


class TaskResponse(BaseModel):
    task_id: str
    session_id: Optional[str] = None
    status: Optional[Union[str, TaskStatus]] = None


class HistoryItem(BaseModel):
    session_id: str
    task: str
    model_name: str
    log_path: Optional[str] = None
    updated_at: Optional[float] = None


class HistoryDetail(BaseModel):
    session_id: str
    messages: List[Dict[str, Any]]

