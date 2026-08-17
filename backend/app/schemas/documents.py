from pydantic import BaseModel
from datetime import datetime

class PresignRequest(BaseModel):
    filename: str
    filesize: int

class PresignResponse(BaseModel):
    signed_url: str
    storage_path: str
    document_id: str

class DocumentResponse(BaseModel):
    id: str
    name: str
    file_size: int
    status: str
    created_at: datetime
    error_message: str | None = None
    page_count: int | None = None
    chunk_count: int | None = None
    folder_id: str | None = None

    class Config:
        from_attributes = True

class DocumentUpdate(BaseModel):
    folder_id: str | None = None

