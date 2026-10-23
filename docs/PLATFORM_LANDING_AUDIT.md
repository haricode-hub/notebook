# Public site, privacy, and launch audit

Updated: October 23, 2026

## Implemented

- Replaced the service-readiness-only root route with a responsive public product page that points to the real signup and notebook routes.
- Added a centralized service registry. Open Notebook is the only visible and available service; future entries can be added without changing the landing-page structure.
- Added public Privacy, Terms, Cookie, and Contact pages, linked from the footer. Policy text describes the existing code and marks operator/legal review gaps instead of inventing business details.
- Added canonical metadata, Open Graph and Twitter summary metadata, `sitemap.xml`, and `robots.txt`. The sitemap contains only public routes; account, workspace, settings, admin, API, and share routes are excluded from crawl directives. Protected layouts and share pages also carry `noindex` metadata.
- Added a keyboard skip link ahead of the repeated public header and verified it receives focus as the first tab stop.
- Added `NEXT_PUBLIC_SITE_URL` and optional `NEXT_PUBLIC_SUPPORT_EMAIL` settings to the sample environment, Compose web build/runtime configuration, and web image build. Public URLs default to the planned `https://app.hariinfo.xyz` origin.
- Kept the existing token-based visual design, semantic links/buttons, native keyboard-accessible FAQ disclosures, and the global focus-visible behavior.

## Audit findings

### Cookies, analytics, and browser storage

- Better Auth uses authentication cookies needed for sign-in and protected notebook access.
- The workspace stores pane layout preferences in local storage; the theme provider stores the selected theme in browser storage.
- A source-tree search found no analytics SDK, advertising pixel, or optional tracking tag. No cookie banner was added because the current implementation does not load optional tracking. Re-audit before adding any analytics, marketing tags, or third-party embeds.

### Data handling observed in the repository

- Account handling includes email/password authentication, verification/reset email callbacks, session controls, data export, and account deletion hooks.
- Notebook content includes uploaded files, extracted text, embeddings, chats, citations, notes, and generated artifacts. The app supports source/notebook deletion and read-only share links.
- The standard Compose deployment uses local file storage and a local EmbeddingGemma service. Chat and generation use the configured language-model provider; relevant excerpts and prompts can leave the host for that provider. Search, transcript, and email features can contact their configured external services.
- The default application repository has no payment flow, subscription product, or billing integration. A refund policy is therefore not published now. Add a reviewed refund/cancellation policy before enabling payments.
- Production backup, operational log, and external-provider retention periods have not been defined or verified. The privacy page identifies this limitation rather than promising deletion beyond what the application can control.

### Security controls reviewed

- Existing Next.js response headers include CSP, frame denial, MIME sniffing protection, referrer policy, and production HSTS. The current CSP still permits inline scripts; assess a nonce-based policy against the deployed Next.js rendering/auth flow before tightening it.
- Existing auth routes use Better Auth rate limits and secure cookies in production. Protected application routes check the session; the API uses JWT auth and ownership checks.
- Existing upload limits, SSRF-safe fetching, account deletion cleanup, and secret redaction in the internal SMTP route were reviewed at source level. This task did not rerun a complete authorization sweep, vulnerability scan, or penetration test.

### Jurisdiction and accessibility scope

- The operator's legal establishment, target markets, age groups, and user locations are not recorded, so the repository audit cannot determine which privacy, consumer, cookie, or accessibility laws apply. Do not infer legal applicability from the domain name or the developer's current location.
- If the operator is established in India or targets relevant users there, have counsel assess the Digital Personal Data Protection Act and the 2025 Rules, including their phased commencement dates. [MeitY Rules page](https://www.meity.gov.in/documents/act-and-policies/digital-personal-data-protection-rules-2025-gDOxUjMtQWa) · [Official Gazette](https://www.meity.gov.in/static/uploads/2025/11/53450e6e5dc0bfa85ebd78686cadad39.pdf).
- If the operator is established in the EU, or offers services to/monitors people in the EU, have counsel assess GDPR territorial scope under [Article 3](https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng). For UK users, assess UK GDPR and PECR. The ICO explains that consent is generally needed for nonessential device storage/access and describes exceptions for strictly necessary technologies: [ICO guidance](https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guide-to-pecr/cookies-and-similar-technologies/).
- US privacy and consumer-law applicability depends on the operator, users, data, and jurisdiction; no state or federal legal conclusion is made here. Have counsel assess the actual launch market.
- WCAG 2.2 AA is the project's engineering target. The added automated axe test passes on the landing route in both themes. This is not a full manual accessibility audit or a legal-compliance determination. [W3C WCAG 2.2](https://www.w3.org/TR/WCAG22/).

## Owner actions before public launch

1. Set `NEXT_PUBLIC_SUPPORT_EMAIL` to a real monitored address and rebuild the web image.
2. Add the operator's legal name, business/contact address where required, and the correct privacy-request workflow.
3. Identify the production hosting location, user jurisdictions, and model/search/transcript/email providers; have qualified counsel review applicable privacy, consumer, and disclosure requirements. These pages are drafts, not a compliance certification.
4. Define backup, log, and provider retention periods, then test account/source deletion and backup restore behavior against the production setup.
5. Review the inline-script CSP exception and complete a production security scan before handling public user data.
6. Re-audit browser storage and third-party requests if analytics or any new third-party embed is added.

## Verification record

- Web TypeScript check: `tsc --noEmit` — passed.
- Web unit tests: `vitest run` — 10 files, 25 tests passed.
- Web ESLint: passed with 0 errors. Two existing TanStack Virtual compiler-skip warnings remain in `pdf-original.tsx` and `source-viewer.tsx`.
- Web TypeScript check: `tsc --noEmit` — passed.
- Web unit tests: `vitest run` — 10 files, 25 tests passed.
- Web production build: `next build` — exited 0 and generated all public/legal, auth, and workspace routes. Better Auth emitted database-schema connectivity logs because the isolated build process had no database configuration; public static routes still built.
- Public Playwright checks against both the production standalone Next.js server and the rebuilt Compose web service at 1440px and 390px: 3 passed (landing routes, keyboard skip link, policy/contact navigation, mobile overflow, and axe WCAG A/AA across all five public pages in light and dark themes).
- `docker compose up -d --build web` — completed; `docker compose ps` showed all services healthy and `http://localhost:3000/` returned HTTP 200.
- `node scripts/design-audit.mjs` — passed; 85 source files checked.
- `docker compose config --quiet` and `git diff --check` — passed.
- Python suite: `uv run --frozen --all-packages pytest -q --cov=opennotebook_core.storage --cov=opennotebook_core.embeddings --cov=opennotebook_core.queue --cov-report=term-missing --cov-fail-under=80` — 130 passed, 2 skipped, 82.68% coverage.
- Python Ruff: `uv run --frozen --all-packages ruff check .` — passed.
- Python mypy: `uv run --frozen --all-packages mypy .` — failed on 5 findings in unmodified files: unresolved `run` import in `evals/real/test_run.py`, missing `psutil` stubs in `evals/real/benchmark_pdf.py`, duplicate local definitions in `evals/real/run.py`, and a `FakeArtifactLLM`/`SummaryLLM` assignment mismatch in `apps/worker/src/opennotebook_worker/main.py`.
- Corepack could not launch pnpm commands because its selected pnpm shim was missing. The installed app-local ESLint, TypeScript, Vitest, Next.js, and Playwright executables were used directly.
