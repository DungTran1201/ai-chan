import re
from typing import Optional
from fastapi import APIRouter, Response, HTTPException, status, Depends
from pydantic import BaseModel, Field
from src.core.security import (
    hash_password,
    verify_password,
    create_access_token,
    get_current_user
)
from src.db import query_one, execute_commit

users_router = APIRouter(prefix="/users", tags=["User Management"])

EMAIL_REGEX = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
USERNAME_REGEX = re.compile(r"^[a-zA-Z0-9_.]{3,30}$")

# Request Models
class UpdateProfileRequest(BaseModel):
    full_name: Optional[str] = Field(None, max_length=255)
    username: Optional[str] = Field(None, description="Tên đăng nhập (3-30 ký tự chữ, số, _, .)")
    bio: Optional[str] = Field(None, max_length=500)
    phone_number: Optional[str] = Field(None, max_length=20)

class UpdateAvatarRequest(BaseModel):
    avatar_url: str = Field(..., max_length=500, description="URL ảnh đại diện hoặc chuỗi data URI")

class ChangeEmailRequest(BaseModel):
    new_email: str = Field(..., description="Email mới")
    current_password: str = Field(..., min_length=1, description="Mật khẩu hiện tại để xác thực lại")

class ChangePasswordRequest(BaseModel):
    current_password: str = Field(..., min_length=1, description="Mật khẩu hiện tại")
    new_password: str = Field(..., min_length=8, description="Mật khẩu mới tối thiểu 8 ký tự")

class UpdatePreferencesRequest(BaseModel):
    theme_preference: Optional[str] = Field(None, description="DARK, LIGHT, hoặc SYSTEM")
    language_preference: Optional[str] = Field(None, description="vi hoặc en")


# ------------------------------------------------------------------------------
# 5.1 GET /api/v1/users/me (FR-015, UC-010)
# ------------------------------------------------------------------------------
@users_router.get("/me")
async def get_my_profile(current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    
    # Thống kê tổng số cuộc trò chuyện và tổng tin nhắn
    conv_stat = query_one(
        "SELECT COUNT(*) as total FROM conversations WHERE user_id = ?",
        (user_id,)
    )
    msg_stat = query_one(
        """
        SELECT COUNT(*) as total
        FROM messages m
        JOIN conversations c ON m.conversation_id = c.id
        WHERE c.user_id = ?
        """,
        (user_id,)
    )

    total_convs = conv_stat["total"] if conv_stat else 0
    total_msgs = msg_stat["total"] if msg_stat else 0

    return {
        "user": {
            "id": current_user["id"],
            "email": current_user["email"],
            "full_name": current_user.get("full_name") or "",
            "username": current_user.get("username") or "",
            "avatar_url": current_user.get("avatar_url") or "",
            "bio": current_user.get("bio") or "",
            "phone_number": current_user.get("phone_number") or "",
            "theme_preference": current_user.get("theme_preference") or "DARK",
            "language_preference": current_user.get("language_preference") or "vi",
            "status": current_user.get("status") or "ACTIVE",
            "created_at": current_user.get("created_at"),
            "last_login_at": current_user.get("last_login_at")
        },
        "stats": {
            "total_conversations": total_convs,
            "total_messages": total_msgs
        }
    }


# ------------------------------------------------------------------------------
# 5.2 PATCH /api/v1/users/me/profile (FR-016, UC-011, BR-007)
# ------------------------------------------------------------------------------
@users_router.patch("/me/profile")
async def update_profile(
    req: UpdateProfileRequest,
    current_user: dict = Depends(get_current_user)
):
    user_id = current_user["id"]
    updates = []
    params = []

    if req.full_name is not None:
        updates.append("full_name = ?")
        params.append(req.full_name.strip())

    if req.username is not None:
        clean_username = req.username.strip()
        if clean_username:
            # BR-007: Thẩm định định dạng username
            if not USERNAME_REGEX.match(clean_username):
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Tên đăng nhập không hợp lệ. Chỉ chấp nhận 3-30 ký tự gồm chữ, số, gạch dưới và dấu chấm."
                )
            
            # BR-007: Kiểm tra tính duy nhất
            existing_user = query_one(
                "SELECT id FROM users WHERE username = ? COLLATE NOCASE AND id != ?",
                (clean_username, user_id)
            )
            if existing_user:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Tên đăng nhập này đã được sử dụng. Vui lòng chọn tên khác."
                )
            updates.append("username = ?")
            params.append(clean_username)
        else:
            updates.append("username = NULL")

    if req.bio is not None:
        updates.append("bio = ?")
        params.append(req.bio.strip())

    if req.phone_number is not None:
        updates.append("phone_number = ?")
        params.append(req.phone_number.strip())

    if updates:
        sql = f"UPDATE users SET {', '.join(updates)} WHERE id = ?"
        params.append(user_id)
        execute_commit(sql, tuple(params))

    # Lấy lại hồ sơ mới nhất
    updated = query_one(
        """
        SELECT id, email, full_name, username, avatar_url, bio, phone_number,
               theme_preference, language_preference, status, created_at, last_login_at
        FROM users WHERE id = ?
        """,
        (user_id,)
    )

    return {
        "message": "Cập nhật hồ sơ cá nhân thành công!",
        "user": updated
    }


