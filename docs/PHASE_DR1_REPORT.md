# Phase DR-1 Report

> Phase: Deployment Readiness Hardening  
> Baseline: `c8f14d2`  
> Completion date: 2026-09-13  
> Scope: production deployment hardening only. No product features were added.

## Result

**PASS — Deployment Readiness Hardening complete.**

Frontend tests, backend tests, production build, security scan, code review, and regression all passed. No P0 or P1 code findings remain. The remaining operational risks are documented below.

## Modified files

### API Base

- `js/config/apiBase.js` — added the single source of truth for API base resolution.
- `js/apiClient.js` — now consumes the shared API base module.
- `js/sync.js` — now consumes the same API base module.
- `index.html` / `login.html` — removed hardcoded localhost meta values.
- `tests/apiBase.test.js` — added production, development, HTML meta, invalid meta, normalization, and ownership tests.

### PWA

- `manifest.json` — added installable web app manifest.
- `vite.config.js` — emits the manifest and generates the Service Worker from real build artifacts.
- `service-worker.js` — now receives its precache list from the production build instead of hard-coding source paths.
- All application pages — receive a build-injected `/manifest.json` link.
- `tests/deployment.build.test.js` — added production artifact tests for manifest, Service Worker, hashed assets, no source-path cache entries, no localhost, and manifest links.

### CI/CD

- `.github/workflows/deploy.yml` — rebuilt the pipeline as install → frontend tests → backend tests → build → deploy.
- Frontend and backend deployments are blocked when any quality-gate step fails.
- Backend deployment now targets Render and requires the `RENDER_DEPLOY_HOOK_URL` secret.

### Docker

- `backend/.dockerignore` — excludes `.env`, SQLite database/WAL/SHM files, Node modules, logs, and tests.
- `backend/Dockerfile` — runs as non-root, injects environment configuration, defines a persistent `/app/data` volume, and adds a container health check.

### Database deployment

- `backend/render.yaml` — changed from PostgreSQL to SQLite on one Render instance with a persistent disk.
- `docs/DATABASE_DEPLOYMENT.md` — documented the MVP SQLite strategy, backup requirements, and future PostgreSQL migration plan.

### SSRF hardening

- `backend/src/services/scheduleImportService.js` — now rejects internal hostnames, localhost, private IPv4/IPv6, IPv4-mapped IPv6, link-local, metadata, and reserved addresses.
- DNS is resolved before requests, and every redirect target is revalidated.
- Redirect following was replaced with bounded manual redirect handling.
- `backend/test/scheduleImport.test.js` — added SSRF tests for localhost, internal domains, private IPv4/IPv6, mapped IPv6, public literal IPv4, and redirect revalidation.

### Documentation and test hygiene

- `docs/DEPLOYMENT_AUDIT.md` — deployment audit, risks, and fix order.
- `tests/goals.page.test.js` — flushed pending storage writes before each case to prevent cross-test timer pollution.

## Validation results

| Check | Result |
|---|---|
| Frontend tests | **PASS — 286/286 tests, 15 files** |
| Backend tests | **PASS — 58/58 tests, 19 suites** |
| Production build | **PASS** |
| Build artifact check | **PASS — `dist/manifest.json` and `dist/service-worker.js` emitted** |
| Production artifact scan | **PASS — no `localhost`, API key, JWT secret, password hash, bearer token, or OpenAI-style key patterns found** |
| Git secret scan | **PASS — no real `.env` or database files tracked; only `backend/.env.example` is tracked** |
| Code review | **PASS — no P0/P1 findings** |
| Security review | **PASS — no P0/P1 findings** |

## Security review summary

### Addressed

- Production frontend no longer contains `localhost`.
- The production API base defaults to same-origin `/api`.
- HTML `meta[name="api-base"]` can override the default for custom deployments.
- Docker no longer includes local secrets or SQLite files by default.
- Docker runs as the non-root `node` user and exposes a health check.
- Schedule import now rejects private/internal destinations and rechecks redirects.
- The production bundle contains no backend secrets or password hashes.

### Security scan detail

- Git tracked sensitive-file scan found only `backend/.env.example`.
- Git ignored sensitive files include `backend/.env`, `backend/chenguang.db`, `backend/chenguang.db-shm`, and `backend/chenguang.db-wal`.
- Frontend source and production bundle scans found no API keys, JWT secrets, password hashes, OpenAI-style keys, or bearer tokens.
- Docker daemon was not running on the review machine, so a live Docker image build was not executed. The Docker context exclusion was verified through `backend/.dockerignore` and Git ignore status.

## Code review summary

No P0 or P1 findings remain.

The review confirmed:

- `js/apiClient.js` and `js/sync.js` no longer own separate API base logic.
- Production artifact Service Worker paths come from actual Vite output.
- CI has explicit quality gates before deployment.
- SQLite deployment and runtime configuration no longer disagree.
- SSRF validation covers the initial URL and redirect targets.

## Remaining risks

These are accepted non-blocking risks and are not new feature work:

1. **Same-origin proxy requirement**  
   Production defaults to `/api`, so the deployment must expose the frontend and backend on the same origin or place `/api` behind a reverse proxy.

2. **Render secret required**  
   CI backend deployment requires `RENDER_DEPLOY_HOOK_URL`. If the secret is absent, the backend deployment job will fail safely.

3. **Docker image build not executed locally**  
   Docker daemon was unavailable. Static Docker context hardening and tests passed, but a live image build should be run in CI or on a Docker-enabled host.

4. **SQLite remains single-node**  
   The application must run as one backend instance on one persistent disk. Horizontal scaling still requires PostgreSQL.

5. **JWT remains localStorage-based**  
   This is the existing MVP tradeoff. A future hardening phase should consider HttpOnly refresh/session cookies, token revocation, password reset, and account deletion.

6. **Rate limiting remains in-memory**  
   This is acceptable for the single-node SQLite deployment, but a shared Redis store is required for multi-instance deployment.

7. **Observability is minimal**  
   Centralized error tracking, deployment alerts, backup alerts, and disk-capacity monitoring are still recommended before broader public rollout.
