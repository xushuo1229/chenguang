# Phase 18.2 Architecture Audit

## Summary

Phase 18.2 completed a focused architecture audit without changing product behavior. The audit verified that business data remains isolated behind `CGStore`, statistics remain centralized in `Analytics`, goal progress remains derived through `GoalEngine`, and the AI chain remains read-only. It also added focused regression coverage for architecture boundaries, sync lifecycle behavior, and security invariants.

No data model, sync protocol, authentication flow, AI write boundary, framework, storage layer, or service-worker behavior was changed.

## Scope

- `js/store.js`
- `js/sync.js`
- `js/analytics.js`
- `js/goals.js`
- `js/aiContext.js`
- `js/aiDataRetrieval.js`
- `js/aiToolRunner.js`
- `pages/workbench.js`
- `pages/goals.js`
- `pages/stats.js`
- `pages/ai.js`
- `service-worker.js`
- `backend/src`

## Findings

### 1. Data Architecture

**PASS**

- No page directly reads or writes the business storage key `chenguangData`.
- All user business data flows through `CGStore`.
- The canonical collections remain:
  - `checkins`
  - `sports`
  - `readings`
  - `courses`
  - `english`
  - `todos`
  - `focus`
- No second business storage or parallel data model was introduced.

### 2. Store Revision Semantics

**PASS**

Every local write to a canonical collection bumps the local revision exactly once. Remote data application does not bump the revision, which prevents a write-after-pull feedback loop and avoids unnecessary re-pushes.

Regression coverage verifies the revision behavior for each canonical collection.

### 3. Sync Lifecycle

**PASS**

- `workbench` is the only post-login sync entry point.
- `goals`, `stats`, and `ai` do not trigger a duplicate sync when opened.
- Remote application is guarded so it does not enqueue another push.
- Local writes push once after completion.
- Offline writes remain locally preserved and queued.
- Network recovery retries queued writes.
- `409 SYNC_CONFLICT` follows the existing server-merge and re-push flow.

### 4. Analytics Boundary

**PASS**

`Analytics` remains the only statistics source. No page scans raw records directly, recomputes totals or streaks, or owns a separate statistics engine.

### 5. Goals Boundary

**PASS**

`GoalEngine` derives progress through `Analytics` APIs such as date-range summaries and course summaries. It does not duplicate business calculations. Per-call range caching exists without introducing a second persistent cache layer.

### 6. AI Boundary

**PASS**

The AI chain remains:

```text
User data
→ js/aiDataRetrieval.js
→ js/aiContext.js
→ js/aiToolRunner.js
→ AI Provider
```

- AI reads user data through the existing read-only path.
- AI does not directly mutate business collections.
- AI page and AI context rendering do not change local revision or business data.
- Coach Memory remains isolated under its dedicated key and is not treated as business data.
- AI provider failures and upstream errors are sanitized before display.

### 7. Initialization

**PASS**

- Page initialization does not duplicate sync work on navigation.
- The AI page builds its first snapshot once during initial startup.
- Goals, stats, and AI pages render structure before filling derived data.
- No new page-level cache or hidden state system was introduced.

### 8. Service Worker

**PASS**

- Cache version is derived from the build identifier hash.
- API requests are excluded from cache handling.
- Old caches are cleaned during activation.
- Registration remains restricted to HTTP(S) and the production registration path.

### 9. Security

**PASS**

- Protected data, AI, and course-import routes require JWT authentication.
- No `eval` or `new Function` usage was found in AI page paths.
- User-generated content is rendered as text rather than injected as executable HTML.
- Backend request bodies are limited to 2 MB.
- Course-import URL validation includes SSRF protection for localhost, private IPv4, private IPv6, IPv4-mapped IPv6, and redirect targets.
- AI provider errors do not expose backend, provider, API key, or upstream response details.

## Legacy Observations

The following items are compatibility observations, not defects requiring action in this phase:

- `user.totalDays` and `user.continuousDays` remain as fallback fields for older local data. New flows do not actively write them.
- Sports records can contain the legacy `min` field while migration preserves compatibility. Analytics reads `durationMinutes` from the normalized `duration` field.
- The internal `__migrated` flag is used for migration housekeeping and is stripped before sync.

These fields should be cleaned up only in a future migration-focused phase after a dedicated compatibility audit.

## Added Regression Coverage

| File | Tests | Purpose |
| --- | ---: | --- |
| `tests/architecture.audit.test.js` | 3 | Protect data, analytics, goals, and AI architecture boundaries. |
| `tests/sync.audit.test.js` | 4 | Protect local revision, push, pull, offline queue, and remote-write behavior. |
| `tests/security.audit.test.js` | 4 | Protect dynamic-execution, rendering, authentication, and service-worker security invariants. |

## Verification

| Check | Result |
| --- | --- |
| Frontend tests | **PASS** — 31 files, 357 tests |
| Backend tests | **PASS** — 62 tests |
| Production build | **PASS** |
| Git whitespace check | **PASS** |

## Architecture Impact

No runtime architecture changed. The audit increases regression protection without adding a cache layer, framework, route system, second state system, or new business feature.

## Security Review

**PASS**

The current implementation preserves user data isolation, authentication boundaries, safe rendering, backend payload limits, AI output sanitization, and course-import SSRF protection.

## Remaining Risks

1. Legacy user and sports fields remain for compatibility and require a future migration plan.
2. Page-level behavior tests cover initialization and data consistency, but browser-level timing measurements are still manual.
3. Service-worker cache behavior should continue to be checked during release builds because cached static assets can delay user-visible upgrades if cache keys are changed incorrectly.

## Recommendation

Keep this audit suite as a permanent regression baseline. In a later phase, create a dedicated compatibility migration plan for legacy user and sports fields, then remove fallback fields only after verifying that all active clients and persisted local payloads have migrated.
