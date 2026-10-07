import time
from fastapi import Request, HTTPException, status
from collections import defaultdict
from typing import Dict, List

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
