FROM python:3.12-slim
COPY --from=ghcr.io/astral-sh/uv:0.8.4 /uv /bin/uv
RUN apt-get update && apt-get install -y --no-install-recommends espeak-ng libsndfile1 ffmpeg && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV UV_LINK_MODE=copy
COPY apps/tts/pyproject.toml apps/tts/uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv uv sync --frozen --no-dev
COPY apps/tts/main.py ./main.py
ENV PATH="/app/.venv/bin:$PATH" PYTHONUNBUFFERED=1 HF_HOME=/models
EXPOSE 8002
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8002"]
