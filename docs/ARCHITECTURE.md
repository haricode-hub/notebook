# Architecture

Level 1 adds Better Auth to Next.js. It owns the `user`, `session`, `account`, `verification`, `jwks`, and `rateLimit` tables in the shared PostgreSQL database. `make auth-migrate` runs its CLI migration; Compose runs that job before web starts. Alembic owns `notebooks` and `user_settings` and runs on API startup. App tables have no foreign key to Better Auth tables.

The browser uses a Better Auth session cookie with Next.js, then requests a 15-minute JWT through the JWT plugin. `apiFetch` caches the token until shortly before expiry and retries once after a 401. FastAPI obtains signing keys from Next.js `/api/auth/jwks`, validates the token, and scopes every notebook and settings query by its subject. The API never reads Better Auth tables. `JWKS_URL` is the internal service URL; `JWT_ISSUER` and `BETTER_AUTH_URL` use the public web origin.

User settings store provider-native model IDs and a Fernet-encrypted map of provider keys. A personal key overrides the matching server key; OpenRouter uses `OPENROUTER_API_KEY` by default. `/settings/models` fetches live provider lists, and `/settings/test-connection` makes a small chat and embedding call. `DEFAULT_CHAT_MODEL` and `DEFAULT_CHEAP_MODEL` are environment defaults; the repository does not choose a provider model slug.

Level 1 adds Better Auth to Next.js. It owns the `user`, `session`, `account`, `verification`, `jwks`, and `rateLimit` tables in the shared PostgreSQL database. `make auth-migrate` runs its CLI migration; Compose runs that job before web starts. Alembic owns `notebooks` and `user_settings` and runs on API startup. App tables have no foreign key to Better Auth tables.

The browser uses a Better Auth session cookie with Next.js, then requests a 15-minute JWT through the JWT plugin. `apiFetch` caches the token until shortly before expiry and retries once after a 401. FastAPI obtains signing keys from Next.js `/api/auth/jwks`, validates the token, and scopes every notebook and settings query by its subject. The API never reads Better Auth tables. `JWKS_URL` is the internal service URL; `JWT_ISSUER` and `BETTER_AUTH_URL` use the public web origin.

User settings store provider-native model IDs and a Fernet-encrypted map of provider keys. A personal key overrides the matching server key; OpenRouter uses `OPENROUTER_API_KEY` by default. `/settings/models` fetches live provider lists, and `/settings/test-connection` makes a small chat and embedding call. `DEFAULT_CHAT_MODEL` and `DEFAULT_CHEAP_MODEL` are environment defaults; the repository does not choose a provider model slug.

Level 1 runs a Next.js web process, FastAPI API, arq worker, embedding HTTP service, PostgreSQL with pgvector, and Redis. The API remains stateless. Core interfaces own provider selection and keep filesystem and queue details out of routes. See `AGENTS.md` and `docs/DECISIONS.md` for contracts.

Better Auth owns the `user`, `session`, `account`, `verification`, `jwks`, and `rateLimit` tables in the shared PostgreSQL database. `make auth-migrate` runs its CLI migration; Compose runs that job before the web service. Alembic owns `notebooks` and `user_settings` and runs on API startup. No app table has a foreign key to Better Auth's tables.

The browser uses a Better Auth session cookie with Next.js, then requests a 15-minute JWT through the JWT plugin. `apiFetch` caches the token until shortly before expiry and retries once after a 401. FastAPI obtains signing keys from Next.js `/api/auth/jwks`, validates the token and scopes every notebook and settings query by its subject. The API never reads Better Auth tables. `JWKS_URL` is the internal service URL, while `JWT_ISSUER` and `BETTER_AUTH_URL` use the public web origin.

User settings store provider-native model IDs and a Fernet-encrypted map of provider keys. An entered key overrides the matching server key; OpenRouter uses `OPENROUTER_API_KEY` by default. `/settings/models` fetches live provider lists, and `/settings/test-connection` makes a small chat and embedding call. `DEFAULT_CHAT_MODEL` and `DEFAULT_CHEAP_MODEL` are environment defaults; the repository does not choose a provider model slug.
