# Security operations checklist

## Identity and authorization

- Use HTTPS in production and set a unique `BETTER_AUTH_SECRET`; secure cookies activate when `NODE_ENV=production`.
- Set `BETTER_AUTH_URL` and `WEB_ORIGIN` to the public HTTPS origin. Do not add wildcard trusted origins.
- Better Auth owns sessions, JWT signing keys, and rate-limit state in shared PostgreSQL. API requests use short-lived bearer JWTs verified against JWKS.
- Every private API route requires a JWT; ownership checks scope records to the authenticated user and notebook. The automated OpenAPI sweep checks unauthenticated access; ownership tests check cross-user IDs.
- Grant admin role only to trusted operators. The admin API checks the signed role claim and exposes failed-job and aggregate chat-usage information.

After the operator has signed up, promote the intended account from a trusted server shell, then have them sign out and back in so their JWT includes the new role:

```sh
docker compose exec -T postgres psql -U studio -d studio <<'SQL'
UPDATE "user" SET role = 'admin' WHERE email = 'ops@example.com';
SQL
```

## Data, uploads, and providers

- Set a stable `SETTINGS_ENCRYPTION_KEY` and back it up separately from the database. User provider keys are stored encrypted.
- Keep local storage volumes private, or use private S3 buckets with restricted service credentials. App file links are short-lived and bound to their requesting user.
- Keep the 50 MB upload limit and SSRF-safe URL fetcher enabled. Do not expose internal service endpoints to user-controlled URLs.
- Configure per-user source and daily chat-token quotas for the expected resource budget. Configure model provider fallbacks explicitly.
- Do not put secrets in source, fixtures, issue comments, or logs. Gitleaks runs on pushes and pull requests; rotate any credential reported by the scanner.

## Browser and service controls

- Web and API responses include CSP and browser security headers. Production enables HSTS; development permits `unsafe-eval` only for Next.js development tooling.
- Keep PostgreSQL and Redis on private networks. Publish only the web/API ingress, protected with TLS at Caddy, Traefik, or the production load balancer.
- Run `uv run --with pip-audit --frozen pip-audit --locked` and `pnpm audit --prod`; both checks are in CI.
- Review failed jobs and usage from the admin page. Rehearse PostgreSQL restore before schema upgrades and keep MinIO/S3 backups under the organization's retention policy.

## Operational limitations

SMTP is not configured, so email verification is disabled. Two-factor authentication and Langfuse tracing are also not configured. The default Compose stack is a single-host deployment; its local MinIO, PostgreSQL, Redis, worker, and embedding service are not highly available.
