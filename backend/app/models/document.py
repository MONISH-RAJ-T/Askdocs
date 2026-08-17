from pydantic import BaseModel
from datetime import datetime
from typing import Optional

class Document(BaseModel):
    id: str
    user_id: str
    name: str
    file_size: int
    storage_path: str
    status: str
    created_at: datetime

class DocumentChunk(BaseModel):
    id: str
    document_id: str
    user_id: str
    content: str
    chunk_index: int
    metadata: Optional[dict] = None
    embedding: list[float]
