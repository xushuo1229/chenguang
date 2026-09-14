# Phase 17 — AI Personal Coach 2.0 Report

## Status

| Capability | Status | Evidence |
| --- | --- | --- |
| Controlled Retrieval Orchestration | COMPLETE | `js/aiToolRunner.js`, `js/aiDataRetrieval.js`, `js/aiContext.js` |
| Coach Memory | COMPLETE | `js/coachMemory.js`, `js/aiContext.js` |
| Proposal Feedback Lifecycle | COMPLETE | `js/aiActions.js`, `pages/workbench.js` |
| Weekly Review | COMPLETE | `js/growthIntelligence.js`, `pages/ai.js` |
| AI Page And Workbench Integration | COMPLETE | `ai.html`, `pages/ai.js`, `pages/workbench.js` |
| Native Model Tool Calling | NOT IMPLEMENTED | Intentional architecture decision |
| Cross-device Memory Sync | NOT IMPLEMENTED | Current memory is local and identity-scoped |
| Production Visual Regression | PARTIAL | Automated page tests and production build passed; no browser screenshot matrix was run |

## Baseline And Scope

- Repository: `F:\chenguang-platform`.
- Branch: `codex/growth-intelligence`.
- Baseline commit: `bfa22b8`.
- Existing Store, Analytics, and Goal Engine semantics remain authoritative for business data.
- No React, Vue, Tailwind, TypeScript, Docker, or agent framework was introduced.

## Architecture

AI Coach 2.0 keeps the existing read-only intelligence boundary:

1. `CGStore` remains the only business-data source for retrieval.
2. `AIRetrieval` plans and executes whitelisted read-only queries.
3. `AIToolRunner` validates and bounds the controlled tool loop.
4. `AIContext` combines base context, retrieved facts, and Coach Memory.
5. `AIActions` still requires explicit user confirmation before business mutation.
6. `CoachMemory` persists only recommendation lifecycle evidence, not raw user content or AI-fabricated outcomes.

This is **Controlled Retrieval Orchestration**, not native model tool calling. The model does not invoke local functions directly and cannot ask the frontend to mutate `CGStore` or localStorage.

## Retrieval And Tool Registry

- The tool registry contains only read-only handlers for today summary, trends, learning history, course progress, English/reading/exercise/focus history, todo status, goal progress, growth state, and growth profile.
- Every tool call has a whitelist check, argument-schema check, date/range validation, result-size limit, and execution error boundary.
- One loop is capped at 5 calls; individual results are capped at 8,192 JSON characters and total loop output at 32,768 characters.
- A failed tool call ends the loop with a diagnostic code instead of being silently ignored.

## Coach Memory And Feedback

- Memory uses `cg_ai_coach_memory_v1`, separate from `cg_store_v1` and normal user data.
- The store shape is `{ version: 1, users: { [userId]: { recommendations, memories, updatedAt } } }`.
- Recommendations move through `proposed`, `accepted`, `rejected`, `completed`, or `expired`.
- Acceptance and rejection are user-confirmed through the Action Layer.
- Outcomes are derived from real Store todos linked through `__aiProposalId`; the AI cannot report a fabricated outcome.
- Strategy effectiveness is derived only after at least 3 completed/expired samples. Otherwise it returns `insufficientEvidence: true`.

## Weekly Review

`GrowthIntelligence.buildWeeklyReview` summarizes the observed week and exposes evidence-backed trends in the AI page. The section is read-only and uses the existing Store/Analytics data.

## Security Review

- Secrets: No API keys, tokens, or backend credentials were added to frontend files or tests.
- Prompt/tool injection: User messages influence only intent keywords. Retrieved content is data, not executable instructions. Tool plans cannot add handlers, bypass the registry, or pass undeclared arguments.
- Cross-user isolation: Coach Memory is identity-scoped and guarded before read/update. The backend sync remains user-token-scoped.
- Output size: Tool results and aggregate loop output have finite JSON-character limits.
- Unauthorized mutation: Tool handlers are read-only. `add_todo`, goal, and schedule mutations continue to require explicit confirmation through `AIActions`.

## Verification

- Frontend: `npm test` — 23 files, 317 tests, all passed.
- Production build: `npm run build` — passed.
- Backend: `cd backend; npm test` — 19 suites, 62 tests, all passed.
- Static verification: AI page and Workbench behavior covered by existing page tests; `git diff --check` passed.

## Known Limitations

1. Native model tool calling was deliberately not implemented.
2. Coach Memory does not yet sync across devices or browsers.
3. The production visual review relied on automated page tests rather than a browser screenshot matrix.
4. Strategy effectiveness remains evidence-gated and is intentionally conservative with small samples.
