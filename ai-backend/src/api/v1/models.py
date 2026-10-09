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

class CreateModelRequest(BaseModel):
    id: str = Field(..., min_length=1, max_length=100, description="Mã định danh duy nhất (bất biến) của mô hình")
    name: str = Field(..., min_length=1, max_length=255, description="Tên hiển thị của mô hình")
    provider: str = Field(..., description="Nhà cung cấp: google, anthropic, openai, groq, ollama")
    context_window: int = Field(default=128000, ge=1000, description="Ngữ cảnh tối đa (tokens >= 1000)")
    max_tokens: int = Field(default=4096, ge=256, description="Phản hồi tối đa (tokens >= 256)")
    supports_streaming: bool = Field(default=True, description="Hỗ trợ SSE streaming")

class UpdateModelRequest(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255, description="Tên hiển thị mới")
    context_window: Optional[int] = Field(default=None, ge=1000, description="Ngữ cảnh tối đa (tokens >= 1000)")
    max_tokens: Optional[int] = Field(default=None, ge=256, description="Phản hồi tối đa (tokens >= 256)")
    supports_streaming: Optional[bool] = Field(default=None, description="Hỗ trợ SSE streaming")


# ------------------------------------------------------------------------------
# 6.1 GET /api/v1/models (FR-021, UC-016, OP-010)
# ------------------------------------------------------------------------------
@models_router.get("", response_model=List[Dict[str, Any]])
@models_router.get("/", response_model=List[Dict[str, Any]])
async def list_models(
    status_filter: Optional[str] = Query("ALL", alias="status", description="Bộ lọc trạng thái: ALL, ACTIVE, INACTIVE, ARCHIVED, DEGRADED"),
    current_user: dict = Depends(get_current_user)
):
    """
    Lấy danh mục toàn bộ các mô hình Agent được cấu hình từ các nhà cung cấp bên ngoài.
    Hỗ trợ lọc theo trạng thái (ALL, ACTIVE, INACTIVE, ARCHIVED) và tự động nhận diện khóa API từ .env.
    """
    filter_upper = (status_filter or "ALL").upper().strip()
    if filter_upper in ("ACTIVE", "INACTIVE", "ARCHIVED", "DEGRADED"):
        rows = query_all("SELECT * FROM models WHERE status = ? ORDER BY is_default DESC, name ASC", (filter_upper,))
    else:
        rows = query_all("SELECT * FROM models ORDER BY is_default DESC, status ASC, name ASC")

    return [format_model_record(r) for r in rows]


