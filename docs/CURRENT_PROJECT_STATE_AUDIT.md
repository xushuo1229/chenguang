# Current Project State Audit

## 1. Executive Summary

The committed product baseline is substantially stronger than “a chat app”: it has a unified local data layer, versioned sync, Analytics as the canonical computation layer, Goals, Growth Intelligence, Memory, Daily Reflection, and Reflection feedback. Phase 23.2.3 is committed and verified by tests and build.

However, the current working tree is not a clean frozen state. It contains a large unnamed body of in-progress growth/retention/habit/memory work: 31 modified files, 46 untracked paths, and an effective non-whitespace diff of 17 files with 1,138 insertions and 103 deletions. Frontend tests currently fail because 2 assertions in the untracked `tests/workbenchDailyFeedback.test.js` do not match current Workbench behavior.

For entering full Personal Learning Agent development, the project is **not ready**. The main missing layers are a Course Knowledge model, retrieval/evidence infrastructure, server-owned learning state, planning, and a safe action layer. The current system is best classified as an early Level 3 Personal AI Coach, not a Level 4 Learning Agent.

## 2. Current Git State

- Branch: `codex/growth-intelligence`
- HEAD: `e74fdc2 feat: add ai reflection feedback loop`
- Recent committed sequence:
  - `e74fdc2` — Reflection feedback loop
  - `d1d9cc4` — Reflection frontend integration
  - `50b80ec` — Reflection hardening
  - `227665a` — Reflection backend capability
  - `9c49ec8` — AI GrowthContext layer
  - `863e163` — Today Plan workspace
  - `8306a35` — MPA first-frame stabilization
- Working tree:
  - 31 modified paths.
  - 46 untracked paths.
  - Two temporary media directories: `tmp-video-frames/` and `tmp-video-seq/`.
- With CRLF ignored, the effective tracked diff is 17 files, 1,138 insertions, 103 deletions.
- Frozen-file diffs (`js/growthContext.js`, `pages/today.js`, `today.html`) are line-ending only; no semantic frozen-file change was found.

Conclusion: the committed baseline is coherent, but the working tree represents an unfinished phase and must be stabilized before starting another development phase.

## 3. Phase Timeline

| Phase | Goal | Main Commit / Evidence | Key Files | Tests | Status |
| --- | --- | --- | --- | --- | --- |
| 8 | Versioned local/remote data consistency | `1ffccb5` | `js/store.js`, `js/sync.js`, `backend/src/services/syncService.js` | Store/Sync/recovery tests | COMPLETE |
| 9 | Course System 2.0 | `35afd14` | `js/courseSchedule.js`, `pages/workbench.js`, `js/scheduleTextParser.js` | Schedule/parser tests | COMPLETE for schedule + progress; PARTIAL for learning knowledge |
| 10 | Unified Analytics | `ce138f5` | `js/analytics.js` | `tests/analytics.test.js` | COMPLETE |
| 11 | Stats Center | `8acd50e` | `pages/stats.js`, `stats.html` | `tests/stats.test.js` | COMPLETE |
| 12 | Goals System | `155d414` | `js/goals.js`, `pages/goals.js` | `tests/goals.test.js` | COMPLETE |
| 13 | AI Coach / AI Context | `9a21b3d`, later `7d0ca5d` | `js/aiContext.js`, backend AI service | AI context/backend tests | COMPLETE as context-aware assistant/coach foundation |
| 14–18 | Goal loop, mobile/UX hardening, release audits | Relevant commits/docs through `a34b8a8` | UI, navigation, architecture tests | Existing regression tests | COMPLETE / historical |
| 19–20 | Growth Intelligence, reports, long-term memory | `30d7e51`, `24a67a0`, `232ad82` | `js/growthIntelligence.js`, `js/growthReport.js`, `js/growthMemory.js` | Growth/report/memory tests | COMPLETE in committed baseline |
| 20.7–21 | Retention, signals, timeline | Untracked docs/modules | `js/growthSignals.js`, `js/growthTimeline.js`, `js/retentionContext.js` | Untracked tests | IN PROGRESS |
| 22 | Habit Formation and freeze | Untracked docs/module | `js/habitFormation.js` | Untracked `tests/habitFormation.test.js` | IN PROGRESS; DOCUMENTED ≠ VERIFIED at Git level |
| 23 / 23.1 | GrowthContext + Today Plan | `9c49ec8`, `863e163` | `js/growthContext.js`, `today.html`, `pages/today.js` | Today/GrowthContext tests | COMPLETE |
| 23.2 | Daily Reflection backend/frontend | `227665a`, `50b80ec`, `d1d9cc4` | Reflection service/UI/API | Reflection/security/UI tests | COMPLETE |
| 23.2.3 | Reflection feedback loop | `e74fdc2` | Reflection feedback API/UI | 5 backend feedback tests, 6 frontend tests | COMPLETE |
| Current unnamed work | Daily Feedback, Memory candidates, Habit/Retention integration | Uncommitted | `pages/workbench.js`, `pages/stats.js`, `pages/ai.js`, untracked growth modules | 578/580 frontend pass | IN PROGRESS |