# ------------------------------------------------------------------------------
# 5.3 PATCH /api/v1/users/me/avatar (FR-017, UC-012, BR-011)
# ------------------------------------------------------------------------------
@users_router.patch("/me/avatar")
async def update_avatar(
    req: UpdateAvatarRequest,
    current_user: dict = Depends(get_current_user)
):
    avatar_url = req.avatar_url.strip()
    if not (avatar_url.startswith("http://") or avatar_url.startswith("https://") or avatar_url.startswith("data:image/")):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="URL ảnh đại diện không hợp lệ. Phải bắt đầu bằng https://, http:// hoặc dữ liệu ảnh base64."
        )

    execute_commit(
        "UPDATE users SET avatar_url = ? WHERE id = ?",
        (avatar_url, current_user["id"])
    )

    return {
        "message": "Cập nhật ảnh đại diện thành công!",
        "avatar_url": avatar_url
    }


# ------------------------------------------------------------------------------
# 5.4 POST /api/v1/users/me/change-email (FR-018, UC-013, BR-008, BR-010, SEC-006)
# ------------------------------------------------------------------------------
@users_router.post("/me/change-email")
async def change_email(
    req: ChangeEmailRequest,
    current_user: dict = Depends(get_current_user)
):
    user_id = current_user["id"]
    new_email = req.new_email.lower().strip()

    if not EMAIL_REGEX.match(new_email):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Định dạng email mới không hợp lệ."
        )

    if new_email == current_user["email"].lower():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Email mới phải khác địa chỉ email hiện tại của bạn."
        )

    # SEC-006, BR-008: Xác thực lại mật khẩu hiện tại
    user_record = query_one("SELECT hashed_password FROM users WHERE id = ?", (user_id,))
    if not user_record or not verify_password(req.current_password, user_record["hashed_password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Mật khẩu hiện tại không chính xác. Thao tác bị từ chối."
        )

    # BR-010: Kiểm tra tính duy nhất của email mới
    existing = query_one("SELECT id FROM users WHERE email = ? AND id != ?", (new_email, user_id))
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Địa chỉ email này đã được tài khoản khác sử dụng."
        )

    execute_commit("UPDATE users SET email = ? WHERE id = ?", (new_email, user_id))

    return {
        "message": "Địa chỉ email đã được cập nhật thành công!",
        "email": new_email
    }


# ------------------------------------------------------------------------------
# 5.5 POST /api/v1/users/me/change-password (FR-019, UC-014, BR-008, BR-009, SEC-007)
# ------------------------------------------------------------------------------
@users_router.post("/me/change-password")
async def change_password(
    req: ChangePasswordRequest,
    response: Response,
    current_user: dict = Depends(get_current_user)
):
    user_id = current_user["id"]

    if len(req.new_password) < 8:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Mật khẩu mới phải có ít nhất 8 ký tự."
        )

    # SEC-006, BR-008: Xác thực mật khẩu hiện tại
    user_record = query_one("SELECT hashed_password, email FROM users WHERE id = ?", (user_id,))
    if not user_record or not verify_password(req.current_password, user_record["hashed_password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Mật khẩu hiện tại không chính xác."
        )

    # BR-009: Mật khẩu mới không được trùng mật khẩu cũ
    if verify_password(req.new_password, user_record["hashed_password"]):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Mật khẩu mới không được trùng với mật khẩu hiện tại của bạn."
        )

    # Mã hóa bcrypt và cập nhật thời điểm đổi mật khẩu (SEC-007)
    new_hashed = hash_password(req.new_password)
    execute_commit(
        """
        UPDATE users
        SET hashed_password = ?, password_changed_at = CURRENT_TIMESTAMP
        WHERE id = ?
        """,
        (new_hashed, user_id)
    )

    # Cấp phát JWT mới và cập nhật HttpOnly Cookie (SEC-007, ADR-002)
    new_token = create_access_token(user_id=user_id, email=user_record["email"])
    response.set_cookie(
        key="access_token",
        value=new_token,
        httponly=True,
        secure=False,
        samesite="lax",
        max_age=7 * 24 * 3600,
        path="/"
    )

    return {
        "message": "Đổi mật khẩu thành công. Các phiên làm việc cũ đã được thu hồi.",
        "token": new_token
    }


# ------------------------------------------------------------------------------
# 5.6 PATCH /api/v1/users/me/preferences (FR-020, UC-015)
# ------------------------------------------------------------------------------
@users_router.patch("/me/preferences")
async def update_preferences(
    req: UpdatePreferencesRequest,
    current_user: dict = Depends(get_current_user)
):
    user_id = current_user["id"]
    updates = []
    params = []

    if req.theme_preference is not None:
        theme = req.theme_preference.upper()
        if theme not in ["DARK", "LIGHT", "SYSTEM"]:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Chủ đề không hợp lệ. Chọn DARK, LIGHT, hoặc SYSTEM."
            )
        updates.append("theme_preference = ?")
        params.append(theme)

    if req.language_preference is not None:
        lang = req.language_preference.lower()
        if lang not in ["vi", "en"]:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Ngôn ngữ không hợp lệ. Chọn vi hoặc en."
            )
        updates.append("language_preference = ?")
        params.append(lang)

    if updates:
        sql = f"UPDATE users SET {', '.join(updates)} WHERE id = ?"
        params.append(user_id)
        execute_commit(sql, tuple(params))

    updated = query_one(
        "SELECT theme_preference, language_preference FROM users WHERE id = ?",
        (user_id,)
    )

    return {
        "message": "Cập nhật tùy chọn giao diện thành công!",
        "theme_preference": updated["theme_preference"],
        "language_preference": updated["language_preference"]
    }
