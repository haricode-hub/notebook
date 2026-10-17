# LEVEL 1: Better Auth, Notebooks, Three-Panel Shell, Model Settings

Prerequisite: `AGENTS.md`; Level 0 complete.

## Feature name
Accounts with Better Auth, JWT bridge to FastAPI, notebook CRUD, NotebookLM-style layout, and OpenRouter-first model settings.

## Objectives and goals
- Users sign up/in with Better Auth and see only their own notebooks.
- FastAPI trusts only verified Better Auth JWTs.
- The UI skeleton every later feature plugs into.
- Model settings work end to end: OpenRouter default, switchable to Gemini/OpenAI/Anthropic/Ollama.

## Scope
**Auth (Next.js):** Better Auth with Postgres adapter, email+password, optional Google/GitHub when env keys exist, JWT plugin (15 min expiry, `sub`, `role` claim), rate limiting (strict on sign-in/up), CLI migration (`make auth-migrate`), sign-in/up/out pages, protected routes, `authClient` + `useSession`.
**API:** `get_current_user` dependency (JWKS verification, caching, rotation, leeway), notebooks CRUD, `user_settings` (provider, chat_model, cheap_model, fallback_model, encrypted keys, ollama base_url), `/settings/test-connection` (tiny chat call + tiny embedding call), `/settings/models?provider=openrouter` returning the live OpenRouter model list (cached), ownership dependency returning 404 for others' resources.
**Web:** `apiFetch()` with JWT caching/refresh and one retry on 401; notebook list (cards, create, rename, delete confirm); workspace with `react-resizable-panels` (Sources | Chat | Studio), collapsible, mobile tabs, empty states; Settings page with provider selector, model picker (searchable), key fields, "Test connection", per-notebook persona/response-length fields (stored, used later); light/dark theme; toasts; skeletons.

## Agent Prompt
```
Read AGENTS.md and this file. Level 0 is done. Execute LEVEL 1 only.
FIRST use Context7 to confirm: Better Auth server config with the Postgres adapter, emailAndPassword, the jwt plugin (JWKS and token endpoints, definePayload for custom claims, issuer/audience/expiry), Next.js route handler + client setup (authClient, useSession, token retrieval), rate limiting, CLI generate/migrate, the Next.js route-protection convention for the installed major version, and current LiteLLM usage with OpenRouter (model prefix, api_base/key handling, streaming). Record findings in docs/DECISIONS.md (ADR-004).
Web: src/lib/auth.ts, src/lib/auth-client.ts, app/api/auth/[...all]/route.ts, sign-in/up pages (shadcn forms + zod), protected layout, sign-out, `make auth-migrate`. Enable social providers only if env vars exist. JWT plugin with role claim.
API: deps/auth.py JWKS verification (cache, refresh on unknown kid, leeway 10 s, 401 + WWW-Authenticate). Tables notebooks, user_settings (user_id TEXT indexed; no FK to auth tables). Endpoints: /notebooks CRUD, /settings GET/PUT, /settings/models, /settings/test-connection. Fernet-encrypt keys with SETTINGS_ENCRYPTION_KEY. Default provider = openrouter using server key OPENROUTER_API_KEY unless the user supplies their own. Never hardcode model names; use DEFAULT_CHAT_MODEL / DEFAULT_CHEAP_MODEL env defaults.
Web: apiFetch with token cache/refresh, typed OpenAPI client, notebook list, workspace panels + mobile tabs, settings UI (provider switching, model picker, test button), theme, toasts, skeletons.
Tests: JWT verification (valid, expired, wrong aud, wrong iss, tampered, unknown kid, rotated key => correct 401/200); ownership isolation; settings encryption; provider switching changes the implementation (FakeLLM spy); test-connection with Fake providers; Playwright e2e (sign up, create notebook, open workspace, change theme, sign out, protected redirect).
Output <promise>L1_COMPLETE</promise> when acceptance tests pass.
```

## Task checklist
- [ ] Context7 research + ADR-004
- [ ] Better Auth server config, CLI migration, Docker/env wiring
- [ ] Sign in/up/out UI + route protection
- [ ] JWT plugin + role claim
- [ ] FastAPI JWKS verification dependency
- [ ] notebooks + user_settings + ownership
- [ ] Settings encryption, model list endpoint, test-connection
- [ ] apiFetch with token caching/refresh
- [ ] Notebook list UI
- [ ] Three-panel workspace + mobile tabs
- [ ] Settings UI + provider switching
- [ ] Tests + e2e

## Acceptance tests
1. Sign up, sign in, reload: session persists; sign out clears it; signed-out visit to `/notebooks` redirects to sign-in.
2. FastAPI returns 401 for: no token, malformed, expired, wrong `aud`/`iss`, tampered signature, unknown `kid`.
3. Valid JWT: `GET /notebooks` returns only that user's notebooks.
4. User B gets 404 on GET/PATCH/DELETE of user A's notebook.
5. After JWKS key rotation the API accepts new-key tokens without restart.
6. API keys are not plaintext in the DB (test reads raw column).
7. Settings default to OpenRouter; "Test connection" succeeds with a valid key (or Ollama) and gives a clear error for a bad key.
8. Switching provider changes the LiteLLM route on the next call (spy test); the model list loads and is searchable.
9. Repeated failed sign-ins are throttled (429).
10. Panels resize/collapse; at 390 px they become tabs. Playwright e2e passes.

## Working condition
"I sign in with Better Auth, create notebooks, flip between OpenRouter, Gemini, OpenAI, Anthropic and Ollama in settings and test the connection, FastAPI only accepts my verified token, and the layout feels like NotebookLM."
