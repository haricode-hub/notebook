import asyncio
import json
import logging
import time
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager
from contextvars import ContextVar
from uuid import uuid4

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from opennotebook_core.config import Settings, get_settings
from opennotebook_core.db import make_session_factory
from opennotebook_core.embeddings import make_embedding
from opennotebook_core.llm import make_llm
from pydantic import BaseModel
from redis.asyncio import Redis
from sqlalchemy import text as sql_text
from sqlalchemy.ext.asyncio import create_async_engine

from opennotebook_api.deps.auth import JWKSVerifier
from opennotebook_api.routers import artifacts, chat, guides, notebooks, notes, sharing, sources
from opennotebook_api.routers import settings as settings_router

request_id_var: ContextVar[str] = ContextVar("request_id", default="")


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        return json.dumps(
            {
                "level": record.levelname,
                "message": record.getMessage(),
                "request_id": request_id_var.get(),
                "logger": record.name,
            }
        )


def configure_logging() -> None:
    handler = logging.StreamHandler()
    handler.setFormatter(JsonFormatter())
    root = logging.getLogger("opennotebook")
    root.handlers = [handler]
    root.setLevel(logging.INFO)


class ErrorBody(BaseModel):
    code: str
    message: str
    request_id: str


class ReadinessBody(BaseModel):
    status: str
    db: str
    redis: str
    embed: str


async def check_db(settings: Settings) -> bool:
    engine = create_async_engine(settings.database_url, pool_pre_ping=True)
    try:
        async with engine.connect() as connection:
            await connection.execute(sql_text("SELECT 1"))
        return True
    finally:
        await engine.dispose()


async def check_redis(settings: Settings) -> bool:
    redis = Redis.from_url(settings.redis_url)
    try:
        return bool(await redis.ping())
    finally:
        await redis.aclose()


async def check_embed(settings: Settings) -> bool:
    async with httpx.AsyncClient(timeout=2) as client:
        response = await client.get(f"{settings.embed_url.rstrip('/')}/readyz")
        return response.status_code == 200


Check = Callable[[Settings], Awaitable[bool]]


def create_app(
    settings: Settings | None = None,
    checks: dict[str, Check] | None = None,
) -> FastAPI:
    settings = settings or get_settings()
    configure_logging()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        yield
        await app.state.session_factory.kw["bind"].dispose()

    app = FastAPI(title="OpenNotebook Studio API", version="0.1.0", lifespan=lifespan)
    app.state.settings = settings
    app.state.session_factory = make_session_factory(settings)
    app.state.jwks_verifier = JWKSVerifier(settings)
    app.state.llm_factory = make_llm
    app.state.embedding_factory = make_embedding
    app.state.model_catalog = settings_router.ModelCatalog()
    app.state.chat_limiter = chat.RedisChatLimiter(
        settings.redis_url, settings.chat_rate_limit_per_minute
    )
    app.include_router(notebooks.router)
    app.include_router(sources.router)
    app.include_router(sources.files_router)
    app.include_router(chat.router)
    app.include_router(guides.router)
    app.include_router(notes.router)
    app.include_router(artifacts.router)
    app.include_router(settings_router.router)
    app.include_router(sharing.router)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=[settings.web_origin],
        allow_credentials=False,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
        allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
    )
    app.add_middleware(GZipMiddleware, minimum_size=1024, compresslevel=5)
    probes = checks or {"db": check_db, "redis": check_redis, "embed": check_embed}
    logger = logging.getLogger("opennotebook.api")

    @app.middleware("http")
    async def request_context(
        request: Request, call_next: Callable[..., Awaitable[JSONResponse]]
    ) -> JSONResponse:
        request_id = request.headers.get("x-request-id") or str(uuid4())
        token = request_id_var.set(request_id)
        start = time.perf_counter()
        try:
            length = int(request.headers.get("content-length", "0"))
            if length > settings.upload_max_mb * 1024 * 1024:
                response = JSONResponse(
                    status_code=413,
                    content=ErrorBody(
                        code="body_too_large",
                        message="Request body too large",
                        request_id=request_id,
                    ).model_dump(),
                )
            else:
                response = await call_next(request)
            response.headers["x-request-id"] = request_id
            logger.info(
                "request method=%s path=%s status=%s duration_ms=%.1f",
                request.method,
                request.url.path,
                response.status_code,
                (time.perf_counter() - start) * 1000,
            )
            return response
        finally:
            request_id_var.reset(token)

    @app.exception_handler(HTTPException)
    async def http_error(request: Request, exc: HTTPException) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            headers=exc.headers,
            content=ErrorBody(
                code="http_error", message=str(exc.detail), request_id=request_id_var.get()
            ).model_dump(),
        )

    @app.exception_handler(RequestValidationError)
    async def validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
        return JSONResponse(
            status_code=422,
            content=ErrorBody(
                code="validation_error", message=str(exc), request_id=request_id_var.get()
            ).model_dump(),
        )

    @app.get("/healthz")
    async def healthz() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/readyz", response_model=ReadinessBody)
    async def readyz() -> JSONResponse:
        async def probe(name: str, fn: Check) -> tuple[str, str]:
            try:
                return name, "ok" if await asyncio.wait_for(fn(settings), timeout=3) else "down"
            except Exception:
                logger.warning("dependency_unavailable name=%s", name)
                return name, "down"

        results = dict(await asyncio.gather(*(probe(name, fn) for name, fn in probes.items())))
        data = ReadinessBody(
            status="ok" if all(value == "ok" for value in results.values()) else "degraded",
            **results,
        )
        return JSONResponse(
            status_code=200 if data.status == "ok" else 503, content=data.model_dump()
        )

    return app


app = create_app()
