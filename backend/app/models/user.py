from pydantic import BaseModel, Field

class User(BaseModel):
    id: str = Field(..., description="Unique user uuid from Supabase auth")
    email: str
