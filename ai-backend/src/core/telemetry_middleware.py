import time
import asyncio
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response
from src.core.telemetry import metric_logger
from src.core.security import decode_access_token

class TelemetryMiddleware(BaseHTTPMiddleware):
    """
    Middleware đo đạc độ trễ phản hồi, mã trạng thái HTTP và số lượng API requests tự động.
    Tuân thủ BR-019 (Non-blocking telemetry collection) và NFR-020 (Overhead <= 5ms).
    """
    async def dispatch(self, request: Request, call_next):
        path = request.url.path

        # Bỏ qua các endpoint không cần ghi nhật ký (SSE stream để tránh đệ quy, healthcheck, docs)
        if (
            path.startswith("/api/v1/resources/stream")
            or path in ("/api/v1/health", "/docs", "/openapi.json", "/")
            or not path.startswith("/api/v1")
        ):
            return await call_next(request)

        # Đối với endpoint chat stream, bản thân handler sẽ đo TTFT & tokens chi tiết
        is_chat_stream = "/messages/stream" in path

        start_time = time.perf_counter()
        response: Response = await call_next(request)
        latency_ms = (time.perf_counter() - start_time) * 1000

        # Nếu không phải chat stream, ghi nhật ký telemetry chung cho các API khác
        if not is_chat_stream:
            # Trích xuất user_id từ cookie hoặc Authorization header
            user_id = None
            token = request.cookies.get("access_token")
            if not token and "authorization" in request.headers:
                auth_val = request.headers["authorization"]
                if auth_val.startswith("Bearer "):
                    token = auth_val[7:]

            if token:
                try:
                    payload = decode_access_token(token)
                    if payload and "sub" in payload:
                        user_id = payload["sub"]
                except Exception:
                    pass

            # Chạy non-blocking để không làm chậm response
            try:
                metric_logger.log_metric(
                    endpoint=path,
                    method=request.method,
                    status_code=response.status_code,
                    latency_ms=latency_ms,
                    user_id=user_id,
                    prompt_tokens=0,
                    completion_tokens=0,
                    total_tokens=0
                )
            except Exception:
                pass

        return response
