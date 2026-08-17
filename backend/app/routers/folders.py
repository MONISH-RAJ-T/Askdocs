from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
from app.services.auth_service import get_current_user
from app.models.user import User
from app.services.db_service import DatabaseService
from postgrest.exceptions import APIError

router = APIRouter(prefix="/api/folders", tags=["Folders"])
db = DatabaseService()

class FolderCreate(BaseModel):
    name: str

class FolderResponse(BaseModel):
    id: str
    name: str
    user_id: str
    created_at: str

@router.get("", response_model=List[FolderResponse])
async def get_folders(user: User = Depends(get_current_user)):
    try:
        res = db.client.table("folders").select("*").eq("user_id", user.id).order("created_at", desc=True).execute()
        return res.data
    except APIError as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e.message}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("", response_model=FolderResponse)
async def create_folder(folder: FolderCreate, user: User = Depends(get_current_user)):
    try:
        res = db.client.table("folders").insert({
            "name": folder.name,
            "user_id": user.id
        }).execute()
        if not res.data:
            raise HTTPException(status_code=500, detail="Failed to create folder")
        return res.data[0]
    except APIError as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e.message}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{folder_id}")
async def delete_folder(folder_id: str, user: User = Depends(get_current_user)):
    try:
        # First verify ownership
        check = db.client.table("folders").select("user_id").eq("id", folder_id).execute()
        if not check.data or check.data[0]["user_id"] != user.id:
            raise HTTPException(status_code=403, detail="Not authorized or folder not found")
            
        # Delete it
        db.client.table("folders").delete().eq("id", folder_id).execute()
        return {"status": "success"}
    except HTTPException:
        raise
    except APIError as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e.message}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
