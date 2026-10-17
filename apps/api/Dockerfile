FROM python:3.13-slim AS builder
COPY --from=ghcr.io/astral-sh/uv:0.8.4 /uv /bin/uv
WORKDIR /app
ENV UV_LINK_MODE=copy UV_COMPILE_BYTECODE=1
COPY pyproject.toml uv.lock .python-version ./
COPY apps/api/pyproject.toml apps/api/pyproject.toml
COPY apps/worker/pyproject.toml apps/worker/pyproject.toml
COPY apps/embed/pyproject.toml apps/embed/pyproject.toml
COPY packages/core/pyproject.toml packages/core/pyproject.toml
RUN uv sync --frozen --no-dev --package opennotebook-api --no-install-workspace
COPY . /app
RUN uv sync --frozen --no-dev --package opennotebook-api

FROM python:3.13-slim
WORKDIR /app
COPY --from=builder /app /app
ENV PATH="/app/.venv/bin:$PATH" PYTHONUNBUFFERED=1
EXPOSE 8000
CMD ["sh", "-c", "alembic -c packages/core/alembic.ini upgrade head && uvicorn opennotebook_api.main:app --host 0.0.0.0 --port 8000 --workers 2"]
