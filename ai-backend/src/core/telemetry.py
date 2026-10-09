import asyncio
import json
import uuid
from datetime import datetime, timedelta, timezone
from typing import Dict, Set, Optional, Tuple, Any, List
from src.db import query_one, query_all, execute_commit

class SSEConnectionManager:
    """Quản lý các kết nối EventSource SSE thời gian thực cho Telemetry Dashboard."""
    def __init__(self):
        # user_id -> Set[asyncio.Queue]
        self._subscribers: Dict[str, Set[asyncio.Queue]] = {}
        self._lock: Optional[asyncio.Lock] = None

    def _get_lock(self) -> asyncio.Lock:
        if self._lock is None:
            self._lock = asyncio.Lock()
        return self._lock

    async def connect(self, user_id: str) -> asyncio.Queue:
        queue: asyncio.Queue = asyncio.Queue()
        lock = self._get_lock()
        async with lock:
            if user_id not in self._subscribers:
                self._subscribers[user_id] = set()
            self._subscribers[user_id].add(queue)
        return queue

    async def disconnect(self, user_id: str, queue: asyncio.Queue):
        lock = self._get_lock()
        async with lock:
            if user_id in self._subscribers:
                self._subscribers[user_id].discard(queue)
                if not self._subscribers[user_id]:
                    del self._subscribers[user_id]

    async def broadcast(self, user_id: Optional[str], event: str, data: dict):
        """Phát sự kiện tới các subscriber thuộc user_id (và wildcard nếu có)."""
        payload = f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"
        targets: List[asyncio.Queue] = []

        lock = self._get_lock()
        async with lock:
            if user_id and user_id in self._subscribers:
                targets.extend(list(self._subscribers[user_id]))
            if "*" in self._subscribers:
                targets.extend(list(self._subscribers["*"]))

        for q in targets:
            try:
                q.put_nowait(payload)
            except (asyncio.QueueFull, Exception):
                pass


