import uuid
import json
import asyncio
import os
import time
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, HTTPException, status, Depends, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from typing import Optional, AsyncGenerator
from src.core.security import get_current_user, app_rate_limiter
from src.core.telemetry import quota_manager, metric_logger
from src.db import query_one, query_all, execute_commit

chat_router = APIRouter(tags=["Chat Streaming"])

class MessageStreamRequest(BaseModel):
    content: str = Field(min_length=1, max_length=4000, description="Nội dung prompt câu hỏi (tối đa 4000 ký tự)")
    model: Optional[str] = "gemini-3.8-flash"

async def generate_mock_ai_stream(prompt: str, history: list) -> AsyncGenerator[str, None]:
    """Fallback high-quality AI streaming generator when external cloud keys are absent."""
    greeting = f"Chào bạn! Tôi là **AI-Chan Assistant**, trợ lý ảo thông minh của bạn.\n\n"
    
    # Custom contextual logic
    p_lower = prompt.lower()
    if "python" in p_lower:
        explanation = (
            f"Về câu hỏi liên quan đến Python: *\"{prompt}\"*:\n\n"
            f"Dưới đây là ví dụ minh họa tối ưu:\n\n"
            f"```python\n"
            f"def solution(items: list) -> dict:\n"
            f"    \"\"\"Giải pháp tối ưu thời gian O(n) và không gian O(n)\"\"\"\n"
            f"    return {{item: len(item) for item in items if item}}\n"
            f"\n"
            f"# Kiểm tra chạy thử:\n"
            f"sample_data = ['ai-chan', 'fastapi', 'nextjs', 'sqlite']\n"
            f"print(solution(sample_data))\n"
            f"```\n\n"
            f"Hệ thống đã tự động xử lý và lưu trữ dữ liệu vào cơ sở dữ liệu `app.db`."
        )
    elif "chào" in p_lower or "hello" in p_lower or "hi" in p_lower:
        explanation = (
            f"Rất vui được hỗ trợ bạn hôm nay! Tôi có thể giúp bạn:\n"
            f"1. **Giải đáp thắc mắc lập trình** (Python, TypeScript, SQL, Docker).\n"
            f"2. **Tư vấn kiến trúc hệ thống** và tối ưu hóa hiệu năng.\n"
            f"3. **Soạn thảo và tóm tắt văn bản** theo ngữ cảnh.\n\n"
            f"Bạn muốn bắt đầu với chủ đề nào?"
        )
    else:
        explanation = (
            f"Tôi đã tiếp nhận câu hỏi của bạn: *\"{prompt}\"*.\n\n"
            f"Dựa trên ngữ cảnh phiên làm việc ({len(history)} tin nhắn trước đó), dưới đây là phân tích chi tiết:\n\n"
            f"- **Phân tích yêu cầu**: Yêu cầu của bạn đã được kiểm tra tính hợp lệ và cách ly dữ liệu cá nhân an toàn (`BR-002`).\n"
            f"- **Phản hồi**: Hệ thống phản hồi qua cơ chế Server-Sent Events (SSE) theo thời gian thực (`ADR-004`).\n"
            f"- **Khả năng dự phòng**: Cổng AI hỗ trợ Multi-Provider Failover giữa Gemini và OpenAI (`ADR-003`).\n\n"
            f"Nếu bạn cần thêm chi tiết hoặc muốn tôi viết code mẫu, hãy cho tôi biết nhé!"
        )

    full_text = greeting + explanation
    # Tách thành các từ/token nhỏ để mô phỏng dòng chảy streaming thực tế
    words = full_text.split(" ")
    for idx, word in enumerate(words):
        chunk_word = word + (" " if idx < len(words) - 1 else "")
        chunk_data = json.dumps({"token": chunk_word, "status": "streaming"}, ensure_ascii=False)
        yield f"event: chunk\ndata: {chunk_data}\n\n"
        await asyncio.sleep(0.04)  # 40ms per token for natural typing speed

