import time
from collections import defaultdict
from fastapi import Request, HTTPException, status

class RateLimiter:
    def __init__(self, limit: int, period: int, description: str = "Rate limit exceeded"):
        self.limit = limit
        self.period = period
        self.description = description
        self.requests = defaultdict(list)

    def check(self, request: Request):
        # Fallback to local IP if client header is missing
        client_ip = request.client.host if request.client else "127.0.0.1"
        now = time.time()
        
        # Prune old timestamps
        self.requests[client_ip] = [t for t in self.requests[client_ip] if now - t < self.period]
        
        if len(self.requests[client_ip]) >= self.limit:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"{self.description}. Please try again later."
            )
            
        self.requests[client_ip].append(now)

# Cost and protection limit instances:
upload_limiter = RateLimiter(limit=10, period=3600, description="Upload limit exceeded (max 10 PDFs per hour)")
chat_limiter = RateLimiter(limit=30, period=60, description="Chat query limit exceeded (max 30 questions per minute)")