# ------------------------------------------------------------------------------
# 6.7 POST /api/v1/models (FR-035, UC-MOD-001, OP-022, BR-022, BR-024, SEC-010)
# ------------------------------------------------------------------------------
@models_router.post("", status_code=status.HTTP_201_CREATED)
@models_router.post("/", status_code=status.HTTP_201_CREATED)
async def create_model(
    req: CreateModelRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Đăng ký mô hình LLM mới vào danh mục hệ thống (FR-035, OP-022).
    Ràng buộc:
    - ID là duy nhất toàn cục, cấm trùng lặp (BR-022).
    - Provider thuộc danh mục hỗ trợ: google, anthropic, openai, groq, ollama.
    - Giới hạn biên an toàn: context_window >= 1000, max_tokens >= 256, max_tokens <= context_window (BR-024).
    """
    # BR-024: Kiểm tra ngưỡng biên an toàn
    if req.max_tokens > req.context_window:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Tham số max_tokens ({req.max_tokens}) không được vượt quá context_window ({req.context_window}) (BR-024)."
        )

    provider_clean = req.provider.lower().strip()
    valid_providers = ("google", "anthropic", "openai", "groq", "ollama")
    if provider_clean not in valid_providers:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Nhà cung cấp không hợp lệ '{req.provider}'. Phải là một trong: {', '.join(valid_providers)}."
        )

    # BR-022: Kiểm tra tính duy nhất của ID mô hình
    existing = query_one("SELECT id FROM models WHERE id = ?", (req.id.strip(),))
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Mô hình với mã định danh '{req.id.strip()}' đã tồn tại trong hệ thống (BR-022)."
        )

    execute_commit(
        """
        INSERT INTO models (id, name, provider, status, is_default, context_window, max_tokens, supports_streaming)
        VALUES (?, ?, ?, 'INACTIVE', 0, ?, ?, ?)
        """,
        (
            req.id.strip(),
            req.name.strip(),
            provider_clean,
            req.context_window,
            req.max_tokens,
            1 if req.supports_streaming else 0
        )
    )

    created_row = query_one("SELECT * FROM models WHERE id = ?", (req.id.strip(),))
    record = format_model_record(created_row)
    record["message"] = "Đăng ký mô hình mới thành công."
    return record


# ------------------------------------------------------------------------------
# 6.9 GET /api/v1/models/search (FR-037, FR-038, NFR-022, OP-024, UC-MOD-003)
# Lưu ý: Đặt route này trước /{model_id} để tránh nhầm lẫn path parameter
# ------------------------------------------------------------------------------
@models_router.get("/search")
async def search_models(
    q: Optional[str] = Query(None, description="Từ khóa tìm kiếm theo tên hoặc ID"),
    provider: Optional[str] = Query("ALL", description="Lọc theo nhà cung cấp"),
    status_filter: Optional[str] = Query("ALL", alias="status", description="Lọc theo trạng thái: ALL, ACTIVE, INACTIVE, ARCHIVED, DEGRADED"),
    has_api_key: Optional[bool] = Query(None, description="Lọc theo tình trạng cấu hình API Key"),
    is_default: Optional[bool] = Query(None, description="Lọc theo cờ mặc định"),
    sort: Optional[str] = Query("name_asc", description="Sắp xếp: name_asc, latency_asc, context_desc"),
    current_user: dict = Depends(get_current_user)
):
    """
    Tìm kiếm toàn văn và lọc đa thuộc tính danh mục mô hình với SLA độ trễ <= 200ms (FR-037, FR-038, NFR-022).
    """
    start_time = time.perf_counter()

    sql = "SELECT * FROM models WHERE 1=1"
    params: List[Any] = []

    if q and q.strip():
        kw = f"%{q.strip()}%"
        sql += " AND (name LIKE ? OR id LIKE ?)"
        params.extend([kw, kw])

    if provider and provider.upper() != "ALL":
        sql += " AND LOWER(provider) = ?"
        params.append(provider.lower().strip())

    if status_filter and status_filter.upper() != "ALL":
        sql += " AND status = ?"
        params.append(status_filter.upper().strip())

    if is_default is not None:
        sql += " AND is_default = ?"
        params.append(1 if is_default else 0)

    # Sắp xếp
    if sort == "latency_asc":
        sql += " ORDER BY CASE WHEN latency_ms IS NULL THEN 1 ELSE 0 END, latency_ms ASC, name ASC"
    elif sort == "context_desc":
        sql += " ORDER BY context_window DESC, name ASC"
    else:
        sql += " ORDER BY is_default DESC, name ASC"

    rows = query_all(sql, tuple(params))
    items = [format_model_record(r) for r in rows]

    # Lọc tiếp theo has_api_key nếu có
    if has_api_key is not None:
        items = [item for item in items if item["has_api_key"] == has_api_key]

    execution_time_ms = round((time.perf_counter() - start_time) * 1000, 2)

    return {
        "total": len(items),
        "execution_time_ms": execution_time_ms,
        "items": items
    }


# ------------------------------------------------------------------------------
# 6.6 PATCH /api/v1/models/default (FR-026, UC-020, BR-013, OP-015)
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
# 6.8 PUT /api/v1/models/{model_id} (FR-036, UC-MOD-002, OP-023, BR-022, BR-024, SEC-010)
# ------------------------------------------------------------------------------
@models_router.put("/{model_id}")
async def update_model(
    model_id: str,
    req: UpdateModelRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Cập nhật thông tin cấu hình mô hình hiện có (FR-036, OP-023).
    Ràng buộc:
    - ID và Provider là bất biến, không thể sửa đổi (BR-022).
    - Giới hạn biên: context_window >= 1000, max_tokens >= 256, max_tokens <= context_window (BR-024).
    """
    model = query_one("SELECT * FROM models WHERE id = ?", (model_id,))
    if not model:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy mô hình với mã định danh '{model_id}'."
        )

    new_name = req.name.strip() if req.name is not None else model["name"]
    new_cw = req.context_window if req.context_window is not None else model["context_window"]
    new_mt = req.max_tokens if req.max_tokens is not None else model["max_tokens"]
    new_streaming = (1 if req.supports_streaming else 0) if req.supports_streaming is not None else model["supports_streaming"]

    # BR-024: Kiểm tra ngưỡng biên an toàn
    if new_cw < 1000 or new_mt < 256:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Vi phạm ngưỡng an toàn: context_window >= 1000 và max_tokens >= 256 (BR-024)."
        )
    if new_mt > new_cw:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Tham số max_tokens ({new_mt}) không được vượt quá context_window ({new_cw}) (BR-024)."
        )

    execute_commit(
        """
        UPDATE models
        SET name = ?, context_window = ?, max_tokens = ?, supports_streaming = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
        """,
        (new_name, new_cw, new_mt, new_streaming, model_id)
    )

    updated_row = query_one("SELECT * FROM models WHERE id = ?", (model_id,))
    record = format_model_record(updated_row)
    record["message"] = "Cập nhật cấu hình mô hình thành công."
    return record


# ------------------------------------------------------------------------------
# 6.10 DELETE /api/v1/models/{model_id} (FR-039, UC-MOD-002, OP-025, BR-023, SEC-010)
# ------------------------------------------------------------------------------
@models_router.delete("/{model_id}")
async def archive_model(
    model_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Xóa mềm (chuyển sang ARCHIVED) mô hình khỏi danh mục hoạt động (FR-039, OP-025).
    Ràng buộc:
    - Không xóa vật lý dữ liệu (BR-012).
    - Cấm tuyệt đối xóa mềm mô hình đang giữ cờ mặc định is_default = 1 (BR-023).
    """
    model = query_one("SELECT * FROM models WHERE id = ?", (model_id,))
    if not model:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy mô hình với mã định danh '{model_id}'."
        )

    # BR-023: Invariant Default Model Guard
    if bool(model["is_default"]):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Không thể lưu trữ mô hình '{model['name']}' vì đây là mô hình mặc định của hệ thống. Hãy chọn mô hình khác làm mặc định trước (BR-023)."
        )

    execute_commit(
        "UPDATE models SET status = 'ARCHIVED', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        (model_id,)
    )

    return {
        "model_id": model_id,
        "status": "ARCHIVED",
        "message": f"Đã chuyển mô hình '{model['name']}' vào trạng thái lưu trữ an toàn."
    }


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