@chat_router.post("/conversations/{conversation_id}/messages/stream")
async def stream_message_endpoint(
    conversation_id: str,
    req: MessageStreamRequest,
    raw_request: Request,
    current_user: dict = Depends(get_current_user)
):
    client_ip = raw_request.client.host if raw_request.client else "127.0.0.1"
    app_rate_limiter.check(client_ip)

    user_id = current_user["id"]
    
    # 0. Kiểm tra Hạn ngạch Quota Token hàng ngày (BR-020, CTRL-008, TC-025)
    is_allowed, used_tokens, limit_tokens, is_warn_80 = quota_manager.check_quota(user_id, estimated_tokens=100)
    if not is_allowed:
        # Ghi nhận metric chặn quota 429
        metric_logger.log_metric(
            endpoint=f"/api/v1/conversations/{conversation_id}/messages/stream",
            method="POST",
            status_code=429,
            latency_ms=1.0,
            user_id=user_id,
            error_code="DAILY_QUOTA_EXCEEDED"
        )
        now_dt = datetime.now(timezone.utc)
        reset_dt = (now_dt + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
        retry_after_secs = int((reset_dt - now_dt).total_seconds())

        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "error_code": "DAILY_QUOTA_EXCEEDED",
                "message": f"Hạn ngạch token trong ngày đã hết ({used_tokens:,}/{limit_tokens:,} tokens). Yêu cầu bị chặn (HTTP 429). Hạn ngạch sẽ được làm mới lúc 00:00 UTC.",
                "daily_tokens_used": used_tokens,
                "daily_token_limit": limit_tokens,
                "retry_after": retry_after_secs
            },
            headers={"Retry-After": str(retry_after_secs)}
        )

    # 1. Kiểm tra quyền sở hữu cuộc trò chuyện (Anti-IDOR - BR-002, CTRL-002, TC-011)
    conv = query_one(
        "SELECT id, title FROM conversations WHERE id = ? AND user_id = ?",
        (conversation_id, user_id)
    )
    if not conv:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Cuộc trò chuyện không tồn tại hoặc bạn không có quyền truy cập."
        )

    # 2. Kiểm tra độ dài prompt <= 4000 ký tự (INV-02, BR-003)
    prompt_text = req.content.strip()
    if not prompt_text or len(prompt_text) > 4000:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Nội dung tin nhắn phải từ 1 đến 4000 ký tự."
        )

    # 3. Ghi nhận tin nhắn người dùng vào CSDL (bảng messages)
    user_msg_id = str(uuid.uuid4())
    execute_commit(
        """
        INSERT INTO messages (id, conversation_id, role, content, model_used)
        VALUES (?, ?, 'user', ?, ?)
        """,
        (user_msg_id, conversation_id, prompt_text, "client")
    )

    # 4. Tự động đổi tên tiêu đề nếu là tin nhắn đầu tiên (INV-03, BR-004)
    if conv["title"] == "Cuộc trò chuyện mới":
        auto_title = prompt_text[:30].strip() + ("..." if len(prompt_text) > 30 else "")
        execute_commit(
            "UPDATE conversations SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (auto_title, conversation_id)
        )
    else:
        execute_commit(
            "UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (conversation_id,)
        )

    # 5. Truy vấn tối đa 20 tin nhắn gần nhất làm ngữ cảnh trượt (INV-04)
    context_msgs = query_all(
        """
        SELECT role, content FROM messages
        WHERE conversation_id = ?
        ORDER BY created_at DESC
        LIMIT 20
        """,
        (conversation_id,)
    )
    context_msgs.reverse()

    # 6. Generator truyền luồng Server-Sent Events (SSE) qua LangChain & LangGraph Agent (ADR-005)
    async def sse_event_generator():
        assistant_msg_id = str(uuid.uuid4())
        accumulated_response = []
        # Tra cứu mô hình mặc định từ bảng models nếu không chỉ định cụ thể
        selected_model = req.model
        if not selected_model:
            def_model_row = query_one("SELECT id FROM models WHERE is_default = 1 AND status = 'ACTIVE' LIMIT 1")
            selected_model = def_model_row["id"] if def_model_row else "gemini-3.8-flash"
        final_model_used = selected_model

        start_time = time.perf_counter()
        ttft_recorded = False
        ttft_ms = None

        try:
            from llm.agent import chat_agent

            async for event in chat_agent.astream_agent(
                prompt=prompt_text,
                history=context_msgs,
                model_override=selected_model
            ):
                if event.get("status") == "streaming":
                    token_str = event.get("token", "")
                    accumulated_response.append(token_str)

                    # Đo đạc TTFT ngay khi nhận chunk token đầu tiên (FR-029)
                    if not ttft_recorded:
                        ttft_ms = (time.perf_counter() - start_time) * 1000
                        ttft_recorded = True

                    data_payload = json.dumps({"token": token_str, "status": "streaming"}, ensure_ascii=False)
                    yield f"event: chunk\ndata: {data_payload}\n\n"
                elif event.get("status") == "done":
                    final_model_used = event.get("model", final_model_used)
                elif event.get("status") == "error":
                    err_msg = event.get("message", "Lỗi sinh phản hồi")
                    err_payload = json.dumps({"status": "error", "message": err_msg}, ensure_ascii=False)
                    yield f"event: error\ndata: {err_payload}\n\n"

            # Lưu toàn bộ câu trả lời hoàn chỉnh vào CSDL
            final_text = "".join(accumulated_response).strip()
            execute_commit(
                """
                INSERT INTO messages (id, conversation_id, role, content, model_used)
                VALUES (?, ?, 'assistant', ?, ?)
                """,
                (assistant_msg_id, conversation_id, final_text, final_model_used)
            )

            # Tính toán telemetry hoàn tất: latency, token usage, trừ quota & ghi log (FR-029, FR-030, BR-019)
            total_latency_ms = (time.perf_counter() - start_time) * 1000
            prompt_tokens_est = max(int(len(prompt_text.split()) * 1.3), 5)
            completion_tokens_est = max(int(len(final_text.split()) * 1.3), 5)
            total_tokens_est = prompt_tokens_est + completion_tokens_est

            # Cập nhật Quota
            quota_manager.consume_quota(user_id, total_tokens_est)

            # Tìm provider của model
            model_info = query_one("SELECT provider FROM models WHERE id = ?", (final_model_used,))
            provider = model_info["provider"] if model_info else "google"

            # Ghi log telemetry và broadcast SSE lên Dashboard (FR-033, OP-019)
            metric_logger.log_metric(
                endpoint=f"/api/v1/conversations/{conversation_id}/messages/stream",
                method="POST",
                status_code=200,
                latency_ms=total_latency_ms,
                user_id=user_id,
                ttft_ms=ttft_ms,
                model_name=final_model_used,
                provider=provider,
                prompt_tokens=prompt_tokens_est,
                completion_tokens=completion_tokens_est,
                total_tokens=total_tokens_est
            )

            # Gửi sự kiện done hoàn tất (SEQ-003, ADR-004)
            done_payload = json.dumps({
                "status": "done",
                "message_id": assistant_msg_id,
                "model": final_model_used,
                "tokens": total_tokens_est,
                "latency_ms": round(total_latency_ms, 1)
            }, ensure_ascii=False)
            yield f"event: done\ndata: {done_payload}\n\n"

        except Exception as exc:
            total_latency_ms = (time.perf_counter() - start_time) * 1000
            metric_logger.log_metric(
                endpoint=f"/api/v1/conversations/{conversation_id}/messages/stream",
                method="POST",
                status_code=500,
                latency_ms=total_latency_ms,
                user_id=user_id,
                error_code="LLM_STREAM_ERROR"
            )
            err_payload = json.dumps({"status": "error", "message": str(exc)}, ensure_ascii=False)
            yield f"event: error\ndata: {err_payload}\n\n"

    return StreamingResponse(
        sse_event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )
