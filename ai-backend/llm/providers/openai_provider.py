from typing import AsyncGenerator, Dict, Any, Optional
from .base import BaseLLMProvider

class OpenAIProvider(BaseLLMProvider):
    """OpenAI API Integration Adapter (GPT-4o, GPT-3.5, etc.)."""

    def __init__(self, api_key: str, default_model: str = "gpt-4o-mini"):
        super().__init__(api_key, default_model)

    async def generate(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        model: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 2048,
        **kwargs
    ) -> Dict[str, Any]:
        target_model = model or self.default_model
        return {
            "text": f"[OpenAI Response via {target_model}]: Processed prompt.",
            "provider": "openai",
            "model": target_model,
            "tokens": len(prompt.split()) + 25
        }

    async def stream(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        model: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 2048,
        **kwargs
    ) -> AsyncGenerator[str, None]:
        tokens = ["OpenAI", " streaming", " tokens", " completed."]
        for t in tokens:
            yield t
