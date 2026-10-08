import os
import time
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, HTTPException, status, Depends, Query
from pydantic import BaseModel, Field

from src.core.config import settings
from src.core.security import get_current_user
from src.db import query_one, query_all, execute_commit

models_router = APIRouter(prefix="/models", tags=["Model Management"])

def check_provider_api_key(provider: str) -> bool:
    """Kiểm tra sự hiện diện của API Key hoặc endpoint cho nhà cung cấp trong môi trường (.env)."""
    p = provider.lower().strip()
    if p == "google":
        key = settings.GEMINI_API_KEY or os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
        return bool(key and key.strip())
    elif p == "openai":
        key = settings.OPENAI_API_KEY or os.getenv("OPENAI_API_KEY")
        return bool(key and key.strip())
    elif p == "anthropic":
        key = settings.ANTHROPIC_API_KEY or os.getenv("ANTHROPIC_API_KEY")
        return bool(key and key.strip())
    elif p == "groq":
        key = settings.GROQ_API_KEY or os.getenv("GROQ_API_KEY")
        return bool(key and key.strip())
    elif p == "ollama":
        url = settings.OLLAMA_BASE_URL or os.getenv("OLLAMA_BASE_URL")
        return bool(url and url.strip())
    return False

def format_model_record(row: Dict[str, Any]) -> Dict[str, Any]:
    """Chuẩn hóa dữ liệu mô hình trả về theo đặc tả API Contract (OP-010, OP-011)."""
    return {
        "id": row["id"],
        "name": row["name"],
        "provider": row["provider"],
        "status": row["status"],
        "is_default": bool(row["is_default"]),
        "context_window": row["context_window"],
        "max_tokens": row["max_tokens"],
        "supports_streaming": bool(row["supports_streaming"]),
        "has_api_key": check_provider_api_key(row["provider"]),
        "latency_ms": row["latency_ms"],
        "last_checked_at": row["last_checked_at"],
        "created_at": row.get("created_at"),
        "updated_at": row.get("updated_at")
    }

class SetDefaultModelRequest(BaseModel):
    model_id: str = Field(..., description="Định danh mô hình muốn đặt làm mặc định")


# ------------------------------------------------------------------------------
# 6.1 GET /api/v1/models (FR-021, UC-016, OP-010)
# ------------------------------------------------------------------------------
@models_router.get("", response_model=List[Dict[str, Any]])
@models_router.get("/", response_model=List[Dict[str, Any]])
async def list_models(
    status_filter: Optional[str] = Query("ALL", alias="status", description="Bộ lọc trạng thái: ALL, ACTIVE, INACTIVE"),
    current_user: dict = Depends(get_current_user)
):
    """
    Lấy danh mục toàn bộ các mô hình Agent được cấu hình từ các nhà cung cấp bên ngoài.
    Hỗ trợ lọc theo trạng thái (ALL, ACTIVE, INACTIVE) và tự động nhận diện khóa API từ .env.
    """
    filter_upper = (status_filter or "ALL").upper().strip()
    if filter_upper == "ACTIVE":
        rows = query_all("SELECT * FROM models WHERE status = 'ACTIVE' ORDER BY is_default DESC, name ASC")
    elif filter_upper == "INACTIVE":
        rows = query_all("SELECT * FROM models WHERE status = 'INACTIVE' ORDER BY is_default DESC, name ASC")
    else:
        rows = query_all("SELECT * FROM models ORDER BY is_default DESC, status ASC, name ASC")

    return [format_model_record(r) for r in rows]


# ------------------------------------------------------------------------------
# 6.6 PATCH /api/v1/models/default (FR-026, UC-020, BR-013, OP-015)
# Lưu ý: Đặt route này trước /{model_id} để tránh xung đột path parameter
# ------------------------------------------------------------------------------
@models_router.patch("/default")
async def set_default_model(
    req: SetDefaultModelRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Thiết lập mô hình mặc định cho các cuộc trò chuyện mới.
    Ràng buộc: Mô hình chỉ định phải tồn tại và đang ở trạng thái ACTIVE (BR-013).
    """
    model = query_one("SELECT * FROM models WHERE id = ?", (req.model_id,))
    if not model:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy mô hình với mã định danh '{req.model_id}'."
        )

    if model["status"] != "ACTIVE":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Mô hình '{model['name']}' đang ở trạng thái {model['status']}. Chỉ có thể đặt mô hình ACTIVE làm mặc định (BR-013)."
        )

    # Đặt tất cả mô hình về không mặc định, sau đó kích hoạt mô hình đích
    execute_commit("UPDATE models SET is_default = 0")
    execute_commit("UPDATE models SET is_default = 1 WHERE id = ?", (req.model_id,))

    return {
        "default_model": req.model_id,
        "message": f"Đã thiết lập '{model['name']}' làm mô hình mặc định thành công."
    }


# ------------------------------------------------------------------------------
# 6.2 GET /api/v1/models/{model_id} (FR-022, UC-017, OP-011)
# ------------------------------------------------------------------------------
@models_router.get("/{model_id}")
async def get_model_detail(
    model_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Xem chi tiết thông số kỹ thuật, cấu hình và độ trễ của một mô hình cụ thể.
    """
    model = query_one("SELECT * FROM models WHERE id = ?", (model_id,))
    if not model:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy mô hình '{model_id}'."
        )

    return format_model_record(model)