class QuotaManager:
    """Quản lý hạn ngạch Token hàng ngày và kiểm soát ngưỡng 80% / Chặn 100% (BR-020)."""
    @staticmethod
    def _get_next_midnight_utc() -> str:
        now = datetime.now(timezone.utc)
        next_day = (now + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
        return next_day.strftime("%Y-%m-%d %H:%M:%S")

    @classmethod
    def get_or_create_quota(cls, user_id: str) -> Dict[str, Any]:
        quota = query_one(
            "SELECT user_id, daily_token_limit, daily_tokens_used, reset_at FROM user_quotas WHERE user_id = ?",
            (user_id,)
        )

        now_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")

        if not quota:
            next_midnight = cls._get_next_midnight_utc()
            execute_commit(
                """
                INSERT INTO user_quotas (user_id, daily_token_limit, daily_tokens_used, reset_at)
                VALUES (?, 100000, 0, ?)
                """,
                (user_id, next_midnight)
            )
            return {
                "user_id": user_id,
                "daily_token_limit": 100000,
                "daily_tokens_used": 0,
                "reset_at": next_midnight
            }

        # Kiểm tra tự động làm mới Quota nếu đã qua 00:00 UTC
        if quota.get("reset_at") and quota["reset_at"] <= now_str:
            next_midnight = cls._get_next_midnight_utc()
            execute_commit(
                """
                UPDATE user_quotas
                SET daily_tokens_used = 0, reset_at = ?, updated_at = CURRENT_TIMESTAMP
                WHERE user_id = ?
                """,
                (next_midnight, user_id)
            )
            quota["daily_tokens_used"] = 0
            quota["reset_at"] = next_midnight

        return quota

    @classmethod
    def check_quota(cls, user_id: str, estimated_tokens: int = 1000) -> Tuple[bool, int, int, bool]:
        """
        Kiểm tra trạng thái quota.
        Trả về: (is_allowed, current_used, daily_limit, warning_80)
        """
        quota = cls.get_or_create_quota(user_id)
        current_used = quota["daily_tokens_used"]
        limit = quota["daily_token_limit"]

        # Điều kiện cho phép: chưa vượt ngưỡng 100%
        is_allowed = (current_used + estimated_tokens) <= limit
        warning_80 = current_used >= (0.8 * limit)

        return is_allowed, current_used, limit, warning_80

    @classmethod
    def consume_quota(cls, user_id: str, tokens: int) -> Dict[str, Any]:
        """Cộng dồn số token đã tiêu thụ vào hạn ngạch người dùng."""
        cls.get_or_create_quota(user_id)
        execute_commit(
            """
            UPDATE user_quotas
            SET daily_tokens_used = daily_tokens_used + ?, updated_at = CURRENT_TIMESTAMP
            WHERE user_id = ?
            """,
            (tokens, user_id)
        )
        return cls.get_or_create_quota(user_id)


class MetricLogger:
    """Dịch vụ ghi nhật ký đo đạc hiệu năng API và tổng hợp số liệu cho Dashboard."""
    def __init__(self, sse_mgr: SSEConnectionManager):
        self.sse_manager = sse_mgr

    def log_metric(
        self,
        endpoint: str,
        method: str,
        status_code: int,
        latency_ms: float,
        user_id: Optional[str] = None,
        ttft_ms: Optional[float] = None,
        model_name: Optional[str] = None,
        provider: Optional[str] = None,
        prompt_tokens: int = 0,
        completion_tokens: int = 0,
        total_tokens: int = 0,
        error_code: Optional[str] = None,
    ) -> Dict[str, Any]:
        metric_id = str(uuid.uuid4())
        execute_commit(
            """
            INSERT INTO api_metric_logs (
                id, user_id, endpoint, method, status_code,
                latency_ms, ttft_ms, model_name, provider,
                prompt_tokens, completion_tokens, total_tokens, error_code
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                metric_id, user_id, endpoint, method, status_code,
                round(latency_ms, 2),
                round(ttft_ms, 2) if ttft_ms is not None else None,
                model_name, provider,
                prompt_tokens, completion_tokens, total_tokens, error_code
            )
        )

        log_item = {
            "id": metric_id,
            "user_id": user_id,
            "endpoint": endpoint,
            "method": method,
            "status_code": status_code,
            "latency_ms": round(latency_ms, 2),
            "ttft_ms": round(ttft_ms, 2) if ttft_ms is not None else None,
            "model_name": model_name,
            "provider": provider,
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "total_tokens": total_tokens,
            "error_code": error_code,
            "created_at": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
        }

        # Đẩy sự kiện thời gian thực qua SSE nếu có event loop đang chạy
        if user_id:
            quota = QuotaManager.get_or_create_quota(user_id)
            quota_percent = round((quota["daily_tokens_used"] / max(quota["daily_token_limit"], 1)) * 100, 1)
            event_payload = {
                "metric": log_item,
                "quota": {
                    "daily_tokens_used": quota["daily_tokens_used"],
                    "daily_token_limit": quota["daily_token_limit"],
                    "percent_used": quota_percent,
                    "warning_80": quota_percent >= 80.0
                }
            }
            try:
                loop = asyncio.get_running_loop()
                loop.create_task(self.sse_manager.broadcast(user_id, "metric_update", event_payload))
            except RuntimeError:
                # Không có event loop (ví dụ khi chạy sync unit test)
                pass

        return log_item

    def get_metrics_summary(self, user_id: str, time_range: str = "24h") -> Dict[str, Any]:
        # Xác định điều kiện thời gian
        delta_map = {
            "1h": timedelta(hours=1),
            "24h": timedelta(hours=24),
            "7d": timedelta(days=7),
            "30d": timedelta(days=30),
        }
        delta = delta_map.get(time_range, timedelta(hours=24))
        since_time = (datetime.now(timezone.utc) - delta).strftime("%Y-%m-%d %H:%M:%S")

        # Truy vấn các bản ghi của user trong khoảng thời gian
        logs = query_all(
            """
            SELECT * FROM api_metric_logs
            WHERE user_id = ? AND created_at >= ?
            ORDER BY created_at ASC
            """,
            (user_id, since_time)
        )

        total_requests = len(logs)
        if total_requests == 0:
            quota = QuotaManager.get_or_create_quota(user_id)
            quota_percent = round((quota["daily_tokens_used"] / max(quota["daily_token_limit"], 1)) * 100, 1)
            return {
                "time_range": time_range,
                "total_requests": 0,
                "avg_latency_ms": 0.0,
                "avg_ttft_ms": 0.0,
                "total_tokens": 0,
                "prompt_tokens": 0,
                "completion_tokens": 0,
                "status_counts": {"2xx": 0, "4xx": 0, "5xx": 0},
                "tokens_by_provider": {"google": 0, "openai": 0, "anthropic": 0, "other": 0},
                "recent_trend": [],
                "quota_status": {
                    "daily_tokens_used": quota["daily_tokens_used"],
                    "daily_token_limit": quota["daily_token_limit"],
                    "percent_used": quota_percent,
                    "warning_80": quota_percent >= 80.0,
                    "reset_at": quota["reset_at"]
                }
            }

        total_latency = sum(r["latency_ms"] for r in logs)
        ttft_values = [r["ttft_ms"] for r in logs if r["ttft_ms"] is not None]

        total_tokens = sum(r["total_tokens"] for r in logs)
        prompt_tokens = sum(r["prompt_tokens"] for r in logs)
        completion_tokens = sum(r["completion_tokens"] for r in logs)

        status_counts = {"2xx": 0, "4xx": 0, "5xx": 0}
        tokens_by_provider = {"google": 0, "openai": 0, "anthropic": 0, "other": 0}

        for r in logs:
            sc = r["status_code"]
            if 200 <= sc < 300:
                status_counts["2xx"] += 1
            elif 400 <= sc < 500:
                status_counts["4xx"] += 1
            elif sc >= 500:
                status_counts["5xx"] += 1

            prov = (r["provider"] or "other").lower()
            if "google" in prov or "gemini" in prov:
                tokens_by_provider["google"] += r["total_tokens"]
            elif "openai" in prov or "gpt" in prov:
                tokens_by_provider["openai"] += r["total_tokens"]
            elif "anthropic" in prov or "claude" in prov:
                tokens_by_provider["anthropic"] += r["total_tokens"]
            else:
                tokens_by_provider["other"] += r["total_tokens"]

        # Lấy 30 điểm đo gần nhất cho biểu đồ sóng Trend
        recent_trend = [
            {
                "time": r["created_at"].split(" ")[1] if " " in r["created_at"] else r["created_at"],
                "latency_ms": r["latency_ms"],
                "ttft_ms": r["ttft_ms"] or 0.0,
                "tokens": r["total_tokens"]
            }
            for r in logs[-30:]
        ]

        quota = QuotaManager.get_or_create_quota(user_id)
        quota_percent = round((quota["daily_tokens_used"] / max(quota["daily_token_limit"], 1)) * 100, 1)

        return {
            "time_range": time_range,
            "total_requests": total_requests,
            "avg_latency_ms": round(total_latency / total_requests, 1),
            "avg_ttft_ms": round(sum(ttft_values) / len(ttft_values), 1) if ttft_values else 0.0,
            "total_tokens": total_tokens,
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "status_counts": status_counts,
            "tokens_by_provider": tokens_by_provider,
            "recent_trend": recent_trend,
            "quota_status": {
                "daily_tokens_used": quota["daily_tokens_used"],
                "daily_token_limit": quota["daily_token_limit"],
                "percent_used": quota_percent,
                "warning_80": quota_percent >= 80.0,
                "reset_at": quota["reset_at"]
            }
        }

    def get_metrics_history(self, user_id: str, limit: int = 50, offset: int = 0) -> List[Dict[str, Any]]:
        return query_all(
            """
            SELECT * FROM api_metric_logs
            WHERE user_id = ?
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
            """,
            (user_id, limit, offset)
        )


# Singleton instances
sse_manager = SSEConnectionManager()
quota_manager = QuotaManager()
metric_logger = MetricLogger(sse_manager)