## 4. Phase 8 Audit

The Phase 8 sync contract remains structurally sound.

- `CGStore` uses a single business key `chenguangData` and `_meta.revision`, `updatedAt`, `deviceId`, and tombstones (`js/store.js:43`, `js/store.js:180`, `js/store.js:196`).
- Local writes bump revision exactly once; remote application does not bump and is marked as remote (`js/store.js:196`, `js/store.js:224`, `js/store.js:239`).
- Sync sends `Authorization`, CSRF-safe `X-Requested-With`, ETag for GET, and an abort timeout (`js/sync.js:195`).
- Push uses `baseRevision`; conflict handling merges over the server state and retries (`js/sync.js:523`, `js/sync.js:600`, `js/sync.js:645`).
- Login sync explicitly avoids pushing stale local data before pulling (`js/sync.js:758`).
- Backend persists a user-isolated snapshot with optimistic revision checks (`backend/schema.sql:24`, `backend/src/services/syncService.js:96`, `backend/src/services/syncService.js:141`).

Known boundary: revision is an operation counter, not a content fingerprint. The code itself documents that two divergent offline devices can both pass operation-count comparison in an edge case (`backend/src/services/syncService.js:141`). This is an accepted tradeoff, not a current regression.

Phase 8 verdict: **stable for current product behavior**, with a documented edge case and a separate legacy CoachMemory storage concern noted under technical debt.

## 5. Phase 9 Course System Audit

Current Course System 2.0 is complete as a course/schedule/progress system.

- `CourseSchedule` normalizes course, slot, weekday, periods, weeks, teacher, classroom, credits, and legacy fields (`js/courseSchedule.js:17`, `js/courseSchedule.js:79`, `js/courseSchedule.js:101`).
- It derives today/weekly instances from course definitions and semester week (`js/courseSchedule.js:182`, `js/courseSchedule.js:202`, `js/courseSchedule.js:219`).
- Import matching supports new, attach, merge, duplicate, and skip flows without silently overwriting progress (`js/courseSchedule.js:288`, `js/courseSchedule.js:342`).
- Course CRUD and aggregate progress go through `CGStore` (`js/store.js:1080`, `js/store.js:1104`).
- Workbench provides add/edit/delete/detail/schedule views (`pages/workbench.js:121`, `pages/workbench.js:213`, `pages/workbench.js:342`, `pages/workbench.js:999`).
- Stats and AI use Analytics-derived course summaries (`pages/stats.js:167`, `pages/index.js:325`, `js/aiDataRetrieval.js:90`).

