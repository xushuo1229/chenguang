# Deployment Audit

> Audit date: 2026-09-13  
> Baseline: `c8f14d2`  
> Scope: production deployment readiness only. No feature development is allowed in Phase DR-1.

## Executive summary

The MVP application is feature-complete, but the deployment path is not production-ready. The frontend still points to a local backend by default, CI points to a nonexistent backend directory, the production build does not ship the Service Worker or manifest, Docker may include local secrets/database files, and the public schedule-import proxy lacks private-network request protections.

No product behavior changes are planned in this phase. Fixes are limited to deployment configuration, runtime configuration, PWA build output, Docker hardening, documentation, and security controls for the existing import feature.

## Findings and risk levels

| # | Area | Finding | Risk | Impact |
|---|---|---|---|---|
| 1 | Frontend API | `js/apiClient.js` and `js/sync.js` independently hard-code `http://localhost:3000/api`. HTML `meta[name="api-base"]` is present on some pages but is not read by the runtime. | P0 | In production the browser tries to call localhost, so authentication and synchronization fail. |
| 2 | PWA | Vite copies only `assets/`; the root `service-worker.js` is not copied into `dist/`, and no `manifest.json` is emitted. The Service Worker also hard-codes source paths such as `/js/store.js`, while Vite emits hashed bundle paths. | P1 | Installed/offline behavior is broken in production builds. |
| 3 | CI/CD | `.github/workflows/deploy.yml` uses `server/` for backend install and deploy, but the actual directory is `backend/`. There is no explicit frontend test, backend test, and build gate before deployment. | P1 | Deployment either fails or can bypass local quality gates. |
| 4 | Docker | `backend/Dockerfile` uses `COPY . .` and has no `.dockerignore`. It runs as root, has no health check, and does not define a persistent data directory. | P1 | Local `.env`, SQLite database/WAL files, and tests can enter the image; root execution and data loss increase deployment risk. |
| 5 | Database deployment | Runtime uses SQLite, but `backend/render.yaml` provisions PostgreSQL and injects `DATABASE_URL`; the application does not consume that value. | P1 | Deployment configuration and source of truth disagree. A container without a persistent disk can lose user data. |
| 6 | Schedule import SSRF | The import proxy validates protocol and URL length but does not block localhost, private IPv4/IPv6, link-local, metadata, or internal domains. It also uses `redirect: follow`, so redirect targets are not revalidated. | P1 | An authenticated user can make the server contact internal services. |
| 7 | Frontend security | JWT remains in `localStorage`; there is no refresh/revocation/account lifecycle flow in MVP. | P2 | XSS would have a larger blast radius. This is a pre-existing MVP tradeoff and is not expanded by this phase. |
| 8 | Sync scalability | Rate limiting is in-memory and SQLite has a single writer. | P2 | The current single-node deployment model is acceptable, but horizontal scaling is not. |
| 9 | Observability | Logging is local console output only; no centralized error tracking or deployment health alerting exists. | P2 | Production failures may be difficult to diagnose. |

## Required fix order

1. **API Base unification** — create one production/dev resolution path, honor `meta[name="api-base"]`, and add a production artifact check for `localhost:3000`.
2. **PWA production pipeline** — emit `manifest.json` and `service-worker.js` into `dist/`, generate the Service Worker list from real build assets, and retain network-first/runtime caching behavior.
3. **CI/CD gate repair** — correct backend paths and enforce install, frontend tests, backend tests, build, and deployment order.
4. **Docker hardening** — exclude secrets and local databases, run as non-root, inject configuration by environment variables, and add a health check.
5. **Database deployment strategy** — keep SQLite for MVP, document persistent-disk requirements and the future PostgreSQL migration path.
6. **SSRF hardening** — validate every initial and redirect URL, resolve DNS, reject private/internal destinations, and limit redirects.
7. **Security scan, regression, build, review, and commit** — no commit is allowed until tests, security review, code review, regression, and build pass.

## Non-goals

- No new product features.
- No frontend framework migration.
- No database migration in DR-1.
- No change to the existing single-snapshot data model.
- No push to a remote branch.

## Exit criteria

- Production bundle contains no `localhost:3000` API URL.
- `dist/manifest.json` and `dist/service-worker.js` exist.
- CI cannot deploy if frontend tests, backend tests, or build fail.
- Docker context excludes local secrets and databases.
- Schedule import rejects private/internal destinations and rechecks redirect targets.
- Full test, security review, code review, regression, and build results are recorded in `docs/PHASE_DR1_REPORT.md`.
