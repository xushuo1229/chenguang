# Growth Intelligence Phase Report

## 1. Current architecture audit

- Existing core layers were preserved: `CGStore` owns business data, `CGAnalytics` owns factual aggregation, Goal Engine owns goal progress, and `CGSync` owns cloud synchronization.
- The previous AI flow was: Store / Analytics / Goal Engine → `aiContext.buildContext` → `/api/ai/chat` → backend prompt builder / provider adapter → reply.
- The backend continues to keep provider keys and system prompts server-side, validates message roles and context, strips forbidden sensitive keys, and applies login + rate-limit middleware.

## 2. Added architecture

```text
CGStore / CGAnalytics / Goal Engine
  → js/growthIntelligence.js        read-only Growth State, trends, risks, opportunities, proposals
  → js/aiDataRetrieval.js           whitelisted, question-aware data retrieval
  → js/aiContext.buildQueryContext  compact AI decision context
  → /api/ai/chat                    existing authenticated AI proxy
  → Workbench Daily Brief           proposal → user confirmation → business Store API
```

No new framework, database, state library, or AI write path was introduced.

## 3. Growth Intelligence

**DONE**

- `js/growthIntelligence.js` computes a versioned Growth State from read-only snapshots.
- Covered domains: learning, execution, focus, English, reading, exercise, course, goal, workload, and consistency.
- The state includes 7/14/30-day trends, risk signals, positive signals, recommended focus, action proposals, and data sufficiency.
- Empty or malformed data is explicitly marked `insufficient_data`; the layer does not invent behavior.

## 4. Data retrieval

**DONE**

- Added a whitelist-based retrieval layer in `js/aiDataRetrieval.js`.
- Exposed queries: today summary, week summary, recent trends, course progress, English history, focus history, exercise history, reading history, todo status, goal progress, and growth state.
- Retrieval is question-aware and returns only compact, relevant results to AI Context.
- User-entered text is marked with `__untrustedUserContent`; free-text fields outside the whitelist are not exposed.

## 5. Growth State

**DONE**

- A stable state schema includes overall and domain states, trend windows, risks, strengths, recommended focus, action proposals, and data sufficiency.
- State calculation is cached by Store revision and date to avoid repeated aggregation on every UI update.

## 6. Risk / Opportunity

**DONE**

- Rule-based risks include overdue tasks, todo backlog, low course progress, declining focus or English trends, and at-risk goals.
- Opportunities include execution momentum, improving focus or English trends, stable courses, and achieved goals.
- Every signal references evidence from Analytics or Goal Engine.

## 7. AI Context

**DONE**

- Base AI Context now includes a compact Growth State.
- `buildQueryContext` adds question intent, requested query whitelist, relevant results, and current-user-only metadata.
- Existing Context version remains `1.0`, preserving backend compatibility.

## 8. Daily Insight

**DONE / PARTIAL**

- Workbench now renders a Daily Growth Brief before the task cards.
- The brief shows status, changes, concern, strength, rationale, and 1–3 action proposals.
- AI page shows today status, findings, risks, long-term trends, proposals, and conversation.
- Daily/weekly generation is deterministic. There is not yet a separately scheduled background notification workflow.

## 9. AI Action

**DONE / PARTIAL**

- Added `js/aiActions.js` as the user-confirmation layer.
- Confirmed `add_todo` proposals go through `CGStore.addTodo`; check-in and whitelisted navigation are also supported.
- The AI/model cannot create, update, delete, or write localStorage directly.
- Actions are limited to the proposal whitelist and invalid proposals are rejected.

## 10. Growth Profile

**PARTIAL**

- Added a derived profile containing stable habits, common risks, effective strategies, current focus, and data sufficiency.
- Best time slots are intentionally empty because current records do not include reliable time-of-day evidence.

## 11. Feedback Loop

**PARTIAL**

- Accepted proposals are observed as `in_progress` or `completed` during the current session.
- No durable recommendation history is persisted yet, so feedback does not survive reload or sync.

## 12. UI changes

- Workbench first screen now has a Daily Growth Brief.
- AI page has a long-term trend section and evidence-based next-step proposals.
- Styling follows the existing Calm Dawn Fusion / 1-to-1 system.
- `js/userChrome.js` is now bundled as a module, fixing a production build warning and missing dist asset.

## 13. Security review

**DONE (manual review)**

- Retrieval has a fixed query whitelist and no arbitrary data access.
- All retrieval is based on the caller's local Store snapshot and does not accept user IDs.
- Raw user text is marked untrusted; the backend prompt already treats all context content as non-instruction data.
- AI actions require explicit user confirmation and use business Store methods only.
- Provider API keys remain backend-only; backend context sanitization and login/rate-limit behavior remain unchanged.
- No secrets, temporary files, or credentials were added.

## 14. Test results

- Frontend: `npm test` — 20 test files, 304 tests passed.
- Backend: `cd backend && npm test` — 62 tests passed.
- New coverage includes Growth State, trends, risks, recommendations, retrieval, insufficient data, malformed data, read-only behavior, AI Context, action confirmation, and feedback status.

## 15. Build results

- `npm run build` succeeded.
- Vite reports no module bundling warnings after converting `userChrome.js` to a module entry.

## 16. Remaining limitations

- Feedback history is in-memory and session-only.
- The assistant does not make model-initiated tool calls; it uses deterministic question-aware retrieval.
- Best-time-of-day analysis is not implemented because source records lack reliable time fields.
- Weekly Review is not a separate scheduled workflow; trend analysis is available on demand.
- Growth Profile is derived and does not yet include longitudinal strategy effectiveness.

## 17. Next recommended phase

1. Persist sanitized proposal feedback and outcome history.
2. Add backend tool-call endpoints with per-user authorization and strict query schemas.
3. Add optional timestamp capture to focus and study records to enable best-time-slot analysis.
4. Add a scheduled Weekly Review view and export.
