# Phase 27.1 Independent Re-Audit

Date: 2026-09-18

Audit scope: Agent Context Builder implementation in the current uncommitted working tree.

Final verdict: NOT_READY_TO_FREEZE

## 1. Audit Scope

The audit covered:

- `backend/src/db/agentHomeContextModel.js`
- `backend/src/services/agentHomeService.js`
- `backend/src/routes/agentHome.js`
- `backend/src/routes/index.js`
- `backend/test/agentHomeContext.test.js`
- `docs/PHASE_27_1_AGENT_CONTEXT_BUILDER_FINAL.md`
- Frozen architecture documents for Agent Home, Personal Learning Agent and Student Knowledge State

The audit did not modify production code, tests or frozen files.

## 2. Architecture Result

### 2.1 Read-Only Boundary

PASS

The only registered endpoint is:

```text
GET /api/agent-home/context
```

It is protected by `authRequired` and uses `req.userId` rather than client-supplied identity:

```text
backend/src/routes/agentHome.js:9-16
```

The service returns:

```text
version: learning-context-v1
readOnly: true
actionLevel: insight_only
permissions.write: []
```

Evidence:

```text
backend/src/services/agentHomeService.js:13-21
backend/src/services/agentHomeService.js:160-214
```

No LLM, Planner, Tutor, Agent workflow or mutation path is present.

### 2.2 Bounded Read Boundary

PASS

Service limits are explicit:

```text
COURSE_LIMIT = 10
NODE_LIMIT = 10
STATE_LIMIT = 20
WEAK_TOPIC_LIMIT = 10
STRONG_TOPIC_LIMIT = 10
MEMORY_LIMIT = 10
```

Evidence:

```text
backend/src/services/agentHomeService.js:13-21
```

Course nodes and knowledge states use SQL `LIMIT` and user-bound filters:

```text
backend/src/db/agentHomeContextModel.js:5-15
backend/src/db/agentHomeContextModel.js:17-40
```

Text and numeric projection is bounded:

```text
backend/src/services/agentHomeService.js:23-40
backend/src/services/agentHomeService.js:59-106
```

### 2.3 User Isolation

PASS

- Course nodes filter by `course_space_nodes.user_id`.
- Knowledge states filter by `student_knowledge_states.user_id`.
- The join also binds `course_space_nodes.user_id`.
- GrowthMemory and behavior summaries are read from the current user's sync payload.

Evidence:

```text
backend/src/db/agentHomeContextModel.js:5-40
backend/src/services/agentHomeService.js:143-158
```

## 3. Source Of Truth Audit

| Field | Source | Type | Authority |
| --- | --- | --- | --- |
| `version` | Agent Context Builder | Derived metadata | Builder contract |
| `userId` | `req.userId` | Source identity | Backend authentication |
| `courses` | Sync payload / CGStore | Source projection | Source data |
| `courseKnowledge.nodes` | `course_space_nodes` | Source projection | Course Space |
| `knowledgeStates` | `student_knowledge_states` + Course Space node join | Source projection | Student Knowledge State |
| `learningHistory` | Reflection Context Source helpers | Derived summary | Deterministic projection |
| `reflections.todaySummary` | Reflection Context Source behavior helpers | Derived summary | Misaligned with Reflection Summary definition |
| `reflections.recentInsights` | Not yet available | Empty derived field | No authority yet |
| `growthSignals.risks` | Reflection Context Source | Derived signal | Deterministic projection |
| `memories.growth` | CGStore `user.memory` | Derived memory projection | Requires authority metadata |
| `memories.coach` | Not available to backend | Empty capability | No backend Source of Truth |

Source data fields are not mutated. Derived fields are projections and do not create persistence.

## 4. Security Result

PASS

- Authentication is required.
- Identity is taken from JWT-backed `req.userId`.
- No client-owned user identifier is accepted.
- All database reads are user-isolated.
- API is GET-only.
- No write method is exposed.
- No raw `todos` or raw course/document evidence arrays are returned.
- Output fields are allowlisted and bounded.

## 5. Data Boundary Result

PASS WITH FINDINGS

Course Knowledge and Student Knowledge State boundaries are preserved. The implementation does not mutate Mastery, Evidence, Course Data or Knowledge State.

