import json
import logging
import time
from typing import Annotated, Literal
from urllib.parse import urlparse

import httpx
from cryptography.fernet import Fernet, InvalidToken
from fastapi import APIRouter, Depends, HTTPException, Request
from opennotebook_core.config import Settings
from opennotebook_core.models import UserSettings
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.ext.asyncio import AsyncSession

from opennotebook_api.deps.auth import CurrentUser, get_current_user
from opennotebook_api.deps.db import get_db

router = APIRouter(prefix="/settings", tags=["settings"])
User = Annotated[CurrentUser, Depends(get_current_user)]
Db = Annotated[AsyncSession, Depends(get_db)]
Provider = Literal["openrouter", "gemini", "openai", "anthropic", "ollama"]
logger = logging.getLogger("opennotebook.api.settings")


class SettingsOut(BaseModel):
    provider: Provider
    chat_model: str
    cheap_model: str
    fallback_model: str
    has_api_key: bool
    using_server_key: bool
    ollama_base_url: str


class SettingsUpdate(BaseModel):
    provider: Provider | None = None
    chat_model: str | None = Field(default=None, max_length=200)
    cheap_model: str | None = Field(default=None, max_length=200)
    fallback_model: str | None = Field(default=None, max_length=200)
    api_key: str | None = Field(default=None, max_length=2048)
    ollama_base_url: str | None = Field(default=None, max_length=300)

    @field_validator("ollama_base_url")
    @classmethod
    def valid_ollama_url(cls, value: str | None) -> str | None:
        if value is None:
            return None
        parsed = urlparse(value)
        if parsed.scheme not in {"http", "https"} or not parsed.hostname:
            raise ValueError("Enter a valid Ollama HTTP URL")
        if parsed.username or parsed.password or parsed.query or parsed.fragment:
            raise ValueError("Ollama URL cannot include credentials, query, or fragment")
        return value.rstrip("/")


class ModelOption(BaseModel):
    id: str
    name: str
    context_length: int | None = None


class ModelsOut(BaseModel):
    models: list[ModelOption]


class ConnectionOut(BaseModel):
    status: Literal["ok"]
    message: str


def key_cipher(settings: Settings) -> Fernet:
    if not settings.settings_encryption_key:
        raise HTTPException(status_code=503, detail="SETTINGS_ENCRYPTION_KEY is not configured")
    try:
        return Fernet(settings.settings_encryption_key.encode())
    except ValueError as exc:
        raise HTTPException(status_code=503, detail="Invalid SETTINGS_ENCRYPTION_KEY") from exc


def read_keys(row: UserSettings | None, settings: Settings) -> dict[str, str]:
    if row is None or not row.encrypted_keys:
        return {}
    try:
        plaintext = key_cipher(settings).decrypt(row.encrypted_keys.encode())
        keys = json.loads(plaintext)
        if not isinstance(keys, dict) or not all(
            isinstance(k, str) and isinstance(v, str) for k, v in keys.items()
        ):
            raise ValueError("Invalid key map")
        return keys
    except (InvalidToken, ValueError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=500, detail="Stored API keys cannot be decrypted") from exc


def write_keys(keys: dict[str, str], settings: Settings) -> str | None:
    if not keys:
        return None
    return key_cipher(settings).encrypt(json.dumps(keys, sort_keys=True).encode()).decode()


def server_key(provider: str, settings: Settings) -> str:
    return {
        "openrouter": settings.openrouter_api_key,
        "gemini": settings.gemini_api_key,
        "openai": settings.openai_api_key,
        "anthropic": settings.anthropic_api_key,
    }.get(provider, "")


def effective_key(provider: str, row: UserSettings | None, settings: Settings) -> str:
    return read_keys(row, settings).get(provider) or server_key(provider, settings)


def settings_response(row: UserSettings | None, settings: Settings) -> SettingsOut:
    provider: Provider = row.provider if row is not None else "openrouter"  # type: ignore[assignment]
    keys = read_keys(row, settings)
    has_key = bool(keys.get(provider))
    return SettingsOut(
        provider=provider,
        chat_model=row.chat_model if row is not None else settings.default_chat_model,
        cheap_model=row.cheap_model if row is not None else settings.default_cheap_model,
        fallback_model=row.fallback_model if row is not None else settings.fallback_model,
        has_api_key=has_key,
        using_server_key=not has_key and bool(server_key(provider, settings)),
        ollama_base_url=(row.ollama_base_url if row is not None else None)
        or settings.ollama_base_url,
    )


async def settings_row(db: AsyncSession, user_id: str) -> UserSettings | None:
    return await db.get(UserSettings, user_id)


@router.get("", response_model=SettingsOut)
async def get_user_settings(user: User, db: Db, request: Request) -> SettingsOut:
    return settings_response(await settings_row(db, user.id), request.app.state.settings)


