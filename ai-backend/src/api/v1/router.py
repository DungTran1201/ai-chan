from fastapi import APIRouter
from pydantic import BaseModel
from typing import List, Optional

api_router = APIRouter()

class ChatRequest(BaseModel):
    prompt: str
    session_id: Optional[str] = None
    provider: Optional[str] = None
    model: Optional[str] = None

class ChatResponse(BaseModel):
    reply: str
    provider: str
    model: str
    tokens_used: int

@api_router.get("/health")
async def health_check():
    return {"status": "ok", "service": "ai-backend-src"}

@api_router.post("/chat", response_model=ChatResponse)
async def chat_endpoint(request: ChatRequest):
    # Delegate to ai-backend/llm module
    from llm.client import llm_manager
    result = await llm_manager.generate_response(
        prompt=request.prompt,
        provider_name=request.provider,
        model_name=request.model
    )
    return ChatResponse(
        reply=result["text"],
        provider=result["provider"],
        model=result["model"],
        tokens_used=result.get("tokens", 0)
    )
