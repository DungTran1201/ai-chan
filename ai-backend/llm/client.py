import os
from typing import Dict, Any, Optional
from .providers.base import BaseLLMProvider
from .providers.gemini_provider import GeminiProvider
from .providers.openai_provider import OpenAIProvider

class LLMManager:
    """Central LLM Management Engine.
    
    Orchestrates provider selection, API key authentication,
    load balancing, fallback upon quota/timeout, and token accounting.
    """

    def __init__(self):
        self.providers: Dict[str, BaseLLMProvider] = {}
        self._init_providers()

    def _init_providers(self):
        gemini_key = os.getenv("GEMINI_API_KEY", "")
        openai_key = os.getenv("OPENAI_API_KEY", "")

        self.providers["gemini"] = GeminiProvider(api_key=gemini_key)
        self.providers["openai"] = OpenAIProvider(api_key=openai_key)

    def get_provider(self, name: Optional[str] = None) -> BaseLLMProvider:
        default_name = os.getenv("DEFAULT_LLM_PROVIDER", "gemini").lower()
        selected = (name or default_name).lower()

        if selected in self.providers:
            return self.providers[selected]
        
        # Fallback to gemini or first available provider
        return self.providers.get("gemini") or list(self.providers.values())[0]

    async def generate_response(
        self,
        prompt: str,
        provider_name: Optional[str] = None,
        model_name: Optional[str] = None,
        **kwargs
    ) -> Dict[str, Any]:
        provider = self.get_provider(provider_name)
        try:
            return await provider.generate(prompt=prompt, model=model_name, **kwargs)
        except Exception as primary_error:
            # Automatic fallback to secondary provider
            fallback_provider_name = "openai" if provider_name == "gemini" else "gemini"
            fallback = self.get_provider(fallback_provider_name)
            return await fallback.generate(prompt=prompt, **kwargs)

llm_manager = LLMManager()
