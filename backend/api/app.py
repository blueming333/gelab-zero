import asyncio
import json
import os
from typing import Dict, Any

import yaml
from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse

from .schemas import TaskRequest, TaskResponse
from .task_runner import TaskRunner


def load_model_registry(config_path: str) -> Dict[str, Dict[str, Any]]:
    if not os.path.exists(config_path):
        raise FileNotFoundError(f"model config not found: {config_path}")
    with open(config_path, "r", encoding="utf-8") as f:
        raw = yaml.safe_load(f) or {}
    registry: Dict[str, Dict[str, Any]] = {}
    for name, cfg in raw.items():
        if not isinstance(cfg, dict):
            continue
        provider = cfg.get("model_provider", cfg.get("provider", name))
        registry[name] = {
            "model_provider": provider,
            "args": {k: v for k, v in cfg.items() if k not in {"model_provider", "provider", "model_name"}},
            "model_name": cfg.get("model_name", name),
        }
    return registry


def build_rollout_config(default_model: str, model_registry: Dict[str, Dict[str, Any]]) -> Dict[str, Any]:
    base_model_cfg = model_registry.get(default_model, {})
    return {
        "task_type": "parser_0922_summary",
        "model_config": {
            "model_name": base_model_cfg.get("model_name", default_model),
            "model_provider": base_model_cfg.get("model_provider", default_model),
            "args": base_model_cfg.get("args") or {},
        },
        "max_steps": 200,
        "delay_after_capture": 1.5,
        "debug": False,
    }


LOG_DIR = os.environ.get("GELAB_LOG_DIR", "running_log/server_log/os-copilot-local-eval-logs/traces")
IMAGE_DIR = os.environ.get("GELAB_IMAGE_DIR", "running_log/server_log/os-copilot-local-eval-logs/images")
MODEL_CONFIG_PATH = os.environ.get("GELAB_MODEL_CONFIG", os.path.join(os.getcwd(), "model_config.yaml"))

os.makedirs(LOG_DIR, exist_ok=True)
os.makedirs(IMAGE_DIR, exist_ok=True)

model_registry = load_model_registry(MODEL_CONFIG_PATH)
if not model_registry:
    raise RuntimeError("model registry is empty, please check model_config.yaml")

default_model_name = next(iter(model_registry.keys()))
rollout_config = build_rollout_config(default_model_name, model_registry)

server_config = {
    "log_dir": LOG_DIR,
    "image_dir": IMAGE_DIR,
    "debug": False,
}

task_runner = TaskRunner(server_config, rollout_config, model_registry, default_model_name)
app = FastAPI(title="Gelab Zero Backend", version="0.1.0")


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/api/models")
async def list_models():
    return [{"name": name, **cfg} for name, cfg in model_registry.items()]


@app.post("/api/tasks", response_model=TaskResponse)
async def create_task(payload: TaskRequest):
    return await task_runner.start_task(payload)


@app.post("/api/tasks/{task_id}/stop")
async def stop_task(task_id: str):
    return await task_runner.stop_task(task_id)


@app.get("/api/tasks/history")
async def history(limit: int = 20):
    return await task_runner.list_history(limit)


@app.get("/api/tasks/history/{session_id}")
async def history_detail(session_id: str):
    return await task_runner.get_history_detail(session_id)


@app.get("/api/tasks/{task_id}/events")
async def task_events(task_id: str):
    async def event_generator():
        try:
            async for event in task_runner.stream_events(task_id):
                yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
        except HTTPException as exc:
            yield f"data: {json.dumps({'type': 'error', 'error': exc.detail})}\\n\\n"
    return StreamingResponse(event_generator(), media_type="text/event-stream")

