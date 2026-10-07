from fastapi import APIRouter
from src.api.v1.auth import auth_router
from src.api.v1.conversations import conv_router
from src.api.v1.chat import chat_router

api_router = APIRouter()

# Healthcheck endpoint
@api_router.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "service": "ai-backend",
        "database": "sqlite_connected",
        "version": "1.0.0"
    }

# Mount sub-routers
api_router.include_router(auth_router)
api_router.include_router(conv_router)
api_router.include_router(chat_router)
