import uuid
import re
from typing import Optional
from fastapi import APIRouter, Response, Request, HTTPException, status, Depends
from fastapi.responses import RedirectResponse, HTMLResponse
from pydantic import BaseModel, Field
from src.core.security import (
    hash_password,
    verify_password,
    create_access_token,
    get_current_user,
    generate_oauth_state,
    verify_oauth_state
)
from src.core.discord_oauth import (
    get_discord_authorization_url,
    exchange_code_for_discord_token,
    fetch_discord_user_profile
)
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
    user = query_one(
        """
        SELECT id, email, full_name, username, avatar_url, bio, phone_number,
               discord_id, discord_username,
               theme_preference, language_preference, status, created_at,
               last_login_at, hashed_password
        FROM users WHERE email = ?
        """,
        (email_clean,)
    )

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email hoặc mật khẩu không chính xác."
        )

    # Kiểm tra bất biến tài khoản đăng ký qua Discord không có mật khẩu (BR-018)
    if user.get("hashed_password") is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tài khoản này được đăng ký qua Discord. Vui lòng đăng nhập bằng nút Tiếp tục với Discord."
        )

    if not verify_password(req.password, user["hashed_password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email hoặc mật khẩu không chính xác."
        )

    if user["status"] != "ACTIVE":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tài khoản hiện đang bị tạm khóa."
        )

    # Cập nhật thời điểm đăng nhập gần nhất (PROC-002, FR-015)
    execute_commit(
        "UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?",
        (user["id"],)
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
            "username": user["username"],
            "avatar_url": user["avatar_url"],
            "bio": user["bio"],
            "phone_number": user["phone_number"],
            "discord_id": user.get("discord_id"),
            "discord_username": user.get("discord_username"),
            "theme_preference": user["theme_preference"] or "DARK",
            "language_preference": user["language_preference"] or "vi",
            "status": user["status"],
            "created_at": user["created_at"],
            "last_login_at": user["last_login_at"]
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

@auth_router.get("/discord/login")
async def discord_login():
    """Khởi tạo luồng xác thực Discord OAuth2, tạo state HMAC-SHA256 và đặt cookie (OP-016, BR-016, SEC-008)."""
    state = generate_oauth_state()
    auth_url = get_discord_authorization_url(state)
    redirect_resp = RedirectResponse(url=auth_url, status_code=status.HTTP_307_TEMPORARY_REDIRECT)
    redirect_resp.set_cookie(
        key="oauth_state",
        value=state,
        httponly=True,
        secure=False,
        samesite="lax",
        max_age=600,
        path="/"
    )
    return redirect_resp

@auth_router.get("/discord/simulate-consent")
async def discord_simulate_consent(state: str):
    """Trang mô phỏng giao diện cấp quyền Discord Consent cho môi trường local/demo."""
    html_content = f"""
    <!DOCTYPE html>
    <html lang="vi">
    <head>
        <meta charset="UTF-8">
        <title>Mô Phỏng Cấp Quyền Discord OAuth2</title>
        <style>
            body {{
                background-color: #23272a;
                color: #ffffff;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
                display: flex;
                align-items: center;
                justify-content: center;
                height: 100vh;
                margin: 0;
            }}
            .card {{
                background-color: #313338;
                padding: 2.5rem;
                border-radius: 12px;
                width: 400px;
                text-align: center;
                box-shadow: 0 10px 30px rgba(0,0,0,0.5);
            }}
            .btn {{
                display: block;
                width: 100%;
                padding: 12px;
                margin: 10px 0;
                border: none;
                border-radius: 6px;
                font-weight: 600;
                cursor: pointer;
                text-decoration: none;
                font-size: 15px;
                box-sizing: border-box;
            }}
            .btn-auth {{
                background-color: #5865F2;
                color: #ffffff;
            }}
            .btn-auth:hover {{ background-color: #4752C4; }}
            .btn-cancel {{
                background-color: #4e5058;
                color: #dbdee1;
            }}
            .btn-cancel:hover {{ background-color: #6d6f78; }}
        </style>
    </head>
    <body>
        <div class="card">
            <h2 style="margin-top:0;">🤖 AI-Chan Assistant</h2>
            <p style="color:#b5bac1; font-size:14px; margin-bottom: 24px;">Ứng dụng muốn truy cập tên người dùng, avatar và địa chỉ email đã xác minh của bạn.</p>
            <a href="/api/v1/auth/discord/callback?code=mock_code_12345&state={state}" class="btn btn-auth">Phê Duyệt Ủy Quyền (Authorize)</a>
            <a href="/api/v1/auth/discord/callback?error=access_denied" class="btn btn-cancel">Hủy Bỏ (Cancel)</a>
        </div>
    </body>
    </html>
    """
    return HTMLResponse(content=html_content)

@auth_router.get("/discord/callback")
async def discord_callback(
    request: Request,
    code: Optional[str] = None,
    state: Optional[str] = None,
    error: Optional[str] = None
):
    """Tiếp nhận ủy quyền Discord OAuth2, kiểm tra CSRF state, liên kết/tạo tài khoản và cấp JWT (OP-017, BR-016, BR-017, BR-018)."""
    # 1. Người dùng bấm Hủy trên cổng Discord
    if error:
        return RedirectResponse(url="/login?error=oauth_cancelled", status_code=status.HTTP_307_TEMPORARY_REDIRECT)

    if not code or not state:
        return RedirectResponse(url="/login?error=invalid_state", status_code=status.HTTP_307_TEMPORARY_REDIRECT)

    # 2. Kiểm tra tính hợp lệ và thời hạn chuỗi state (BR-016, SEC-008)
    cookie_state = request.cookies.get("oauth_state")
    if not verify_oauth_state(state, cookie_state):
        return RedirectResponse(url="/login?error=invalid_state", status_code=status.HTTP_307_TEMPORARY_REDIRECT)

    # 3. Trao đổi lấy Discord Access Token
    token_data = await exchange_code_for_discord_token(code)
    access_token = token_data.get("access_token")
    if not access_token:
        return RedirectResponse(url="/login?error=discord_exchange_failed", status_code=status.HTTP_307_TEMPORARY_REDIRECT)

    # 4. Trích xuất hồ sơ người dùng từ Discord (@me)
    profile = await fetch_discord_user_profile(access_token)
    discord_id = str(profile.get("id"))
    discord_username = str(profile.get("username", ""))
    email = profile.get("email")
    verified = profile.get("verified", False)

    # 5. Kiểm soát email verified từ Discord (BR-017)
    if not email or not verified:
        return RedirectResponse(url="/login?error=unverified_email", status_code=status.HTTP_307_TEMPORARY_REDIRECT)

    email_clean = email.lower().strip()

    # 6. Kiểm tra CSDL: Tra cứu theo discord_id trước
    user = query_one("SELECT id, email, full_name, status FROM users WHERE discord_id = ?", (discord_id,))
    if user:
        user_id = user["id"]
        # Cập nhật thời điểm đăng nhập gần nhất
        execute_commit(
            "UPDATE users SET last_login_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (user_id,)
        )
    else:
        # Tra cứu theo email để tự động liên kết (BR-017 Auto-linking)
        existing_by_email = query_one("SELECT id, email, full_name, status FROM users WHERE email = ?", (email_clean,))
        if existing_by_email:
            user_id = existing_by_email["id"]
            execute_commit(
                """
                UPDATE users
                SET discord_id = ?, discord_username = ?, last_login_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                """,
                (discord_id, discord_username, user_id)
            )
        else:
            # Tạo tài khoản mới với mật khẩu NULL (FR-027, BR-018)
            user_id = str(uuid.uuid4())
            full_name = discord_username or email_clean.split("@")[0]
            execute_commit(
                """
                INSERT INTO users (id, email, full_name, discord_id, discord_username, hashed_password, status)
                VALUES (?, ?, ?, ?, ?, NULL, 'ACTIVE')
                """,
                (user_id, email_clean, full_name, discord_id, discord_username)
            )

    # 7. Cấp phát phiên làm việc qua HttpOnly JWT Cookie (ADR-002, SEC-004)
    jwt_token = create_access_token(user_id=user_id, email=email_clean)

    redirect_resp = RedirectResponse(url="/chat", status_code=status.HTTP_307_TEMPORARY_REDIRECT)
    redirect_resp.set_cookie(
        key="access_token",
        value=jwt_token,
        httponly=True,
        secure=False,
        samesite="lax",
        max_age=7 * 24 * 3600,
        path="/"
    )
    # Xóa Cookie oauth_state
    redirect_resp.delete_cookie(key="oauth_state", path="/")
    return redirect_resp