However, the model contains course identity and coarse progress, not learning knowledge. It has `totalChapters` / `learnedChapters`, but no first-class modules, chapters, sections, materials, sources, prerequisites, mastery state, or content relationships. A knowledge layer would require additive entities and stable course IDs/content IDs, but must not be invented by prompt or AI.

Phase 9 verdict: **COMPLETE as Course System 2.0; PARTIAL as a foundation for Course Knowledge Base.**

## 6. Phase 10 Analytics Audit

Analytics remains the canonical truth source.

- Its contract explicitly requires read-only, deterministic, side-effect-free computation over a CGStore snapshot (`js/analytics.js:1`, `js/analytics.js:10`).
- It exposes daily, weekly, monthly, custom-range, trend, streak, distribution, heatmap, study, exercise, focus, todo, personal-best, and course summaries (`js/analytics.js:365` through `js/analytics.js:741`).
- Stats uses `Analytics.snapshot()` and calls Analytics for every domain (`pages/stats.js:21`, `pages/stats.js:98`, `pages/stats.js:131`).
- Index, Workbench, AI, Goals, and Growth layers delegate to Analytics (`pages/index.js:306`, `pages/workbench.js:557`, `pages/ai.js:94`, `js/goals.js:277`, `js/growthContext.js:48`).

Minor debt exists: `CGStore` has convenience aggregates such as `courseAvgProgress()` and reading/focus totals (`js/store.js:1099`, `js/store.js:1167`). These are mostly display conveniences, but the rule should be tightened before Agent development so no new consumer derives analytics outside Analytics.

Analytics verdict: **architecture stable**.

## 7. Phase 11 Stats Audit

Stats Center is real and integrated.

- Today / week / month / custom ranges are built from Analytics ranges (`pages/stats.js:98`, `pages/stats.js:101`).
- Overview, learning, exercise, focus, todo, course, trend, heatmap, personal best, report, and memory views are present (`pages/stats.js:257` through `pages/stats.js:741`).
- Heatmap uses a 365-day window and Analytics activity maps (`pages/stats.js:557`).
- Personal best uses `Analytics.getPersonalBest` (`pages/stats.js:741`, `js/analytics.js:700`).

Stats verdict: **COMPLETE**.

## 8. Phase 12 Goals Audit

Goals is a stable user-intent layer.

- Goal Engine is documented as a pure derivation layer and does not write Store or recalculate core metrics itself (`js/goals.js:1`, `js/goals.js:17`).
- Goal definitions are persisted inside CGStore and synchronized (`js/store.js:84`, `js/store.js:96`).
- Goal ranges and metrics delegate to Analytics (`js/goals.js:137`, `js/goals.js:277`, `js/goals.js:286`).
- It validates goals, derives progress/status, and classifies active/completed/expired goals (`js/goals.js:91`, `js/goals.js:209`, `js/goals.js:360`).

Goals verdict: **stable user intent layer**.

## 9. Phase 13 AI Coach Audit

Current AI is a **context-aware AI Coach / AI Assistant**, not an Agent.

Actual chat chain:

```text
CGStore
  → Analytics
  → GoalEngine
  → GrowthIntelligence / Memory / Report / DailyFeedback
  → AIContext.buildContext()
  → CGAPI.ai.chat
  → POST /api/ai/chat
  → aiService.coachChat()
  → promptBuilder + Provider
  → deterministic suggestions/actions + model reply
```

Evidence:

- AIContext aggregates Analytics, GoalEngine, GrowthIntelligence, Memory, Reports, DailyFeedback, Retrieval, and ToolRunner (`js/aiContext.js:29`, `js/aiContext.js:157`, `js/aiContext.js:271`).
- Context is versioned and budget-trimmed to about 6,000 estimated tokens (`js/aiContext.js:47`, `js/aiContext.js:54`, `js/aiContext.js:512`).
- Backend validates roles, history, context version, and size; strips forbidden keys; and places system before context/history/user (`backend/src/services/aiService.js:33`, `backend/src/services/aiService.js:135`, `backend/src/services/aiService.js:178`, `backend/src/services/aiService.js:204`).
- Suggestions and actions are deterministically derived from insights; only navigation actions are allowed (`backend/src/services/promptBuilder.js:104`, `backend/src/services/promptBuilder.js:124`).
- Retrieval and tool orchestration are read-only, current-user-only, and bounded (`js/aiContext.js:630`, `js/aiDataRetrieval.js:9`).

