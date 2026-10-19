# Scaling and production operations

## Current deployment shape

The default Compose file is a single-host installation: one web container, one API container, one arq worker, one CPU embedding service, one TTS service, PostgreSQL 16 with pgvector, and Redis. The supported target is about five concurrent users on a 2–4 vCPU / 8 GB host. EmbeddingGemma is the largest steady memory consumer; keep the persistent `model_cache` volume between restarts. Job and provider concurrency are configurable in `.env`.

Better Auth sessions, JWKS keys, and rate limits are stored in PostgreSQL, so web replicas share state. The API verifies JWTs against Better Auth's JWKS endpoint and is otherwise stateless. Worker jobs persist status in PostgreSQL and use Redis/arq for retries and delivery. Keep the number of workers modest while the local embedding model shares the host CPU.

## Three web and API replicas with MinIO

`docker-compose.scale.yml` is a local scale topology. It adds three web containers, three API containers, MinIO object storage, a one-shot bucket initializer, and separate Nginx ingress proxies. Nginx disables buffering for API responses so chat and progress SSE continue to stream. Browser origins remain `http://localhost:3000` and `http://localhost:8000`; the proxies resolve Compose service DNS names at runtime. MinIO's bucket is shared by all API and worker instances.

Set strong values for `BETTER_AUTH_SECRET`, `SETTINGS_ENCRYPTION_KEY`, `OPENROUTER_API_KEY`, `MINIO_ROOT_USER`, and `MINIO_ROOT_PASSWORD` in `.env`. Then start and verify the scale stack:

```sh
docker compose -f docker-compose.yml -f docker-compose.scale.yml config -q
docker compose -f docker-compose.yml -f docker-compose.scale.yml up --build -d
docker compose -f docker-compose.yml -f docker-compose.scale.yml ps
curl --fail http://localhost:8000/readyz
```

Use the same browser suite against the public proxy endpoints:

```sh
PLAYWRIGHT_BASE_URL=http://localhost:3000 pnpm --filter web e2e
```

The suite signs in through the web proxy and calls the API proxy directly, exercising shared Better Auth database state and S3-compatible object storage. This override is a scale-path verification environment; it is not a multi-host production deployment. MinIO and the database are single instances with local volumes and remain single points of failure.

## VPS first deployment

For a single VPS, start with the scale override and put host Caddy in front of its loopback-only ports. The [example Caddyfile](../deploy/Caddyfile.example) uses separate app and API hostnames so the browser can call FastAPI directly as configured by `NEXT_PUBLIC_API_URL`.

1. Point `app.example.com` and `api.example.com` DNS records to the VPS. Allow inbound TCP 80/443 and SSH; keep PostgreSQL, Redis, MinIO, and application ports closed to the public network.
2. Install Docker Engine with the Compose plugin and Caddy, clone the repository, and copy `.env.example` to `.env`.
3. Set `BETTER_AUTH_URL=https://app.example.com`, `WEB_ORIGIN=https://app.example.com`, and `NEXT_PUBLIC_API_URL=https://api.example.com`. Generate strong unique auth, settings-encryption, and MinIO credentials; add the OpenRouter key and default models.
4. Start the production-scale app and apply both migrations:

   ```sh
   docker compose -f docker-compose.yml -f docker-compose.scale.yml up --build -d
   docker compose -f docker-compose.yml -f docker-compose.scale.yml run --rm auth-migrate
   docker compose -f docker-compose.yml -f docker-compose.scale.yml exec -T api alembic -c packages/core/alembic.ini upgrade head
   ```

5. Install the Caddyfile example with your real hostnames, validate/reload Caddy, and check both HTTPS origins, sign-up, upload, chat, and one generated artifact.
6. Schedule `scripts/backup_db.ps1` on Windows or the equivalent `pg_dump -Fc` command on Linux; configure off-host database and object-store backups, monitoring, and restore drills.

The steps are intended to fit a fresh deployment in under 30 minutes when Docker images can be pulled and DNS is already configured. This environment could not time or validate the VPS procedure, TLS issuance, PostgreSQL restore, or object-store recovery. Do a rehearsal before treating that estimate as measured.

## Five-user load check

Install k6 and create five registered load-test accounts. Set `K6_EMAIL_1` through `K6_EMAIL_5` and matching `K6_PASSWORD_1` through `K6_PASSWORD_5`, plus `WEB_ORIGIN` and `API_ORIGIN`, then run:

```sh
k6 run load/level10.js
```

The scenario signs each VU in separately, obtains a short-lived API JWT, and has five VUs create notebooks, upload/index a small source, send grounded chat requests, and queue one briefing artifact each over ten minutes. It enforces <1% HTTP errors and a <4 s p95 complete chat-response time. Since k6's normal HTTP API reports the completed response, that duration is a conservative upper bound for first-token time; inspect server `time_to_first_token` timing logs when evaluating the specific first-token SLO. Run with the configured cloud provider and a drained queue before drawing latency conclusions. The script creates load-test notebooks; delete them after the run.

Record the k6 summary, host CPU/RSS, first-token server timing, HTTP error rate, and queue depth with the deployment report. Do not claim the five-user SLO is met until this run completes on the target hardware. Avoid using a personal account or production data.

## Moving beyond one host

1. Put the web and API containers behind a managed L7 proxy or ingress with TLS. Preserve SSE by disabling response buffering and setting read timeouts long enough for generation.
2. Replace Compose PostgreSQL with managed PostgreSQL 16 plus pgvector. Size connection pools against the replica count (`DB_POOL_SIZE * API replicas`) and keep automatic backups plus restore rehearsals.
3. Replace the local MinIO volume with an S3-compatible managed bucket. Keep object URLs private; the app's expiring signed file route remains user-bound.
4. Keep Redis reachable by every API and worker replica. Configure persistence and alerts for queue depth, retry exhaustion, and memory.
5. Scale workers separately from APIs. Start at one worker process and increase arq concurrency only after checking CPU, memory, database pool, and provider limits.
6. Keep one embedding process on CPU initially. If it becomes a bottleneck, place the embed service on a GPU host or switch to a compatible remote embedding provider after validating dimensions and reindexing.
7. Set stable auth/API origins and secrets across replicas. Better Auth uses shared Postgres state; do not configure per-replica in-memory session or rate-limit storage.

The scale Compose config, full browser suite, backup restore, five-user k6 run, and fresh-clone VPS time have not been exercised on this host because its Docker daemon is unavailable. Re-run the commands above in a Docker-enabled Linux environment before deployment.
