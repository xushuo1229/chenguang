# Zeno Frontend Redesign Audit

> Phase 1 deliverable of the Zeno Enterprise AI Workspace brief (Linear × Notion × ChatGPT × Vercel).
> Read-only audit of `frontend-react/` + frontend-relevant backend contracts. No code changed.
- Date: 2026-10-05 · Baseline HEAD: `c3782b0` · Branch: `codex/growth-intelligence`

## 1. 当前架构

- React 18.3 + TypeScript 5.7 (strict) + Vite 6, alias `@ → src`, dev port 5174, `/api → :3000`.
- Router: react-router-dom 7 (v6-style object usage). Styling: Tailwind CSS v4 (CSS-first, no tailwind.config), class-strategy dark mode.
- UI: hand-built shadcn/new-york primitives on Radix (9 packages), lucide-react, cva; Framer Motion 11; Tremor 3 (charts); @xyflow/react 12 (knowledge graph); cmdk; sonner.
- Server state: TanStack Query 5 (staleTime 30s, retry 1, no focus refetch). No zustand; two React contexts (auth, theme/density).
- Transport: `services/apiClient.ts` — Bearer JWT, 15s AbortController timeout (Agent 60s), `{data}` envelope, `X-Renewed-Token` sliding renewal, one-shot 401 guard.
- Persistence: business data via `GET/PUT /api/data` single snapshot (`baseRevision` optimistic concurrency, 409 SYNC_CONFLICT). Course Knowledge lives in `/course-space*`.
- MSW only under `VITE_MOCK_ENABLED=true`; scenarios default/empty/loading/error. Default runtime = real API.
- Session isolation: `zeno_auth` + `zeno_device_id` only; legacy `cg_token`/`cg_user`/`chenguangData` untouched.
- Tests: Playwright `test:web` (13 core flows). No unit-test framework. Build: PASS. typecheck: PASS.

## 2. 当前页面

| Route | Page | Data | State UX | Key gap |
|---|---|---|---|---|
| `/login` | Login+Register | real auth | good | no password visibility/confirm; mobile brand mark empty |
| `/forgot-password` `/reset-password` `/verify-email` | AccountPages | real | good | reset success banner lost on login; no confirm password; no resend action |
| `/dashboard` | DashboardPage | snapshot + agent context | skeleton | classic 12-card dashboard; task table 3/4 column mismatch; dead tone prop; split-brain course import persistence |
| `/knowledge` | KnowledgePage | snapshot + `/course-space*` | per-tab | tabs not URL-addressable; hand-rolled drawer (no Esc/focus-trap); raw enums; paste-only docs; 30s poll cutoff; no bulk review |
| `/analytics` | AnalyticsPage | snapshot-derived | spinner only | duplicated metrics engine vs dashboard; weak heatmap; invalid custom range silent |
| `/agent` | AgentPage | `/personal-agent/*` | bubbles | see section 6 |
| `/settings` | SettingsPage | real | toasts | stacked cards; missing sections; density is a no-op |
| `/admin` | AdminPage | `/admin/users` | spinner | raw table, no sort/filter/pagination/empty state |
| `*` | NotFoundPage | — | — | rendered outside workspace shell |

## 3. 当前 Router

`app/App.tsx`: public AuthLayout routes (login/forgot/reset/verify); protected WorkspaceLayout routes dashboard/knowledge/analytics(lazy)/agent(fullBleed)/settings/admin; `/` redirects to dashboard. No Learning/Growth nesting, no Courses/Course-detail/Goals/Memory/Plans routes; Knowledge tabs and Agent threads are not URL-addressable.

## 4. 当前组件系统

