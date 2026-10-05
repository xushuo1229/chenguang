# Zeno Frontend Redesign — Baseline

> Phase 1 of the Zeno Enterprise AI Workspace redesign brief.
> Recorded before any redesign code is written. Additive-first; legacy MPA untouched.

## Git

- Date: 2026-10-05 (Asia/Shanghai)
- Branch: `codex/growth-intelligence`
- Current HEAD: `c3782b018a3b5c288477cb32338ef0218ac32a81`
- Working tree: clean except untracked historical `docs/screenshots/` (left untouched).

## Build Status (verified at baseline)

- `npm run typecheck` (frontend-react): PASS
- `npm run build` (frontend-react): PASS (8.6s; warnings: tremor chunk 666 kB > 500 kB limit)
- Backend tests at prior verification: 326 pass / 0 fail (backend suite unchanged by this redesign)

## Runtime Baseline

- Backend: `backend/` Express on :3000 (frozen — no API/DB/protocol changes in scope).
- New frontend: `frontend-react/` Vite dev server on :5174, `/api` proxied to :3000.
- Legacy MPA: production frontend, must remain stable and untouched.
- React session key: `zeno_auth` only; legacy `cg_token` / `cg_user` / `chenguangData` are off-limits.
- Mock mode: `VITE_MOCK_ENABLED=true` only; default is real API.

## Redesign Constraints

1. No backend / API / DB / sync-protocol / data-protocol changes.
2. No legacy MPA changes.
3. Additive first: build new shell/routes/components alongside existing pages; replace progressively; old paths redirect, never 404.
4. No fake interactions: every control is real, disabled with tooltip, or explicitly "coming soon".
5. One focused commit per phase; no auto-push.