It is not an Agent because there is no autonomous multi-step planning, no Course Knowledge retrieval, no verified learning-state model, and no safe tool-execution loop beyond controlled read-only retrieval/navigation proposals.

## 10. Memory / Growth Intelligence Audit

The system already knows and can infer the following user facts/signals:

| Knowledge Domain | Current State |
| --- | --- |
| Todos | Today/week totals, completion, overdue, backlog |
| Focus | Minutes, active days, averages, trends |
| English | Minutes, words, trends |
| Reading | Entries, pages, finished books, trends |
| Exercise | Count, minutes, calories, trends |
| Check-ins | Daily records and streaks |
| Courses | Count, average progress, status, schedule |
| Goals | Active/completed/expired, percentage, risk, remaining days |
| Trends | 7/14/30/90-day windows, important changes, volatility |
| Habits | Untracked `habitFormation.js` computes frequency, consistency, continuity, current/max streak, status, reason, evidence |
| Long-term memory | GrowthMemory patterns, milestones, preferences, insights, candidates, confidence, lifecycle, relations |
| Reflection feedback | Binary helpful / not_helpful with ownership only |

Memory has two distinct layers today:

1. `GrowthMemory` is derived and confirmed into `user.memory` through CGStore (`js/growthMemory.js:755`, `js/growthMemory.js:763`).
2. `CoachMemory` uses a separate `cg_ai_coach_memory_v1` localStorage key and maintains recommendations/outcomes (`js/coachMemory.js:4`, `js/coachMemory.js:28`, `js/coachMemory.js:41`).

This creates useful short-term/confirmed separation, but also creates a second user-specific memory storage path that should be reconciled before Agent development.

## 11. Phase 22 Habit Formation Audit

The untracked `js/habitFormation.js` implements a stable-looking habit contract.

- It returns `habitScore`, `frequency`, `consistency`, `maxConsecutive`, `currentConsecutive`, `activeDays`, `windowDays`, `status`, `reason`, and evidence (`js/habitFormation.js:127`).
- It supports `minFrequency`, rejects invalid/future/duplicate observations, and derives stages from 7/14-day thresholds (`js/habitFormation.js:90`, `js/habitFormation.js:183`).
- It has substantial untracked tests in `tests/habitFormation.test.js`, and they pass.

Phase 22 verdict: **functionally promising, but IN PROGRESS at Git level because code/tests/docs are uncommitted**.

## 12. Phase 23 Audit

Phase 23.1 correctly introduces a derived GrowthContext layer.

- It builds task summary, focus/study/exercise summary, streaks, goal risk, signals, and suggestions from Analytics and GoalEngine (`js/growthContext.js:39`, `js/growthContext.js:48`, `js/growthContext.js:63`, `js/growthContext.js:123`).
- It is read-only and does not create a new data type (`js/growthContext.js:8`).

Phase 23.2 adds Daily Reflection.

- Backend reflection uses a fixed prompt schema and deterministic `performance` values from GrowthContext (`backend/src/services/aiService.js:54`, `backend/src/services/aiService.js:252`).
- Reflection output is normalized, bounded, and forced to a JSON shape (`backend/src/services/aiService.js:97`, `backend/src/services/aiService.js:274`).
- Reflection context is allowlisted, bounded, and prompt-injection-isolated (`backend/src/services/reflectionContext.js:54`, `backend/src/services/promptBuilder.js:143`).
- Reflection UI handles idle/loading/success/error/empty states (`js/aiReflectionUI.js`).

