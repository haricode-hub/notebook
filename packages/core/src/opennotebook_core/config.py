from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+asyncpg://studio:studio@localhost:5432/studio"
    redis_url: str = "redis://localhost:6379/0"
    embed_url: str = "http://localhost:8001"
    api_url: str = "http://localhost:8000"
    web_origin: str = "http://localhost:3000"
    storage_backend: Literal["local", "memory"] = "local"
    storage_path: Path = Path("storage")
    embed_backend: Literal["gemma2", "fake"] = "gemma2"
    embed_dim: int = 768
    embed_batch_size: int = Field(default=8, ge=1, le=128)
    embed_concurrency: int = Field(default=2, ge=1, le=8)
    llm_provider: Literal["openrouter", "gemini", "openai", "anthropic", "ollama", "fake"] = (
        "openrouter"
    )
    default_chat_model: str = ""
    default_cheap_model: str = ""
    openrouter_api_key: str = ""
    gemini_api_key: str = ""
    openai_api_key: str = ""
    anthropic_api_key: str = ""
    jwks_url: str = "http://localhost:3000/api/auth/jwks"
    jwt_issuer: str = "http://localhost:3000"
    jwt_audience: str = "opennotebook-api"
    settings_encryption_key: str = ""
    ollama_base_url: str = "http://localhost:11434"
    llm_concurrency: int = Field(default=4, ge=1, le=32)
    chat_context_tokens: int = Field(default=8192, ge=2048)
    chat_max_history: int = Field(default=6, ge=0, le=20)
    chat_rate_limit_per_minute: int = Field(default=30, ge=1)
    chat_rerank: bool = False
    summary_map_max_bytes: int = Field(default=6000, ge=1000, le=16000)
    upload_max_mb: int = Field(default=50, ge=1)

    @field_validator("embed_dim")
    @classmethod
    def valid_embed_dim(cls, value: int) -> int:
        if value not in {128, 256, 512, 768}:
            raise ValueError("EMBED_DIM must be 128, 256, 512, or 768")
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()