@router.put("", response_model=SettingsOut)
async def put_user_settings(
    body: SettingsUpdate, user: User, db: Db, request: Request
) -> SettingsOut:
    config: Settings = request.app.state.settings
    row = await settings_row(db, user.id)
    if row is None:
        row = UserSettings(
            user_id=user.id,
            provider="openrouter",
            chat_model=config.default_chat_model,
            cheap_model=config.default_cheap_model,
            fallback_model="",
        )
        db.add(row)
    for field in ("provider", "chat_model", "cheap_model", "fallback_model", "ollama_base_url"):
        value = getattr(body, field)
        if field in body.model_fields_set and value is not None:
            setattr(row, field, value)
    if "api_key" in body.model_fields_set and body.api_key is not None:
        keys = read_keys(row, config)
        if body.api_key.strip():
            keys[row.provider] = body.api_key.strip()
        else:
            keys.pop(row.provider, None)
        row.encrypted_keys = write_keys(keys, config)
    await db.commit()
    await db.refresh(row)
    return settings_response(row, config)


class ModelCatalog:
    def __init__(self) -> None:
        self._openrouter_cache: list[ModelOption] = []
        self._openrouter_expires_at = 0.0

    def context_length(self, model_id: str) -> int | None:
        for model in self._openrouter_cache:
            if model.id == model_id:
                return model.context_length
        return None

    async def list_models(self, provider: Provider, key: str, ollama_url: str) -> list[ModelOption]:
        if (
            provider == "openrouter"
            and self._openrouter_cache
            and time.monotonic() < self._openrouter_expires_at
        ):
            return self._openrouter_cache
        headers: dict[str, str] = {}
        params: dict[str, str] = {}
        if provider == "openrouter":
            url = "https://openrouter.ai/api/v1/models"
            if key:
                headers["Authorization"] = f"Bearer {key}"
        elif provider == "gemini":
            if not key:
                return []
            url = "https://generativelanguage.googleapis.com/v1beta/models"
            params["key"] = key
        elif provider == "openai":
            if not key:
                return []
            url = "https://api.openai.com/v1/models"
            headers["Authorization"] = f"Bearer {key}"
        elif provider == "anthropic":
            if not key:
                return []
            url = "https://api.anthropic.com/v1/models"
            headers.update({"x-api-key": key, "anthropic-version": "2023-06-01"})
        else:
            url = f"{ollama_url.rstrip('/')}/api/tags"
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(url, headers=headers, params=params)
            response.raise_for_status()
            payload = response.json()
        entries = payload.get("models" if provider == "ollama" else "data", [])
        if provider == "gemini":
            entries = payload.get("models", [])
        models: list[ModelOption] = []
        for item in entries:
            if not isinstance(item, dict):
                continue
            model_id = item.get("id") or item.get("name")
            if not isinstance(model_id, str):
                continue
            if provider == "gemini":
                model_id = model_id.removeprefix("models/")
            name = item.get("displayName") or item.get("name") or model_id
            raw_context = item.get("context_length") if provider == "openrouter" else None
            context_length = (
                raw_context if isinstance(raw_context, int) and raw_context > 0 else None
            )
            models.append(ModelOption(id=model_id, name=str(name), context_length=context_length))
        models.sort(key=lambda model: model.name.casefold())
        if provider == "openrouter":
            self._openrouter_cache = models
            self._openrouter_expires_at = time.monotonic() + 300
        return models


@router.get("/models", response_model=ModelsOut, response_model_exclude_none=True)
async def list_models(
    user: User,
    db: Db,
    request: Request,
    provider: Provider | None = None,
) -> ModelsOut:
    row = await settings_row(db, user.id)
    config: Settings = request.app.state.settings
    chosen: Provider = provider or (row.provider if row else "openrouter")  # type: ignore[assignment]
    key = effective_key(chosen, row, config)
    ollama_url = (row.ollama_base_url if row else None) or config.ollama_base_url
    try:
        options = await request.app.state.model_catalog.list_models(chosen, key, ollama_url)
    except httpx.HTTPError as exc:
        logger.warning("model_list_failed provider=%s error=%s", chosen, type(exc).__name__)
        raise HTTPException(
            status_code=502, detail="Model list is temporarily unavailable"
        ) from exc
    return ModelsOut(models=options)


@router.post("/test-connection", response_model=ConnectionOut)
async def test_connection(user: User, db: Db, request: Request) -> ConnectionOut:
    row = await settings_row(db, user.id)
    config: Settings = request.app.state.settings
    view = settings_response(row, config)
    if not view.chat_model:
        raise HTTPException(status_code=400, detail="Select a chat model first")
    key = effective_key(view.provider, row, config)
    if view.provider != "ollama" and not key:
        raise HTTPException(status_code=400, detail=f"Add a {view.provider} API key first")
    selected = config.model_copy(
        update={
            "llm_provider": view.provider,
            "default_chat_model": view.chat_model,
            f"{view.provider}_api_key": key,
            "ollama_base_url": view.ollama_base_url,
        }
    )
    try:
        llm = request.app.state.llm_factory(selected)
        async for _ in llm.stream([{"role": "user", "content": "Reply with OK."}]):
            pass
        embedder = request.app.state.embedding_factory(config)
        await embedder.embed(["connection test"], "query", config.embed_dim)
    except Exception as exc:
        logger.warning(
            "connection_test_failed provider=%s error=%s", view.provider, type(exc).__name__
        )
        raise HTTPException(
            status_code=400,
            detail=(
                f"{view.provider} connection failed. Check the API key, model, "
                "and service availability."
            ),
        ) from exc
    return ConnectionOut(status="ok", message="Chat and embeddings are available")
