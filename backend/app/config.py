from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field

class Settings(BaseSettings):
    # Supabase credentials
    supabase_url: str = Field(..., validation_alias="SUPABASE_URL")
    supabase_service_key: str = Field(..., validation_alias="SUPABASE_SERVICE_KEY")
    supabase_jwt_secret: str = Field(..., validation_alias="SUPABASE_JWT_SECRET")

    # Groq Cloud credentials
    groq_api_key: str = Field(..., validation_alias="GROQ_API_KEY")

    # Gemini API Credentials
    gemini_api_key: str | None = Field(None, validation_alias="GEMINI_API_KEY")

    # Hugging Face Space configuration
    hf_embedding_url: str = Field(..., validation_alias="HF_EMBEDDING_URL")
    hf_api_secret_key: str = Field(..., validation_alias="HF_API_SECRET_KEY")

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

# Instantiated single config instance
settings = Settings()
