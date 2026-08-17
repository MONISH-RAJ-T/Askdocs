from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from app.services.auth_service import get_current_user
from app.models.user import User
from app.services.db_service import DatabaseService
from postgrest.exceptions import APIError

router = APIRouter(prefix="/api/storage", tags=["Storage"])
db = DatabaseService()

# Mock quota: 10 GB
MAX_STORAGE_BYTES = 10 * 1024 * 1024 * 1024

class StorageResponse(BaseModel):
    used_bytes: int
    total_bytes: int
    percentage: float

@router.get("", response_model=StorageResponse)
async def get_storage_usage(user: User = Depends(get_current_user)):
    try:
        res = db.client.table("documents").select("file_size").eq("user_id", user.id).execute()
        
        used_bytes = 0
        if res.data:
            used_bytes = sum(doc.get("file_size", 0) for doc in res.data)
            
        percentage = (used_bytes / MAX_STORAGE_BYTES) * 100
        
        return StorageResponse(
            used_bytes=used_bytes,
            total_bytes=MAX_STORAGE_BYTES,
            percentage=round(percentage, 2)
        )
    except APIError as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e.message}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