However, Memory Boundary does not fully match the frozen architecture:

1. `learningHistory` and `reflections.todaySummary` duplicate the same task/focus/streak projection.
2. `reflections.todaySummary.source` is `ReflectionContextSource`, but the data is a behavior snapshot rather than Reflection history.
3. GrowthMemory is projected from CGStore `user.memory` without explicit authority metadata.
4. CoachMemory is reserved in the contract but unavailable to the backend.

Details are recorded in:

```text
docs/ARCHITECTURE_REVIEW_REQUIRED.md
```

## 6. API Audit

PASS WITH FINDINGS

- Endpoint: `GET /api/agent-home/context`
- Version: `learning-context-v1`
- Authentication: required
- Authorization: user-isolated
- Output: bounded allowlist projection
- Future compatibility: versioned contract is present

The memory-related semantic findings above must be resolved before the contract is frozen.

## 7. Test Verification

PASS

```yaml
Backend: 103/103 PASS
Frontend: 590/590 PASS
Build: PASS
git diff --check: PASS
```

One earlier backend run had a transient `aiReflection.test.js` failure. Re-running the backend suite and the final full run passed. It was classified as an environment/timing flake, not a Phase 27.1 regression.

## 8. Browser Smoke

PASS

Tested pages:

```text
workbench.html
today.html
stats.html
goals.html
ai.html
```

Viewports:

```text
Desktop: 1920x1080
Mobile: 375x812
```

Results:

- 10/10 page checks passed.
- 0 console errors.
- 0 page errors.
- 0 HTTP responses with status >= 400.
- 0 horizontal overflow.
- Authenticated Agent Context API returned `learning-context-v1`, `readOnly:true`, `actionLevel:insight_only`.

## 9. Findings

### F-001 Memory Boundary Semantics Are Not Frozen

Severity: High

Evidence:

```text
backend/src/services/agentHomeService.js:131-140
backend/src/services/agentHomeService.js:175-190
backend/src/services/agentHomeService.js:197-204
docs/PERSONAL_LEARNING_AGENT_HOME_ARCHITECTURE_V1_0.md:192
docs/PERSONAL_LEARNING_AGENT_HOME_ARCHITECTURE_V1_0.md:255-258
docs/PERSONAL_LEARNING_AGENT_HOME_ARCHITECTURE_V1_0.md:292
```

The current Reflection field is a deterministic behavior snapshot, not a Reflection Summary sourced from user Reflection data. The same projection is reused by `learningHistory`, creating ambiguous ownership.

Recommendation:

Do not start Phase 27.2. Resolve the architecture questions in `docs/ARCHITECTURE_REVIEW_REQUIRED.md`, then either rename/clarify the behavior snapshot semantics or add a true bounded Reflection adapter without creating a second memory system.

### F-002 Audit Baseline Is Uncommitted

Severity: Medium

Evidence:

```text
git status --short
```

The Phase 27.1 implementation files are present in the working tree but are not committed. Freeze requires a stable, auditable commit boundary.

Recommendation:

After architecture review is resolved, commit only the focused Phase 27.1 files and documentation. Do not include unrelated working-tree changes or temporary files.

### F-003 Full Sync Payload Is Loaded Before Projection

Severity: Medium

Evidence:

```text
backend/src/services/agentHomeService.js:152-155
```

The response is bounded, but the builder currently obtains the user's full sync payload before projecting a small context. Very large histories may increase memory and latency even though output remains bounded.

Recommendation:

For a later non-breaking optimization, introduce bounded Source of Truth adapters that query only the required daily summaries. Do not bypass Analytics or Sync in this audit.

## 10. Recommendation

1. Do not freeze Phase 27.1.
2. Do not start Phase 27.2.
3. Do not implement Agent UI, Reasoning Layer or Actions.
4. Resolve `docs/ARCHITECTURE_REVIEW_REQUIRED.md` first.
5. After approval, make the smallest backward-compatible contract clarification, rerun full regression and browser smoke, then commit the focused Phase 27.1 baseline.
6. Run a fresh independent re-audit against that commit before freeze.

## 11. Final Verdict

```text
NOT_READY_TO_FREEZE
REQUIRED_NEXT: ARCHITECTURE_REVIEW
```