Phase 23 verdict: **committed and verified through Phase 23.2.3**.

## 13. Phase 23.2 Audit

Reflection is a read-only explanation and suggestion layer, not a business-data writer.

- Reflection route requires auth and rate limiting (`backend/src/routes/ai.js:30`).
- Reflection returns an additive `reflectionId` without changing the old reflection shape (`backend/src/routes/ai.js:33`).
- Reflection generation is recorded for authenticated users (`backend/src/routes/ai.js:37`).
- Reflection content is not persisted; only ownership and feedback are persisted (`backend/schema.sql:34`, `backend/schema.sql:41`).

Phase 23.2 verdict: **COMPLETE for current scope**.

## 14. Reflection Feedback Loop Audit

The feedback loop is real but minimal.

- API supports only `helpful` and `not_helpful` (`backend/src/services/aiReflectionFeedbackService.js:7`, `backend/src/services/aiReflectionFeedbackService.js:39`).
- Ownership is validated from `req.userId`; cross-user feedback returns `403 REFLECTION_FORBIDDEN` (`backend/src/services/aiReflectionFeedbackService.js:50`).
- Duplicate feedback is idempotent (`backend/src/services/aiReflectionFeedbackService.js:65`).
- Frontend API calls go through the shared client (`js/apiClient.js:474`).
- UI supports loading, success, and friendly error states (`js/aiReflectionUI.js:251`).
- Backend and frontend tests cover auth, validation, ownership, rating, loading, success, and failure.

What is still missing:

- No persisted Reflection content, so feedback cannot later be joined to what the user saw.
- No analytics event infrastructure for viewed/helpful/not-helpful.
- No aggregate product insight such as “which reflection type is useful”.

Reflection feedback verdict: **COMPLETE as Phase 23.2.3; PARTIAL as a product feedback analytics loop**.

## 15. MPA / UI Stability Audit

The committed MPA shell fix remains intact.

- `8306a35` added `js/shellBootstrap.js`, user chrome stabilization, CSS first-frame guards, and dashboard/navigation regression tests.
- Current tests pass in `tests/shellBootstrap.test.js`, `tests/dashboardRenderStability.test.js`, and navigation/page-initialization suites.
- Build completes successfully.

Known build warning: several pages load `js/shellBootstrap.js` without `type="module"`, so Vite cannot bundle it (`npm run build` output). It is not a build failure, but should be resolved before Agent-era page architecture expands.

MPA verdict: **stable in tests/build; browser/e2e health not independently verified**.

## 16. Current AI Architecture

```text
CGStore (todos, focus, english, readings, sports, checkins, courses, goals, user.memory)
        ↓
Analytics (canonical metrics)
        ↓
GrowthIntelligence / GrowthMemory / GrowthReport / DailyFeedback
        ↓
GrowthContext + AIContext + controlled retrieval/tool results
        ↓
/api/ai/chat       /api/ai/reflection       /api/ai/reflection/feedback
        ↓                         ↓                          ↓
Provider reply         Reflection JSON            Binary feedback
        ↓                         ↓
Deterministic suggestions/actions         friendly UI
```

Agent infrastructure present:

- [✓] User behavior context
- [✓] Goal context
- [✓] Habit/risk signals
- [✓] Memory with confidence/lifecycle
- [✓] Reflection
- [✓] Binary user feedback
- [✓] Read-only controlled retrieval
- [?] Course knowledge
- [✗] Verified student knowledge state
- [✗] Evidence-based document/knowledge retrieval
- [✗] Planning engine
- [✗] Safe execution/action layer beyond navigation/proposal

## 17. Course Architecture

Current course path:

```text
CGStore.courses
  → CourseSchedule.normalizeCourse()
  → schedule/progress derivation
  → Workbench UI / Stats / Goals / AIContext
```

What exists:

- Stable course records inside CGStore.
- Normalized schedule slots and semester weeks.
- Import matching and merge rules.
- Coarse progress and status.
- Teacher/classroom/credits/notes metadata.

