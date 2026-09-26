# Phase 39 React Frontend Migration Architecture

## 1. Migration Decision

The user explicitly authorized a React + TypeScript architecture migration. The migration is additive and creates a parallel frontend in `frontend-react/`. The legacy MPA, CGStore, Analytics, backend APIs, JWT authentication, database schema, and Agent data logic remain frozen.

## 2. Current Architecture Audit

### Directory structure

- Root MPA: `index.html`, `login.html`, `workbench.html`, `ai.html`, `goals.html`, `stats.html`, `today.html`.
- Legacy logic: `js/store.js`, `js/analytics.js`, `js/goals.js`, `js/sync.js`, `js/aiContext.js`, `pages/*.js`.
- Backend: Express + SQLite + JWT under `backend/src`.
- Existing Agent APIs are under `/api/personal-agent`, `/api/agent-home`, and `/api/learning`.

### Frontend API dependencies

```text
POST /api/auth/register
POST /api/auth/login
GET  /api/auth/me
PUT  /api/auth/me
GET  /api/data
PUT  /api/data
GET  /api/agent-home/context
GET  /api/agent-home/insights
GET  /api/agent-home/reasoning
POST /api/agent-home/learning-conversation
GET  /api/personal-agent/context
POST /api/personal-agent/chat
GET  /api/learning/agent/:courseId/overview
POST /api/learning/agent/:courseId/next-action
GET  /api/knowledge-state/course/:courseId
```

### Authentication flow

1. The legacy frontend sends email/password to `/api/auth/login`.
2. The backend verifies bcrypt credentials and returns a JWT.
3. The JWT is stored in `cg_token`; the account user is cached in `cg_user`.
4. Subsequent requests use `Authorization: Bearer <token>`.
5. Tokens may be renewed with `X-Renewed-Token`.
6. Protected API routes resolve user identity server-side from `req.userId`.

The React client preserves the same token keys and Bearer authentication contract.

### Reusable backend capabilities

- Authentication and user profile.
- Sync snapshot API as the CGStore-compatible source.
- Agent Home deterministic context, insights, and reasoning.
- Personal Agent selected-context projection and dual-mode conversation.
- Learning Agent overview, action confirmation, assessment, practice, review, and knowledge state.

## 3. New React Architecture

```text
frontend-react/
  src/
    app/
    routes/
    layouts/
    components/
      Agent/
      Cards/
      Dashboard/
      Layout/
      UI/
    features/
      agent/
      dashboard/
      profile/
      analytics/
    hooks/
    services/
    stores/
    styles/
```

Technology stack:

- React 18
- TypeScript
- Vite
- React Router
- TanStack Query
- Tailwind CSS v4
- shadcn-style local UI primitives
- Framer Motion
- lucide-react

## 4. Boundaries

The React app must not implement a second business data store. Sync and user data are fetched from the existing backend. Agent context remains read-only. AI suggestions and action proposals require explicit user confirmation and existing write APIs.

## 5. Implementation Phases

1. Phase 39.1: React workspace foundation, token auth, Landing, Workspace Layout.
2. Phase 39.2: Agent conversation workspace with selected-context cards and streaming presentation.
3. Phase 39.3: Dashboard and analytics projections from existing APIs.
4. Phase 39.4: Profile, memory, goals, and learning traits.
5. Phase 39.5: Build, browser validation, accessibility, and freeze audit.
