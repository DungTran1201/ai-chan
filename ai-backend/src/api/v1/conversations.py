import uuid
from fastapi import APIRouter, HTTPException, status, Depends
from pydantic import BaseModel, Field
from typing import Optional, List
from src.core.security import get_current_user
from src.db import query_one, query_all, execute_commit

conv_router = APIRouter(prefix="/conversations", tags=["Conversations"])

class CreateConversationRequest(BaseModel):
    title: Optional[str] = "Cuộc trò chuyện mới"

class UpdateConversationRequest(BaseModel):
    title: str = Field(min_length=1, max_length=255)

@conv_router.get("/")
@conv_router.get("", include_in_schema=False)
async def list_conversations(current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    threads = query_all(
        """
        SELECT id, user_id, title, created_at, updated_at
        FROM conversations
        WHERE user_id = ?
        ORDER BY updated_at DESC
        """,
        (user_id,)
    )
    return {"conversations": threads}

@conv_router.post("/", status_code=status.HTTP_201_CREATED)
@conv_router.post("", status_code=status.HTTP_201_CREATED, include_in_schema=False)
async def create_conversation(
    req: CreateConversationRequest,
    current_user: dict = Depends(get_current_user)
):
    conv_id = str(uuid.uuid4())
    user_id = current_user["id"]
    title_clean = req.title.strip() if req.title else "Cuộc trò chuyện mới"

    execute_commit(
        """
        INSERT INTO conversations (id, user_id, title)
        VALUES (?, ?, ?)
        """,
        (conv_id, user_id, title_clean)
    )

    thread = query_one("SELECT * FROM conversations WHERE id = ?", (conv_id,))
    return {"conversation": thread}

@conv_router.get("/{conversation_id}/messages")
async def get_conversation_messages(
    conversation_id: str,
    current_user: dict = Depends(get_current_user)
):
    user_id = current_user["id"]
    # Kiểm tra quyền sở hữu chống IDOR (BR-002, CTRL-002, TC-011)
    conv = query_one(
        "SELECT id, title FROM conversations WHERE id = ? AND user_id = ?",
        (conversation_id, user_id)
    )
    if not conv:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy cuộc trò chuyện hoặc bạn không có quyền truy cập."
        )

    messages = query_all(
        """
        SELECT id, conversation_id, role, content, model_used, tokens_prompt, tokens_completion, created_at
        FROM messages
        WHERE conversation_id = ?
        ORDER BY created_at ASC
        """,
        (conversation_id,)
    )
    return {
        "conversation": conv,
        "messages": messages
    }

@conv_router.patch("/{conversation_id}")
async def rename_conversation(
    conversation_id: str,
    req: UpdateConversationRequest,
    current_user: dict = Depends(get_current_user)
):
    user_id = current_user["id"]
    conv = query_one(
        "SELECT id FROM conversations WHERE id = ? AND user_id = ?",
        (conversation_id, user_id)
    )
    if not conv:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy cuộc trò chuyện để đổi tên."
        )

    title_clean = req.title.strip()
    execute_commit(
        """
        UPDATE conversations
        SET title = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND user_id = ?
        """,
        (title_clean, conversation_id, user_id)
    )

    updated = query_one("SELECT * FROM conversations WHERE id = ?", (conversation_id,))
    return {"conversation": updated}

@conv_router.delete("/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_conversation(
    conversation_id: str,
    current_user: dict = Depends(get_current_user)
):
    user_id = current_user["id"]
    conv = query_one(
        "SELECT id FROM conversations WHERE id = ? AND user_id = ?",
        (conversation_id, user_id)
    )
    if not conv:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy cuộc trò chuyện để xóa."
        )

    # SQLite CASCADE DELETE tự động xóa messages con
    execute_commit("DELETE FROM conversations WHERE id = ? AND user_id = ?", (conversation_id, user_id))
    return None