What does not exist:

- Course Space.
- Course/Module/Chapter/Section entities.
- Source documents or materials.
- Chunking, embedding, vector, keyword, or semantic retrieval.
- Mastery/knowledge-state tracking.
- Evidence-backed learning recommendations.

Course Knowledge readiness: **PARTIALLY READY**. The course identity/schedule/progress foundation is enough to begin a carefully scoped Course Space/Knowledge Foundation phase, but not enough to build a Learning Agent.

## 18. Agent Readiness Matrix

| Layer | Current State | Evidence | Readiness |
| --- | --- | --- | --- |
| User Data | Strong | `js/store.js:84`, backend snapshot schema | READY |
| Analytics | Strong | `js/analytics.js:1`, page usage | READY |
| Goals | Strong | `js/goals.js:1`, `js/goals.js:360` | READY |
| Memory | Useful but split | `js/growthMemory.js:755`, `js/coachMemory.js:4` | PARTIAL |
| Habit Intelligence | Uncommitted but tested | `js/habitFormation.js:90` | PARTIAL |
| AI Coach | Context-aware, read-only | `js/aiContext.js:157`, `backend/src/services/aiService.js:204` | READY for assistant, not agent |
| Reflection | Complete for current scope | `backend/src/services/aiService.js:256` | READY |
| Feedback Loop | Binary only | `backend/src/services/aiReflectionFeedbackService.js:39` | PARTIAL |
| Course Model | Schedule + progress only | `js/courseSchedule.js:17`, `js/store.js:1080` | PARTIAL |
| Course Knowledge | Missing | No module/chapter/source entities found | NOT READY |
| Retrieval | Controlled metric retrieval only | `js/aiDataRetrieval.js:9`, `js/aiContext.js:630` | PARTIAL |
| Evidence | Metric/memory evidence, no knowledge evidence | `js/growthMemory.js:61` | PARTIAL |
| Student Knowledge State | Missing | No mastery model found | NOT READY |
| Planning | Static action proposals only | `backend/src/services/promptBuilder.js:124` | NOT READY |
| Action Layer | Navigation / user-confirmed proposals only | `js/aiActions.js`, `backend/src/services/promptBuilder.js:117` | NOT READY |

## 19. Agent Capability Matrix

| Capability | Exists | Quality | Evidence |
| --- | --- | --- | --- |
| Perception | Yes | Good for logged behavior | Analytics + GrowthIntelligence |
| User Context | Yes | Good, budgeted, versioned | `js/aiContext.js:157` |
| Course Knowledge | No | Missing | Course model only has schedule/progress |
| Retrieval | Partial | Current-user metric retrieval, no semantic knowledge retrieval | `js/aiDataRetrieval.js:9` |
| Reasoning | Partial | Deterministic rules + LLM explanation | `backend/src/services/promptBuilder.js:104` |
| Planning | No | Suggestions/actions are rule-derived, not multi-step plans | `backend/src/services/promptBuilder.js:124` |
| Action | No | Proposals/navigation only; no autonomous write | `js/aiActions.js` |
| Memory | Partial | Strong GrowthMemory; CoachMemory uses second storage | `js/growthMemory.js:755`, `js/coachMemory.js:4` |
| Feedback | Partial | Reflection binary feedback exists; no analytics aggregation | `backend/src/services/aiReflectionFeedbackService.js:39` |

## 20. Technical Debt

### P0 — Blocks next development phase

1. Current working tree is not frozen: 31 modified, 46 untracked paths, including core growth/retention/habit features.
2. Frontend test suite is red: 2 failures in untracked `tests/workbenchDailyFeedback.test.js`.

### P1 — Important before Agent/Foundation work

