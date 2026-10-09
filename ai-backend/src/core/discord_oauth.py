import httpx
from typing import Dict, Any, Optional
from urllib.parse import urlencode, quote
from fastapi import HTTPException, status
from src.core.config import settings

DISCORD_API_ENDPOINT = "https://discord.com/api"
DISCORD_TOKEN_URL = f"{DISCORD_API_ENDPOINT}/oauth2/token"
DISCORD_USER_URL = f"{DISCORD_API_ENDPOINT}/users/@me"

def get_discord_authorization_url(state: str) -> str:
    """Tạo đường dẫn ủy quyền Discord OAuth2 hoặc simulation URL nếu chưa cấu hình client_id."""
    if not settings.DISCORD_CLIENT_ID:
        # Chế độ mô phỏng ủy quyền nội bộ khi chưa cấu hình key Discord trong .env
        params = urlencode({"state": state})
        return f"/api/v1/auth/discord/simulate-consent?{params}"

    params = {
        "client_id": settings.DISCORD_CLIENT_ID,
        "response_type": "code",
        "redirect_uri": settings.DISCORD_REDIRECT_URI,
        "scope": "identify email",
        "state": state
    }
    return f"{DISCORD_API_ENDPOINT}/oauth2/authorize?{urlencode(params)}"

async def exchange_code_for_discord_token(code: str) -> Dict[str, Any]:
    """Trao đổi authorization code lấy access token từ máy chủ Discord API (hoặc mock nếu code bắt đầu bằng mock_)."""
    if code.startswith("mock_") or not settings.DISCORD_CLIENT_ID:
        return {
            "access_token": "mock_discord_access_token_abc123",
            "token_type": "Bearer",
            "expires_in": 604800,
            "scope": "identify email"
        }

    data = {
        "client_id": settings.DISCORD_CLIENT_ID,
        "client_secret": settings.DISCORD_CLIENT_SECRET,
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": settings.DISCORD_REDIRECT_URI,
    }
    headers = {
        "Content-Type": "application/x-www-form-urlencoded"
    }

    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            response = await client.post(DISCORD_TOKEN_URL, data=data, headers=headers)
            if response.status_code != 200:
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail=f"Lỗi trao đổi mã ủy quyền với Discord: {response.text}"
                )
            return response.json()
        except httpx.RequestError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Lỗi kết nối mạng tới máy chủ Discord API: {str(exc)}"
            )

async def fetch_discord_user_profile(access_token: str) -> Dict[str, Any]:
    """Lấy thông tin hồ sơ người dùng từ Discord endpoint GET /users/@me."""
    if access_token.startswith("mock_"):
        return {
            "id": "discord_987654321",
            "username": "DiscordGuest",
            "email": "discord.guest@example.com",
            "verified": True,
            "avatar": None
        }

    headers = {
        "Authorization": f"Bearer {access_token}"
    }

    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            response = await client.get(DISCORD_USER_URL, headers=headers)
            if response.status_code != 200:
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail=f"Không thể truy xuất thông tin người dùng từ Discord: {response.text}"
                )
            return response.json()
        except httpx.RequestError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Lỗi kết nối khi lấy hồ sơ người dùng Discord: {str(exc)}"
            )