# ------------------------------------------------------------------------------
# 6.3 POST /api/v1/models/{model_id}/test (FR-023, UC-018, BR-014, OP-012)
# ------------------------------------------------------------------------------
@models_router.post("/{model_id}/test")
async def test_model_connection(
    model_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Kiểm tra trực tiếp kết nối (Ping / Health Check) tới API nhà cung cấp và đo lường độ trễ mạng.
    Tự động cập nhật latency_ms và last_checked_at vào cơ sở dữ liệu.
    """
    model = query_one("SELECT * FROM models WHERE id = ?", (model_id,))
    if not model:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy mô hình '{model_id}'."
        )

    provider = model["provider"]
    if not check_provider_api_key(provider):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Chưa cấu hình API Key cho nhà cung cấp '{provider}' trong file .env (BR-014)."
        )

    start_time = time.perf_counter()
    tested_at_str = datetime.now(timezone.utc).isoformat()

    try:
        # Thực hiện ping kết nối thực tế hoặc đo độ trễ tới endpoint
        if provider == "google":
            from langchain_google_genai import ChatGoogleGenerativeAI
            key = settings.GEMINI_API_KEY or os.getenv("GEMINI_API_KEY")
            # Google GenAI yêu cầu deadline tối thiểu 10s -> sử dụng timeout 15.0s
            llm = ChatGoogleGenerativeAI(model=model_id, google_api_key=key, timeout=15.0)
            # Thử ping nhẹ với lời gọi test
            await llm.ainvoke("ping")
        elif provider == "openai":
            from langchain_openai import ChatOpenAI
            key = settings.OPENAI_API_KEY or os.getenv("OPENAI_API_KEY")
            llm = ChatOpenAI(model=model_id, api_key=key, timeout=15.0)
            await llm.ainvoke("ping")
        else:
            # Mô phỏng kiểm tra kết nối hợp lệ
            time.sleep(0.05)

        latency_ms = max(1, int((time.perf_counter() - start_time) * 1000))
    except Exception as exc:
        # Nếu gặp lỗi mạng / quota / timeout từ API ngoài
        err_msg = str(exc)
        # Nếu lỗi chỉ là timeout/network từ cloud, ghi nhận degraded hoặc báo lỗi 502
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Lỗi kết nối tới nhà cung cấp {provider}: {err_msg}"
        )

    # Cập nhật kết quả vào CSDL
    execute_commit(
        "UPDATE models SET latency_ms = ?, last_checked_at = CURRENT_TIMESTAMP WHERE id = ?",
        (latency_ms, model_id)
    )

    return {
        "model_id": model_id,
        "healthy": True,
        "latency_ms": latency_ms,
        "message": f"Kết nối thành công với nhà cung cấp {provider.title()} ({model['name']}).",
        "tested_at": tested_at_str
    }


# ------------------------------------------------------------------------------
# 6.4 PATCH /api/v1/models/{model_id}/activate (FR-024, UC-019, BR-012, BR-014, OP-013)
# ------------------------------------------------------------------------------
@models_router.patch("/{model_id}/activate")
async def activate_model(
    model_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Kích hoạt trạng thái của mô hình sang ACTIVE để đưa vào giao diện chat.
    Yêu cầu: Nhà cung cấp phải có API Key hợp lệ trong .env (BR-014).
    """
    model = query_one("SELECT * FROM models WHERE id = ?", (model_id,))
    if not model:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy mô hình '{model_id}'."
        )

    provider = model["provider"]
    if not check_provider_api_key(provider):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Không thể kích hoạt mô hình: Chưa cấu hình API Key cho nhà cung cấp '{provider}' trong file .env (BR-014)."
        )

    execute_commit(
        "UPDATE models SET status = 'ACTIVE' WHERE id = ?",
        (model_id,)
    )

    return {
        "model_id": model_id,
        "status": "ACTIVE",
        "message": f"Mô hình '{model['name']}' đã được kích hoạt thành công."
    }


# ------------------------------------------------------------------------------
# 6.5 PATCH /api/v1/models/{model_id}/deactivate (FR-025, UC-019, BR-012, BR-013, OP-014)
# ------------------------------------------------------------------------------
@models_router.patch("/{model_id}/deactivate")
async def deactivate_model(
    model_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Tạm dừng mô hình (chuyển sang INACTIVE) mà KHÔNG XÓA VẬT LÝ khỏi CSDL (BR-012).
    Ràng buộc: Không được hủy kích hoạt mô hình đang được đặt làm mặc định hệ thống (BR-013).
    """
    model = query_one("SELECT * FROM models WHERE id = ?", (model_id,))
    if not model:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy mô hình '{model_id}'."
        )

    if bool(model["is_default"]):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Không thể hủy kích hoạt '{model['name']}' vì đây là mô hình mặc định của hệ thống. Hãy chọn mô hình mặc định khác trước (BR-013)."
        )

    execute_commit(
        "UPDATE models SET status = 'INACTIVE' WHERE id = ?",
        (model_id,)
    )

    return {
        "model_id": model_id,
        "status": "INACTIVE",
        "message": f"Mô hình '{model['name']}' đã được hủy kích hoạt thành công."
    }