1. Reflection still accepts client-submitted GrowthContext. It is sanitized and bounded, but server cannot independently derive it (`backend/src/routes/ai.js:35`, `backend/src/services/aiService.js:263`).
2. Course has no Knowledge entity model or verified learning state.
3. Reflection feedback has no analytics/event aggregation.
4. GrowthMemory and CoachMemory provide two user-memory systems with different storage boundaries (`js/growthMemory.js:763`, `js/coachMemory.js:4`).
5. Temporary video directories exist in the repository working tree (`tmp-video-frames/`, `tmp-video-seq/`).

### P2 — Normal debt

1. `CGStore` contains some direct aggregate helpers in addition to Analytics (`js/store.js:1099`, `js/store.js:1167`).
2. Build warns that `shellBootstrap.js` is not module-bundled in several pages.
3. Several Phase 20–22 docs are untracked, so documentation and Git state diverge.
4. No browser automation/E2E dependency exists.

### P3 — Future

1. Revision could become a content fingerprint/history chain for stronger offline merge semantics.
2. Memory lifecycle/relations could later become a dedicated user-knowledge graph, but only after storage boundaries are reconciled.

## 21. Test Health

Current working-tree verification:

```yaml
Frontend:
  command: npm test
  result: FAIL
  passed: 578
  failed: 2
  total: 580
  failed_file: tests/workbenchDailyFeedback.test.js
  failures:
    - adding focus updates Daily Feedback without replacing the existing toast copy
    - Growth Brief shows one bounded current growth stage

Backend:
  command: npm test
  result: PASS
  passed: 84
  failed: 0
  total: 84

Combined:
  passed: 662
  failed: 2
  total: 664
  skipped: 0
  flaky_evidence: none observed in this run
```

Critical suites that passed include Analytics, Goals, Store, Sync, Course Schedule, Course Text Parser, AI Context, AI Coach, Growth Intelligence, Growth Memory, GrowthContext, Reflection, Reflection Security, Reflection Feedback, and Today Plan.

## 22. Build Health

```yaml
command: npm run build
result: PASS
warnings:
  - shellBootstrap.js is loaded without type="module" on stats/ai/workbench/goals pages and is not bundleable
output_pages:
  - index.html
  - login.html
  - workbench.html
  - stats.html
  - goals.html
  - ai.html
```

## 23. Browser Health

No Playwright, Cypress, or equivalent E2E configuration is present in the repository. Therefore Index, Workbench, Courses, Stats, Goals, AI, Today, console errors, navigation, first-frame rendering, and layout were not independently browser-verified in this audit.

Browser Health: **NOT RUN / NO E2E INFRASTRUCTURE**.

## 24. Security / Data Boundaries

Current security posture:

- JWT is required for protected AI/data routes; `authRequired` injects `req.userId` (`backend/src/middleware/auth.js:129`).
- Backend user data is keyed by `user_id` (`backend/schema.sql:24`).
- Sync writes use whitelist keys and optimistic revision control (`backend/src/services/syncService.js:96`, `backend/src/services/syncService.js:141`).
- AI chat and Reflection require auth and rate limits (`backend/src/routes/ai.js:28`, `backend/src/routes/ai.js:33`).
- Reflection feedback validates ownership and rating (`backend/src/services/aiReflectionFeedbackService.js:39`).
- Reflection context is allowlisted and bounded; system prompt declares context as data, not instructions (`backend/src/services/reflectionContext.js:54`, `backend/src/services/promptBuilder.js:149`).
- Provider API key remains server-side and is not returned (`backend/src/services/aiService.js:13`).

Future Course Knowledge boundary:

Without explicit separation, a Course Knowledge layer could accidentally mix public/general course content, user-owned notes/progress, and AI prompt context. Future design should enforce:

```text
Course Content / Knowledge Source
  = reusable learning object, content ID, source metadata

User Learning State
  = user_id, content_id, mastery/status, evidence

AI Context
  = compact, permission-filtered projection with untrusted content marking
```

The backend must own ownership filtering and retrieval scoping. AI must not receive raw mixed stores or decide permissions.

