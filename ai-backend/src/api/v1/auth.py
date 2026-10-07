import uuid
import re
from typing import Optional
from fastapi import APIRouter, Response, HTTPException, status, Depends
from pydantic import BaseModel, Field
from src.core.security import hash_password, verify_password, create_access_token, get_current_user
from src.db import query_one, execute_commit

auth_router = APIRouter(prefix="/auth", tags=["Authentication"])

EMAIL_REGEX = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

class RegisterRequest(BaseModel):
    email: str = Field(description="Email đăng ký")
    password: str = Field(min_length=6, description="Mật khẩu tối thiểu 6 ký tự")
    full_name: Optional[str] = ""

class LoginRequest(BaseModel):
    email: str
    password: str

class UserProfileResponse(BaseModel):
    id: str
    email: str
    full_name: Optional[str] = ""
    status: str
    created_at: str

@auth_router.post("/register", status_code=status.HTTP_201_CREATED)
async def register(req: RegisterRequest):
    # Kiểm tra trùng lặp email (D-AUTH-01, TC-002)
    existing = query_one("SELECT id FROM users WHERE email = ?", (req.email.lower().strip(),))
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email này đã được sử dụng. Vui lòng đăng nhập hoặc chọn email khác."
        )

    user_id = str(uuid.uuid4())
    hashed_pw = hash_password(req.password)
    email_clean = req.email.lower().strip()
    name_clean = req.full_name.strip() if req.full_name else email_clean.split("@")[0]

    execute_commit(
        """
        INSERT INTO users (id, email, full_name, hashed_password, status)
        VALUES (?, ?, ?, ?, 'ACTIVE')
        """,
        (user_id, email_clean, name_clean, hashed_pw)
    )

    created_user = query_one("SELECT id, email, full_name, status, created_at FROM users WHERE id = ?", (user_id,))
    return {
        "message": "Đăng ký tài khoản thành công!",
        "user": created_user
    }

@auth_router.post("/login")
async def login(req: LoginRequest, response: Response):
    email_clean = req.email.lower().strip()
    user = query_one("SELECT id, email, full_name, hashed_password, status, created_at FROM users WHERE email = ?", (email_clean,))
    
    if not user or not verify_password(req.password, user["hashed_password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email hoặc mật khẩu không chính xác."
        )

    if user["status"] != "ACTIVE":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tài khoản hiện đang bị tạm khóa."
        )

    token = create_access_token(user_id=user["id"], email=user["email"])

    # Đóng gói Token vào HttpOnly Secure Cookie (ADR-002, SEC-004)
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        secure=False,  # Set False for local development HTTP support
        samesite="lax",
        max_age=7 * 24 * 3600,
        path="/"
    )

    return {
        "message": "Đăng nhập thành công!",
        "user": {
            "id": user["id"],
            "email": user["email"],
            "full_name": user["full_name"],
            "status": user["status"],
            "created_at": user["created_at"]
        },
        "token": token
    }

@auth_router.post("/logout")
async def logout(response: Response):
    # Thu hồi cookie phiên làm việc (PROC-003, TC-005)
    response.delete_cookie(key="access_token", path="/")
    return {"message": "Đăng xuất thành công!"}

@auth_router.get("/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    return {
        "user": current_user
    }
