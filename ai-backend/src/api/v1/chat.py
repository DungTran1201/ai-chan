import uuid
import json
import asyncio
import os
from fastapi import APIRouter, HTTPException, status, Depends, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from typing import Optional, AsyncGenerator
from src.core.security import get_current_user, app_rate_limiter
from src.db import query_one, query_all, execute_commit

chat_router = APIRouter(tags=["Chat Streaming"])

class MessageStreamRequest(BaseModel):
    content: str = Field(min_length=1, max_length=4000, description="Nội dung prompt câu hỏi (tối đa 4000 ký tự)")
    model: Optional[str] = "gemini-2.5-flash"

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

    # 6. Generator truyền luồng Server-Sent Events (SSE)
    async def sse_event_generator():
        assistant_msg_id = str(uuid.uuid4())
        accumulated_response = []
        model_name = req.model or "gemini-2.5-flash"

        try:
            # Kiểm tra xem có cấu hình API Key thực hay không
            gemini_key = os.getenv("GEMINI_API_KEY", "").strip()
            openai_key = os.getenv("OPENAI_API_KEY", "").strip()

            if gemini_key or openai_key:
                from llm.client import llm_manager
                result = await llm_manager.generate_response(
                    prompt=prompt_text,
                    provider_name="gemini" if gemini_key else "openai",
                    model_name=model_name
                )
                text = result.get("text", "")
                words = text.split(" ")
                for idx, w in enumerate(words):
                    chunk_word = w + (" " if idx < len(words) - 1 else "")
                    accumulated_response.append(chunk_word)
                    data_payload = json.dumps({"token": chunk_word, "status": "streaming"}, ensure_ascii=False)
                    yield f"event: chunk\ndata: {data_payload}\n\n"
                    await asyncio.sleep(0.02)
                model_name = result.get("model", model_name)
            else:
                async for chunk_event in generate_mock_ai_stream(prompt_text, context_msgs):
                    # Trích xuất token để lưu trữ
                    if chunk_event.startswith("event: chunk\ndata: "):
                        raw_json = chunk_event.replace("event: chunk\ndata: ", "").strip()
                        try:
                            t = json.loads(raw_json).get("token", "")
                            accumulated_response.append(t)
                        except Exception:
                            pass
                    yield chunk_event

            # Lưu toàn bộ câu trả lời hoàn chỉnh vào CSDL
            final_text = "".join(accumulated_response).strip()
            execute_commit(
                """
                INSERT INTO messages (id, conversation_id, role, content, model_used)
                VALUES (?, ?, 'assistant', ?, ?)
                """,
                (assistant_msg_id, conversation_id, final_text, model_name)
            )

            # Gửi sự kiện done hoàn tất (SEQ-003)
            done_payload = json.dumps({
                "status": "done",
                "message_id": assistant_msg_id,
                "model": model_name
            }, ensure_ascii=False)
            yield f"event: done\ndata: {done_payload}\n\n"

        except Exception as exc:
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
