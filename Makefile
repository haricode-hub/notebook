.PHONY: dev test lint typecheck migrate auth-migrate seed sample types smoke eval eval-real eval-real-heldout benchmark-chat

dev:
	docker compose up --build -d

test:
	uv run --frozen --all-packages pytest --cov=opennotebook_core.storage --cov=opennotebook_core.embeddings --cov=opennotebook_core.queue --cov-report=term-missing --cov-fail-under=80
	corepack pnpm --filter web test

lint:
	uv run --frozen --all-packages ruff check .
	corepack pnpm --filter web lint

typecheck:
	uv run --frozen --all-packages mypy .
	corepack pnpm --filter web typecheck

migrate:
	docker compose exec -T api alembic -c packages/core/alembic.ini upgrade head

auth-migrate:
	docker compose run --rm auth-migrate

seed:
	uv run python scripts/seed.py

sample:
	uv run --frozen --all-packages python scripts/load_onboarding_sample.py

types:
	uv run --frozen --all-packages python scripts/export_openapi.py
	corepack pnpm --filter web exec openapi-typescript ../../openapi.json -o src/lib/generated/api.d.ts

smoke:
	docker compose exec -T api python scripts/smoke_ping.py

eval:
	uv run --frozen --all-packages python evals/run.py

eval-real:
	uv run --frozen --all-packages python evals/real/run.py --split dev

eval-real-heldout:
	uv run --frozen --all-packages python evals/real/run.py --split heldout

benchmark-chat:
	uv run --frozen --all-packages python scripts/benchmark_level3.py
