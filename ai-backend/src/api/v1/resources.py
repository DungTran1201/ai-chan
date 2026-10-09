import asyncio
import json
from fastapi import APIRouter, HTTPException, status, Depends, Request, Query
from fastapi.responses import StreamingResponse
from typing import Optional
from src.core.security import get_current_user, decode_access_token
from src.core.telemetry import metric_logger, quota_manager, sse_manager
from src.db import query_one

resources_router = APIRouter(prefix="/resources", tags=["Resource Management & Telemetry"])

def get_user_from_request_or_query(request: Request) -> dict:
    """Xác thực người dùng qua HttpOnly Cookie, Bearer Token hoặc Query param (dành cho EventSource)."""
    token = request.cookies.get("access_token")
    if not token and "authorization" in request.headers:
        auth_val = request.headers["authorization"]
        if auth_val.startswith("Bearer "):
            token = auth_val[7:]
    if not token:
        token = request.query_params.get("token")

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Chưa xác thực danh tính."
        )

    payload = decode_access_token(token)
    if not payload or "sub" not in payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token không hợp lệ hoặc đã hết hạn."
        )

    user = query_one("SELECT id, email, status FROM users WHERE id = ?", (payload["sub"],))
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Người dùng không tồn tại."
        )
    return user

@resources_router.get("/summary")
async def get_resources_summary(
    range: str = Query("24h", pattern="^(1h|24h|7d|30d)$", description="Khung thời gian lọc thống kê"),
    current_user: dict = Depends(get_current_user)
):
    """
    OP-018: Lấy tổng hợp chỉ số hiệu năng và hạn ngạch (KPI Summary).
    Tuân thủ BR-021: Người dùng chỉ xem được dữ liệu của chính mình.
    """
    user_id = current_user["id"]
    summary = metric_logger.get_metrics_summary(user_id=user_id, time_range=range)
    return {
        "status": "success",
        "data": summary
    }

@resources_router.get("/quota")
async def get_user_quota_info(
    current_user: dict = Depends(get_current_user)
):
    """
    OP-020: Lấy trạng thái hạn ngạch token hàng ngày của người dùng hiện hành.
    """
    user_id = current_user["id"]
    quota = quota_manager.get_or_create_quota(user_id)
    percent_used = round((quota["daily_tokens_used"] / max(quota["daily_token_limit"], 1)) * 100, 1)

    return {
        "status": "success",
        "data": {
            "user_id": user_id,
            "daily_token_limit": quota["daily_token_limit"],
            "daily_tokens_used": quota["daily_tokens_used"],
            "percent_used": percent_used,
            "warning_80": percent_used >= 80.0,
            "reset_at": quota["reset_at"]
        }
    }

@resources_router.get("/history")
async def get_resources_history(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    current_user: dict = Depends(get_current_user)
):
    """
    OP-021: Lấy danh sách lịch sử nhật ký đo đạc telemetry gần nhất.
    """
    user_id = current_user["id"]
    history = metric_logger.get_metrics_history(user_id=user_id, limit=limit, offset=offset)
    return {
        "status": "success",
        "data": {
            "items": history,
            "count": len(history),
            "limit": limit,
            "offset": offset
        }
    }

@resources_router.get("/stream")
async def stream_resource_telemetry(
    request: Request
):
    """
    OP-019: Server-Sent Events (SSE) phát trực tiếp các sự kiện đo đạc hiệu năng và biến động Quota.
    Tuân thủ NFR-021: Độ trễ đẩy sự kiện <= 1.0s.
    """
    user = get_user_from_request_or_query(request)
    user_id = user["id"]

    queue = await sse_manager.connect(user_id)

    async def sse_generator():
        try:
            # 1. Phát sự kiện initial_state khi vừa thiết lập kết nối
            summary = metric_logger.get_metrics_summary(user_id=user_id, time_range="24h")
            initial_payload = json.dumps(summary, ensure_ascii=False)
            yield f"event: initial_state\ndata: {initial_payload}\n\n"

            # 2. Vòng lặp chờ sự kiện hoặc heartbeat ping
            while True:
                try:
                    # Chờ sự kiện mới với timeout 15 giây để phát heartbeat
                    payload = await asyncio.wait_for(queue.get(), timeout=15.0)
                    yield payload
                except asyncio.TimeoutError:
                    # Gửi heartbeat giữ kết nối mở
                    yield f"event: ping\ndata: {{\"timestamp\": \"{json.dumps(None)}\"}}\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            await sse_manager.disconnect(user_id, queue)

    return StreamingResponse(
        sse_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )
