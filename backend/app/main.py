from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import auth, documents, chat, folders, storage

app = FastAPI(
    title="PDF RAG Chatbot Backend",
    version="1.0",
    description="Scalable 3-service split architecture backend orchestrated via FastAPI"
)

# Configure CORS middleware
# Read optional FRONTEND_URL from environment for production deployment, fallback to localhost
import os
frontend_url = os.environ.get("FRONTEND_URL", "http://localhost:3000")
origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3001",
    frontend_url.rstrip("/")
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register endpoints routers
app.include_router(auth.router)
app.include_router(documents.router)
app.include_router(chat.router)
app.include_router(folders.router)
app.include_router(storage.router)

from app.config import settings
from app.services.db_service import DatabaseService
import httpx

db_service = DatabaseService()

@app.get("/health")
def health_check():
    """
    Service health verification endpoint validating Supabase and embedding space connectivity.
    """
    health_status = {
        "status": "healthy",
        "service": "pdf-rag-backend",
        "database": "untested",
        "embedding_service": "untested"
    }
    
    # 1. Verify Supabase connection
    try:
        db_service.client.table("documents").select("id").limit(1).execute()
        health_status["database"] = "connected"
    except Exception as e:
        health_status["database"] = f"error: {str(e)}"
        health_status["status"] = "unhealthy"

    # 2. Verify downstream embedding service connection
    try:
        res = httpx.get(f"{settings.hf_embedding_url.rstrip('/')}/health", timeout=3.0)
        if res.status_code == 200:
            health_status["embedding_service"] = "connected"
        else:
            health_status["embedding_service"] = f"unhealthy status: {res.status_code}"
            health_status["status"] = "unhealthy"
    except Exception as e:
        health_status["embedding_service"] = f"connection error: {str(e)}"
        health_status["status"] = "unhealthy"

    return health_status