- Primitives: button, input, badge, card, dialog, dropdown-menu, progress, skeleton, tooltip, state (Loading/Error/Empty); PageHeader shared.
- Installed but unwrapped/unused Radix: avatar, select, separator, switch, tabs. Missing textarea/checkbox/popover/drawer/avatar/select/tabs wrappers.
- Tokens (`styles/globals.css`, Tailwind v4 @theme): surface/ink 4-level/line/primary(#2563EB)/semantic colors; radius card 8 / control 6; Geist self-hosted; dark theme; Tremor vars mapped. Density compact vars exist but no component consumes them.
- App shell: `WorkspaceLayout` with inline header (h-14), fixed Sidebar 264/64, mobile drawer 280 + bottom 4-tab MobileNav. No dedicated Topbar/Breadcrumb; content max-w-1200.
- Command palette: cmdk dialog with nav/actions/Ask groups. `useCommandPalette` (Cmd+K) is never mounted — shortcut is dead UI.

## 5. 当前 UI 问题

1. Information architecture is feature-scattered, not Agent-first (Agent is one tab among four).
2. Dashboard/Analytics/Mastery read as KPI-card grids rather than a workspace: low density, no list/table primary view, no comparative data on tiles.
3. Inconsistent loading UX (dashboard skeleton vs spinners elsewhere); invisible context-query failures; empty states vary.
4. Dead/off-system code: `features/workspace/ContextPanel.tsx`, `components/ui/MetricTile.tsx`, `components/dashboard/StatCard.tsx`/`TrendChart.tsx`, `styles/tremor-safelist.ts`, `pages/archive/`.
5. Bugs: PageHeader `text-muted` (non-existent class); command Cmd+K dead; task table header mismatch; compact density no-op; mobile brand mark empty; reset-success banner missing.
6. Bundle: only Analytics lazy; Knowledge (xyflow) and Agent ship in main chunk; tremor 666 kB.
7. A11y debt: custom drawer lacks Esc/focus-trap/scroll-lock; raw enums; native controls off-token.
8. Two parallel metrics implementations (`dashboardMetrics.ts` vs `analytics/analyticsMetrics.ts`, different date-key strategies) — statistic drift risk.

## 6. 当前 Agent UI

- Two-pane (max-w-3xl chat + 320px AgentContextRail); rail collapses on mobile. Real `GET /personal-agent/context`, `POST /personal-agent/chat` (60s).
- Streaming is simulated (18ms/3-char typewriter; force-clears at 1500ms) — no SSE transport.
- Messages render plain whitespace-pre-wrap — no markdown (no lists/tables/code/links). Biggest ChatGPT-grade gap.
- Evidence/insight/action cards exist, but action proposals have no accept/execute control — the "AI suggestion → user confirm → write" loop is not wired (`POST /learning/actions/confirm` exists but unused).
- Conversation state is useState only: no persistence/list/titles/rename/regenerate/copy/stop; leaving `/agent` destroys the thread.
- Composer: auto-grow, Enter/Shift+Enter, mode switch, disabled attachment; IME composition bug (Enter to confirm candidate can submit); suggestions only fill input.
- Errors: fixed generic string, no retry/edit-resend; general-mode failover banner is good.

## 7. 当前 API 契约（前端相关，冻结不改）

- Auth: `POST /auth/register|login`, `GET/PUT /auth/me`, `POST /auth/forgot-password|reset-password|verify-email|resend-verification|logout-all`.
- Data: `GET/PUT /data` (`{data,revision,updatedAt,deviceId}`, 409 with `serverRevision/serverData`).
- Agent: `GET /personal-agent/context`, `POST /personal-agent/chat {message,mode,conversationId}` → `{answer,mode,evidence,insights,confidence,actions,metadata}` (JSON, no streaming). `GET /agent-home/context|insights|reasoning`, `POST /agent-home/learning-conversation`.
- Knowledge: `/course/import`; `/course-space` GET, `/search`, POST `documents|nodes|relations|evidence`; extraction `POST /jobs`, `GET /jobs[/:id]`, `POST /jobs/:id/cancel`, candidates GET, `/:id/evidence`, `/review|accept|reject`; `GET /knowledge-state/course/:courseId`; `GET /learning/review-queue/:courseId`; plus unused `/learning/planner`, `/learning/actions/confirm`, practice/assessment endpoints.
- Ops/Admin: `GET /health`, `POST /ops/client-errors`, `GET /ops/metrics` (admin), `GET /admin/users` (admin).
- No `/analytics`, `/goals`, `/courses` resource, or conversation-history endpoints — those views derive from snapshot; conversation history needs a local adapter (brief explicitly permits).

## 8. 可以复用的代码

- Token system + dark mode + Geist fonts (extend, do not replace); apiClient/session/device + MSW harness; auth/theme stores; QueryProvider setup.
- Services: all existing `services/*`; extraction-job polling; snapshot optimistic hook.
- Analytics domain logic (`features/analytics/*` is the strongest, guarded date parsing) — promote to shared metric module; knowledge feature logic (graph data, candidates, documents).
- Primitives: button/input/dialog/dropdown/tooltip/badge/card/progress/skeleton/state; sonner toasts; KpiCard shape; AgentContextRail data sections.
- Personal-agent context mapping (signals/next/memory/insights) feeds both Agent rail and Workspace.

## 9. 必须重构的代码

- App Shell: Sidebar IA (Agent-first + Learning/Growth groups, 240/68), Topbar (56px, breadcrumb/search/actions/user), global overlays (command menu mounted, drawers, toasts), nested routes.
- Agent: three-pane workspace (history rail / conversation / context), markdown+code renderer, conversation local adapter + URL-addressable thread, composer IME fix, retry/copy/stop, thinking checklist, executable action cards.
- Dashboard: rebuild Workspace around "What should I do next?" (today plan timeline, focus, recent activity, one Zeno recommendation) instead of KPI grid.
- New pages: Courses table, Course detail (tabs), Plans, Goals, Growth Memory; Settings with section nav; Admin DataTable; Knowledge restyle + URL tabs.
- Shared metrics module (unify dashboard/analytics); route-level lazy loading for agent/knowledge/tremor; skeletons for every async page; wire density tokens into controls.

## 10. 删除风险

- Never delete: legacy MPA, `services/*`, MSW harness, archive pages (history assets; stay excluded from build).
- Safe removals (only after references confirmed gone): `ContextPanel.tsx`, `MetricTile.tsx`, dashboard `StatCard/TrendChart`, `tremor-safelist.ts`.
- Route risk: old paths (`/dashboard`, `/knowledge`) must redirect to new equivalents (`/workspace`, `/learning/knowledge`) — bookmarks and Playwright tests depend on them; tests updated in the same commit as routes.
- Data risk: none — redesign is read/derive plus existing write endpoints; snapshot PUT contract untouched. No new business localStorage keys beyond React-UI-only `zeno_*` keys (auth/device/theme/conversations).

## 11. 推荐的新架构

### Information Architecture

```
/login (public)
AppShell
├── /agent[/:conversationId]        Agent (default landing)
├── /workspace                      today-focused workspace
├── /learning/courses               Courses table
├── /learning/courses/:id           Course detail (overview/knowledge/progress)
├── /learning/plans                 Plans (honest coming-soon state if no data)
├── /learning/knowledge             Knowledge (tabs in URL: graph|mastery|documents|review)
├── /growth/goals                   Goals (snapshot-derived)
├── /growth/analytics               Analytics (shared metrics)
├── /growth/memory                  Growth Memory (personal-agent memories/insights)
└── /settings(/:section)            profile/appearance/notifications/agent/data/security
Legacy redirects: /dashboard -> /workspace, /knowledge -> /learning/knowledge
```

### Frontend structure (additive, evolved in place)

```
src/
  app/                 routes (nested), providers, ProtectedRoute
  layouts/             AppShell (Sidebar+Topbar+Outlet+Overlays), AuthLayout
  components/ui/       primitives (+textarea, select, tabs, switch, avatar, separator, popover, drawer, DataTable)
  components/shell/    Sidebar, Topbar, Breadcrumb, UserMenu, MobileDrawer, BottomNav
  components/command/  mounted global CommandProvider (Cmd+K) with entity search
  features/
    agent/             agentShell, ConversationRail, ConversationView, Composer,
                       MarkdownMessage, ActionCard, ThinkingChecklist, context providers
    workspace/         TodayPlan timeline, FocusStrip, RecentActivity, ZenoRecommendation
    learning/          courses/CourseTable, CourseDetail, plans, knowledge (moved)
    growth/            goals, analytics (promoted shared metrics), memory
    settings/          sections
    snapshot/          useSnapshot (unchanged)
  services/            unchanged API layer + conversationLocalAdapter
  hooks/               useDensity, usePageTitle, useBreakpoint
  lib/  styles/  types/
```

### Rules

- UI → hook → service only; no mock data inside components; MSW remains the sole fake switch.
- Streaming-ready: AgentProvider interface with `sendMessage(): AsyncIterable<Chunk>`; current RealJsonAgentProvider yields one chunk + progressive reveal; an SSE provider drops in later without UI change (documented as protocol-deferred).
- Conversations persist via `services/conversationLocalAdapter` key `zeno_conversations` (React-UI-only, clearly local; server sync is a future API proposal).
- Every async page: skeleton, empty (with real CTA), error (with retry), never white-screen; every action real/disabled/coming-soon.
- All pages lazy; tremor/xyflow stay in their own chunks.

### Execution & verification

Phases 2–15 per brief: tokens → primitives → shell → agent → workspace → learning → growth → settings → responsive → states → browser QA (1440x900 / 1280x800 / 390x844) → typecheck/build/test:web → docs → commits.
Gate per phase: typecheck + build; final: backend tests untouched + Playwright test:web updated to new routes and green; 0 console errors.