## 25. Current Architecture Diagram

```text
                 Current System
                       │
      ┌────────────────┼────────────────┐
      │                │                │
   User Data        Course           AI
      │                │                │
   CGStore       CourseSchedule     AIContext
      │                │                │
   Analytics     Progress/Schedule  Controlled Retrieval
      │                │                │
    Goals        Import/Matching   AI Coach
      │                                 │
 GrowthIntelligence                 Reflection
      │                                 │
 GrowthMemory                     Feedback
      │
 DailyFeedback / Reports

Backend: JWT, Sync, SQLite, AI Provider, Reflection Feedback
```

Existing Agent foundation: unified user data, Analytics, Goals, read-only context/retrieval, GrowthMemory, Reflection, and user feedback.

Missing Agent layers: Course Knowledge, verified learning state, evidence retrieval, planning, and safe user-confirmed action execution.

## 26. Current Maturity Level

Current maturity: **Level 3 — early Personal AI Coach**.

Why:

- It is beyond Level 2 because it uses real behavior data, goals, deterministic growth signals, memory, and reflection.
- It is not Level 4 because it cannot autonomously plan a learning path, retrieve/verify course knowledge, maintain a student knowledge state, or execute safe learning actions.
- The AI remains an explainer/advisor over user-owned data, not an autonomous personal learning agent.

## 27. Blocking Issues

| Priority | Blocker | Required Outcome |
| --- | --- | --- |
| P0 | Large unnamed working set | Name, review, test, and commit or split the current growth/retention/habit work |
| P0 | Frontend tests failing | Fix the two `workbenchDailyFeedback.test.js` failures without weakening assertions |
| P1 | Course Knowledge absent | Add Course Space/Knowledge Foundation only after current work is frozen |
| P1 | Reflection context is client-submitted | Design server-derived or authenticated context ownership model |
| P1 | Reflection feedback has no analytics | Define additive analytics/event contract without changing business model |
| P1 | Memory systems split | Reconcile GrowthMemory and CoachMemory boundaries |

## 28. Recommendation

Do **not** start Personal Learning Agent development now.

Recommended sequence:

1. Stabilize and commit or split the current unnamed growth/retention/habit working set.
2. Fix the two failing Workbench Daily Feedback tests.
3. Remove or formally ignore temporary media artifacts.
4. Add browser/e2e smoke coverage for Index, Workbench, Courses, Stats, Goals, AI, and Today.
5. Design a minimal Course Space & Knowledge Base Foundation phase:
   - Add stable Course/Module/Chapter/Section/Source entities.
   - Separate public/general knowledge from user-owned learning state.
   - Add retrieval and evidence metadata.
   - Do not add autonomous planning, auto-writing, or Agent action execution.

## 29. Decision

```text
DECISION:

NOT READY
```

### Evidence

- Frontend tests: 578/580 pass, 2 fail.
- Backend tests: 84/84 pass.
- Build: pass.
- Working tree: large uncommitted and untracked feature set.
- Course model: schedule/progress only; no knowledge/retrieval/mastery layer.
- AI: context-aware coach with read-only retrieval, reflection, and binary feedback; no planning/action layer.

### Reasons

The current system is strong enough to justify a future Foundation phase, but starting Agent development would build planning and action on unfinished tests, uncommitted architecture, incomplete course knowledge, and partially reconciled memory boundaries.

### Risks if proceeding now

- Agent behavior would be based on unverified course assumptions.
- Personal learning data and future course knowledge could become mixed in AI context.
- New planning/action logic would be added on top of an unstable working tree.
- User trust could be damaged if AI recommendations lack evidence or write permissions are too broad.

### Recommended next step

First stabilize the current unnamed growth/retention/habit working set and make all tests pass. After that, start a narrowly scoped **Phase 24 — Course Space & Knowledge Base Foundation**, not full Personal Learning Agent development.
