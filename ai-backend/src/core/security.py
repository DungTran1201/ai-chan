import time
import bcrypt
import jwt
from datetime import datetime, timedelta, timezone
from fastapi import Request, HTTPException, status, Depends
from collections import defaultdict
from typing import Dict, List, Optional
from src.core.config import settings
from src.db import query_one

JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_DAYS = 7

class InMemoryRateLimiter:
    """Sliding-window in-memory rate limiter per client IP.
    
    Provides defense-in-depth at the application tier to protect
    LLM generation endpoints from volumetric exhaustion.
    """
    def __init__(self, requests_per_minute: int = 60):
        self.requests_per_minute = requests_per_minute
        self.clients: Dict[str, List[float]] = defaultdict(list)

    def check(self, client_ip: str):
        now = time.time()
        cutoff = now - 60.0
        # Prune old timestamps
        self.clients[client_ip] = [t for t in self.clients[client_ip] if t > cutoff]
        if len(self.clients[client_ip]) >= self.requests_per_minute:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Application rate limit exceeded: maximum requests per minute reached."
            )
        self.clients[client_ip].append(now)

# Global rate limiter instance (60 requests/minute per IP)
app_rate_limiter = InMemoryRateLimiter(requests_per_minute=60)

def hash_password(password: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
    except Exception:
        return False

def create_access_token(user_id: str, email: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=JWT_EXPIRATION_DAYS)
    payload = {
        "sub": user_id,
        "email": email,
        "exp": expire,
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=JWT_ALGORITHM)

def decode_access_token(token: str) -> Optional[dict]:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[JWT_ALGORITHM])
        return payload
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
        return None

async def get_current_user(request: Request) -> Dict:
    # 1. Try reading from HttpOnly Cookie first (ADR-002, SEC-004)
    token = request.cookies.get("access_token")

    # 2. Fallback to Authorization Header if Cookie not present (for curl/testing)
    if not token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header.split(" ")[1]

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Chưa xác thực: Vui lòng đăng nhập để tiếp tục."
        )

    payload = decode_access_token(token)
    if not payload or "sub" not in payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Phiên đăng nhập không hợp lệ hoặc đã hết hạn."
        )

    user_id = payload["sub"]
    user = query_one(
        """
        SELECT id, email, full_name, username, avatar_url, bio, phone_number,
               discord_id, discord_username,
               theme_preference, language_preference, status, created_at,
               last_login_at, password_changed_at
        FROM users WHERE id = ?
        """,
        (user_id,)
    )
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Tài khoản người dùng không tồn tại."
        )

    if user.get("status") != "ACTIVE":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tài khoản hiện đang bị tạm khóa."
        )

    return user

def generate_oauth_state() -> str:
    """Sinh chuỗi state ngẫu nhiên kèm timestamp và chữ ký HMAC-SHA256 (BR-016, SEC-008)."""
    import hmac
    import hashlib
    import secrets
    nonce = secrets.token_hex(16)
    ts = int(time.time())
    data = f"{nonce}:{ts}"
    signature = hmac.new(settings.SECRET_KEY.encode(), data.encode(), hashlib.sha256).hexdigest()
    return f"{data}:{signature}"

def verify_oauth_state(received_state: Optional[str], cookie_state: Optional[str]) -> bool:
    """Kiểm tra khớp cookie, tính toàn vẹn chữ ký HMAC và hạn sử dụng <= 10 phút (BR-016, SEC-008)."""
    import hmac
    import hashlib
    if not received_state or not cookie_state or received_state != cookie_state:
        return False
    parts = received_state.split(":")
    if len(parts) != 3:
        return False
    nonce, ts_str, signature = parts
    try:
        ts = int(ts_str)
    except ValueError:
        return False
    now = time.time()
    # Kiểm tra thời hạn 10 phút (600 giây) và không lệch thời gian tương lai > 10s
    if (now - ts > 600) or (now < ts - 10):
        return False
    expected_data = f"{nonce}:{ts_str}"
    expected_sig = hmac.new(settings.SECRET_KEY.encode(), expected_data.encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature, expected_sig)

