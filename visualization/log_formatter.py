import base64
import json
from io import BytesIO
from typing import Any, Dict, List, Optional
import datetime

from megfile import smart_exists, smart_open
from PIL import Image

from tools.image_tools import draw_points


def long_side_resize(image: Image.Image, long_side: int = 800) -> Image.Image:
    """Resize image so that the longer side equals `long_side` if necessary."""
    image = image.convert("RGB")
    width, height = image.size
    if max(width, height) > long_side:
        if width >= height:
            new_width = long_side
            new_height = int(height * long_side / width)
        else:
            new_height = long_side
            new_width = int(width * long_side / height)
        image = image.resize((new_width, new_height), Image.Resampling.LANCZOS)
    return image


def make_b64_url(image: Image.Image) -> str:
    """Convert PIL.Image to base64 data URL."""
    buffered = BytesIO()
    image.save(buffered, format="JPEG")
    img_str = base64.b64encode(buffered.getvalue()).decode()
    return f"data:image/jpeg;base64,{img_str}"


def _apply_points_if_needed(image_url: str, action: Dict[str, Any]) -> str:
    """Draw point annotations if the action contains coordinates."""
    processed_url = image_url.replace(".jpeg", "_processed.jpeg")

    if smart_exists(processed_url):
        # Convert processed image to base64 data URL
        with smart_open(processed_url, "rb") as f:
            image = Image.open(f)
            return make_b64_url(image)

    with smart_open(image_url, "rb") as f:
        image = Image.open(f)
        image = long_side_resize(image, long_side=800)

    if "point1" in action and "point2" in action:
        points = [action["point1"], action["point2"]]
        draw_points(image, processed_url, points)
        # Return base64 data URL instead of file path
        return make_b64_url(image)

    if "point" in action:
        points = [action["point"]]
        draw_points(image, processed_url, points)
        # Return base64 data URL instead of file path
        return make_b64_url(image)

    # Save resized copy for consistency, but return base64 URL
    image.save(processed_url)
    return make_b64_url(image)


def meta2messages(logs: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Convert log records into chat-style messages."""
    if not logs:
        return []

    messages: List[Dict[str, Any]] = []
    config_log = logs[0]

    messages.append(
        {
            "role": "system",
            "content": f"### Task: {config_log['message']['task']}",
        }
    )

    env_act_logs = logs[1:]
    last_ts: Optional[datetime.datetime] = None
    for idx, log in enumerate(env_act_logs):
        env = log["message"]["environment"]
        action = log["message"]["action"]
        thought = action.pop("cot", "")
        llm_time = log["message"].get("llm_cost", {}).get("llm_time")

        # 步骤耗时 = 当前日志时间戳与上一条日志的差值
        duration_text = None
        ts_str = log.get("timestamp")
        if ts_str:
            try:
                current_ts = datetime.datetime.strptime(ts_str, "%Y-%m-%d %H:%M:%S")
                if last_ts is not None:
                    duration = (current_ts - last_ts).total_seconds()
                    duration_text = f"步骤耗时: {duration:.2f}s"
                last_ts = current_ts
            except Exception:
                last_ts = None

        extra_lines = []
        if duration_text:
            extra_lines.append(f"#### {duration_text}")
        if llm_time is not None:
            extra_lines.append(f"LLM耗时: {llm_time:.2f}s")

        image_url = env["image"]
        # Convert to base64 data URL for web display
        if not image_url.startswith("data:"):
            image_url = _apply_points_if_needed(image_url, action)

        env_msg = {
            "role": "user",
            "content": [
                {"type": "image_url", "image_url": {"url": image_url}},
                {
                    "type": "text",
                    "text": (
                        f"### 用户评论: {env['user_comment']}\n\n"
                        f"#### Task: {config_log['message']['task']}\n\n"
                        f"### 第{idx + 1} 轮模型动作:\n\n"
                        f"#### Thought:\n\n{thought}\n\n"
                        "```json\n"
                        f"{json.dumps(action, indent=2, ensure_ascii=False)}\n"
                        "```"
                        + ("\n\n" + "\n".join(extra_lines) if extra_lines else "")
                    ),
                },
            ],
        }
        messages.append(env_msg)

    return messages


