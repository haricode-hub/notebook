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
    storage_backend: Literal["local", "memory", "s3"] = "local"
    storage_path: Path = Path("storage")
    s3_endpoint_url: str = ""
    s3_bucket: str = "opennotebook"
    s3_access_key: str = ""
    s3_secret_key: str = ""
    s3_region: str = "us-east-1"
    embed_backend: Literal["gemma2", "fake"] = "gemma2"
    embed_dim: int = 768
    embed_batch_size: int = Field(default=8, ge=1, le=128)
    embed_concurrency: int = Field(default=2, ge=1, le=8)
    embed_cache_entries: int = Field(default=512, ge=0, le=10000)
    multimodal_enabled: bool = False
    multimodal_image_enabled: bool = True
    multimodal_audio_enabled: bool = False
    multimodal_image_max_soft_tokens: Literal[70, 140, 280, 560, 1120] = 70
    llm_provider: Literal["openrouter", "gemini", "openai", "anthropic", "ollama", "fake"] = (
        "openrouter"
    )
    default_chat_model: str = ""
    default_cheap_model: str = ""
    fallback_model: str = ""
    openrouter_api_key: str = ""
    gemini_api_key: str = ""
    openai_api_key: str = ""
    openai_tts_model: str = "gpt-4o-mini-tts"
    tts_provider: Literal["kokoro", "openai", "fake"] = "kokoro"
    tts_url: str = "http://tts:8002"
    tts_concurrency: int = Field(default=1, ge=1, le=2)
    tts_model_cache: Path = Path("/models")
    anthropic_api_key: str = ""
    jwks_url: str = "http://localhost:3000/api/auth/jwks"
    jwt_issuer: str = "http://localhost:3000"
    jwt_audience: str = "opennotebook-api"
    settings_encryption_key: str = ""
    ollama_base_url: str = "http://localhost:11434"
    llm_concurrency: int = Field(default=4, ge=1, le=32)
    job_max_tries: int = Field(default=3, ge=1, le=10)
    db_pool_size: int = Field(default=10, ge=1, le=50)
    db_max_overflow: int = Field(default=10, ge=0, le=50)
    orphan_file_grace_hours: int = Field(default=24, ge=1, le=720)
    chat_context_tokens: int = Field(default=8192, ge=2048)
    chat_max_history: int = Field(default=6, ge=0, le=20)
    chat_rate_limit_per_minute: int = Field(default=30, ge=1)
    chat_rerank: bool = False
    summary_map_max_bytes: int = Field(default=6000, ge=1000, le=16000)
    artifact_map_max_bytes: int = Field(default=10000, ge=2000, le=32000)
    upload_max_mb: int = Field(default=50, ge=1)
    source_quota_per_user: int = Field(default=250, ge=1)
    chat_tokens_per_day: int = Field(default=100000, ge=1000)
    account_internal_token: str = ""
    smtp_host: str = ""
    smtp_port: int = Field(default=1025, ge=1, le=65535)
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = "OpenNotebook Studio <no-reply@localhost>"
    smtp_starttls: bool = False

    @field_validator("embed_dim")
    @classmethod
    def valid_embed_dim(cls, value: int) -> int:
        if value not in {128, 256, 512, 768}:
            raise ValueError("EMBED_DIM must be 128, 256, 512, or 768")
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()
