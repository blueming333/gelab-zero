import asyncio
import json
import os
import time
import uuid
from copy import deepcopy
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional
import threading

import jsonlines
from fastapi import HTTPException
from megfile import smart_exists, smart_open

from copilot_agent_client.pu_client import evaluate_task_on_device
from copilot_agent_server.local_server import LocalServer
from copilot_front_end.mobile_action_helper import (
    get_device_wm_size,
    list_devices,
)
from visualization.log_formatter import meta2messages

from .schemas import (
    DeviceInfo,
    HistoryDetail,
    HistoryItem,
    TaskRequest,
    TaskResponse,
    TaskStatusResponse,
    TaskStatus,
)


@dataclass
class TaskContext:
    task_id: str
    task_text: str
    queue: asyncio.Queue
    status: TaskStatus = TaskStatus.pending
    session_id: Optional[str] = None
    created_at: float = field(default_factory=time.time)
    error: Optional[str] = None
    finished: bool = False
    session_event: asyncio.Event = field(default_factory=asyncio.Event)
    log_watcher: Optional[asyncio.Task] = None
    stop_event: threading.Event = field(default_factory=threading.Event)


class TaskRunner:
    def __init__(
        self,
        server_config: Dict[str, Any],
        rollout_config: Dict[str, Any],
        model_registry: Dict[str, Dict[str, Any]],
        default_model_name: str,
    ):
        self.server_config = server_config
        self.rollout_config = rollout_config
        self.model_registry = model_registry
        self.default_model_name = default_model_name
        self.log_dir = server_config["log_dir"]
        self.contexts: Dict[str, TaskContext] = {}
        self.loop: Optional[asyncio.AbstractEventLoop] = None
        self.selected_device_id: Optional[str] = None

    async def list_connected_devices(self) -> List[DeviceInfo]:
        devices = list_devices() or []
        infos: List[DeviceInfo] = []
        for device_id in devices:
            try:
                wm = get_device_wm_size(device_id)
                infos.append(DeviceInfo(device_id=device_id, device_wm_size=list(wm)))
            except Exception:
                infos.append(DeviceInfo(device_id=device_id, device_wm_size=None))
        return infos

    async def get_current_device(self) -> DeviceInfo:
        devices = list_devices() or []
        if not devices:
            raise HTTPException(status_code=404, detail="no connected devices")

        device_id = self.selected_device_id if self.selected_device_id in devices else devices[0]
        wm = get_device_wm_size(device_id)
        return DeviceInfo(device_id=device_id, device_wm_size=list(wm))

    async def select_device(self, device_id: str) -> DeviceInfo:
        devices = list_devices() or []
        if device_id not in devices:
            raise HTTPException(status_code=400, detail=f"device not connected: {device_id}")
        self.selected_device_id = device_id
        wm = get_device_wm_size(device_id)
        return DeviceInfo(device_id=device_id, device_wm_size=list(wm))

    async def get_task_status(self, task_id: str) -> TaskStatusResponse:
        context = self.contexts.get(task_id)
        if context is None:
            raise HTTPException(status_code=404, detail="task not found")
        return TaskStatusResponse(
            task_id=context.task_id,
            session_id=context.session_id,
            status=context.status,
            created_at=context.created_at,
            finished=context.finished,
            error=context.error,
        )

    async def start_task(self, payload: TaskRequest) -> TaskResponse:
        if self.loop is None:
            self.loop = asyncio.get_running_loop()

        queue: asyncio.Queue = asyncio.Queue()
        task_id = str(uuid.uuid4())
        context = TaskContext(task_id=task_id, task_text=payload.task, queue=queue, status=TaskStatus.running)
        self.contexts[task_id] = context

        asyncio.create_task(self._execute_task(context, payload))

        # 尝试等待 session_id 出现，但不要阻塞太久
        try:
            await asyncio.wait_for(context.session_event.wait(), timeout=1.0)
        except asyncio.TimeoutError:
            pass

        return TaskResponse(
            task_id=task_id,
            session_id=context.session_id,
            status=context.status,
        )

    async def stream_events(self, task_id: str):
        context = self.contexts.get(task_id)
        if context is None:
            raise HTTPException(status_code=404, detail="task not found")

        while True:
            event = await context.queue.get()
            yield event
            if event["type"] in {"complete", "error"}:
                break

    async def list_history(self, limit: int = 20) -> List[HistoryItem]:
        if not smart_exists(self.log_dir):
            return []

        candidates = []
        for file_name in os.listdir(self.log_dir):
            if not file_name.endswith(".jsonl"):
                continue
            path = os.path.join(self.log_dir, file_name)
            candidates.append((path, os.path.getmtime(path)))

        candidates.sort(key=lambda x: x[1], reverse=True)
        items: List[HistoryItem] = []
        for path, mtime in candidates[:limit]:
            with smart_open(path, "r", encoding="utf-8") as f:
                reader = jsonlines.Reader(f)
                logs = [log for log in reader]
            if not logs:
                continue
            config_log = logs[0].get("message", {})
            task = config_log.get("task")
            model_name = config_log.get("model_config", {}).get("model_name")
            if task is None or model_name is None:
                # 兼容旧日志或异常日志，跳过该文件
                continue
            items.append(
                HistoryItem(
                    session_id=os.path.splitext(os.path.basename(path))[0],
                    task=task,
                    model_name=model_name,
                    log_path=path,
                    updated_at=mtime,
                )
            )
        return items

    async def get_history_detail(self, session_id: str) -> HistoryDetail:
        log_path = os.path.join(self.log_dir, f"{session_id}.jsonl")
        if not smart_exists(log_path):
            raise HTTPException(status_code=404, detail="session not found")
        with smart_open(log_path, "r", encoding="utf-8") as f:
            reader = jsonlines.Reader(f)
            logs = [log for log in reader]
        return HistoryDetail(session_id=session_id, messages=meta2messages(logs))

    async def delete_history(self, session_id: str):
        log_path = os.path.join(self.log_dir, f"{session_id}.jsonl")
        image_dir = self.server_config.get("image_dir", "")

        if not smart_exists(log_path):
            raise HTTPException(status_code=404, detail="session not found")

        # delete log file
        try:
            os.remove(log_path)
        except OSError:
            pass

        # delete related images
        if image_dir and os.path.isdir(image_dir):
            for fname in os.listdir(image_dir):
                if fname.startswith(session_id):
                    try:
                        os.remove(os.path.join(image_dir, fname))
                    except OSError:
                        pass

        # remove context cache
        self.contexts.pop(session_id, None)

        return {"deleted": True}

    async def stop_task(self, task_id: str):
        context = self.contexts.get(task_id)
        if context is None:
            raise HTTPException(status_code=404, detail="task not found")
        if context.finished:
            return {"status": context.status.value}
        context.stop_event.set()
        return {"status": "stopping"}

    async def _execute_task(self, context: TaskContext, payload: TaskRequest):
        loop = asyncio.get_running_loop()

        def runner():
            try:
                server = LocalServer(self.server_config)
                original_get_session = server.get_session

                def wrapped_get_session(get_session_payload: Dict[str, Any]):
                    session_id = original_get_session(get_session_payload)
                    context.session_id = session_id
                    if self.loop is not None:
                        asyncio.run_coroutine_threadsafe(self._on_session_ready(context), self.loop)
                    return session_id

                server.get_session = wrapped_get_session

                device_info = self._resolve_device(payload.device_id)
                rollout_config = self._build_rollout_config(payload)

                try:
                    evaluate_task_on_device(
                        server,
                        device_info,
                        payload.task,
                        rollout_config,
                        reflush_app=payload.reflush_app,
                        auto_reply=payload.auto_reply,
                        stop_event=context.stop_event,
                    )
                except TypeError:
                    # 兼容旧版 evaluate_task_on_device 无 stop_event 参数
                    evaluate_task_on_device(
                        server,
                        device_info,
                        payload.task,
                        rollout_config,
                        reflush_app=payload.reflush_app,
                        auto_reply=payload.auto_reply,
                    )
            except Exception as exc:  # noqa: BLE001
                context.error = str(exc)
                raise

        try:
            await loop.run_in_executor(None, runner)
            if context.stop_event.is_set():
                context.status = TaskStatus.stopped
            else:
                context.status = TaskStatus.completed
        except Exception as exc:  # noqa: BLE001
            context.status = TaskStatus.failed
            context.error = context.error or str(exc)
            # 不再下发前端 error 事件，直接抛出让后端日志可见
            raise
        finally:
            context.finished = True
            if context.log_watcher is not None:
                await context.log_watcher
            if context.status != TaskStatus.failed:
                await context.queue.put(
                    {
                        "type": "complete",
                        "session_id": context.session_id,
                        "task_id": context.task_id,
                        "status": context.status.value,
                    }
                )

    def _resolve_device(self, device_id: Optional[str]) -> Dict[str, Any]:
        devices = list_devices()
        if not devices:
            raise RuntimeError("No available devices")
        target = device_id or self.selected_device_id or devices[0]
        device_wm_size = get_device_wm_size(target)
        return {
            "device_id": target,
            "device_wm_size": device_wm_size,
        }

    def _build_rollout_config(self, payload: TaskRequest) -> Dict[str, Any]:
        rollout_config = deepcopy(self.rollout_config)
        if payload.max_steps is not None:
            rollout_config["max_steps"] = payload.max_steps
        if payload.delay_after_capture is not None:
            rollout_config["delay_after_capture"] = payload.delay_after_capture

        target_model_name = payload.model_name or self.default_model_name
        if target_model_name not in self.model_registry:
            raise HTTPException(status_code=400, detail=f"Unknown model_name: {target_model_name}")

        model_entry = self.model_registry[target_model_name]
        base_model_config = deepcopy(self.rollout_config.get("model_config", {}))
        model_config = {
            # 实际模型名称用配置里的 model_name，provider 用键值或配置指定
            "model_name": model_entry.get("model_name", target_model_name),
            "model_provider": model_entry.get("model_provider", target_model_name),
            "args": deepcopy(model_entry.get("args") or base_model_config.get("args") or {}),
        }
        args = model_config.get("args") or {}
        args.setdefault("max_tokens", 512)
        args.setdefault("temperature", 0.5)
        args.setdefault("top_p", 1.0)
        args.setdefault("frequency_penalty", 0.0)
        model_config["args"] = args
        if "image_preprocess" in model_entry:
            model_config["image_preprocess"] = model_entry["image_preprocess"]

        rollout_config["model_config"] = model_config
        return rollout_config

    async def _on_session_ready(self, context: TaskContext):
        if context.log_watcher is None:
            context.log_watcher = asyncio.create_task(self._watch_logs(context))
        context.session_event.set()

    async def _watch_logs(self, context: TaskContext):
        if context.session_id is None:
            return
        log_path = os.path.join(self.log_dir, f"{context.session_id}.jsonl")

        while not smart_exists(log_path):
            if context.finished:
                return
            await asyncio.sleep(0.5)

        last_len = 0
        while True:
            try:
                with smart_open(log_path, "r", encoding="utf-8") as f:
                    reader = jsonlines.Reader(f)
                    logs = [log for log in reader]
            except FileNotFoundError:
                # 日志被删除（例如用户删除历史），直接退出 watcher
                return

            if len(logs) > last_len:
                messages = meta2messages(logs)
                for idx in range(last_len, len(logs)):
                    await context.queue.put(
                        {
                            "type": "message",
                            "session_id": context.session_id,
                            "task_id": context.task_id,
                            "log_index": idx,
                            "message": messages[idx],
                        }
                    )
                last_len = len(logs)

            if context.finished and len(logs) == last_len:
                break

            await asyncio.sleep(0.5)

