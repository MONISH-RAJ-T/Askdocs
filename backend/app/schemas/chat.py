from pydantic import BaseModel, Field
from typing import Literal

from datetime import datetime

class ChatMessage(BaseModel):
    role: Literal["user", "assistant", "system"]
    content: str

class ChatRequest(BaseModel):
    document_id: str
    question: str
    conversation_id: str | None = None
    history: list[ChatMessage] = Field(default_factory=list)

class ConversationCreate(BaseModel):
    document_id: str
    title: str

class ConversationResponse(BaseModel):
    id: str
    document_id: str
    title: str
    created_at: datetime

    class Config:
        from_attributes = True

class MessageResponse(BaseModel):
    id: str
    conversation_id: str
    role: str
    content: str
    created_at: datetime

    class Config:
        from_attributes = True
