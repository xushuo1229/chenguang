# Phase 27.1 Context Boundary Re-Audit

Date: 2026-09-18

Implementation commit: `f3c2935 fix: remediate phase 27.1 context boundary`

Final verdict: READY_TO_FREEZE

## 1. Scope

This re-audit reviewed the committed Phase 27.1 boundary remediation:

```text
backend/src/db/agentHomeContextModel.js
backend/src/routes/agentHome.js
backend/src/services/agentHomeService.js
backend/src/routes/index.js
backend/test/agentHomeContext.test.js
docs/PHASE_27_1_AGENT_CONTEXT_BUILDER_FINAL.md
docs/PHASE_27_1_CONTEXT_BOUNDARY_REMEDIATION.md
docs/PHASE_27_1_INDEPENDENT_REAUDIT.md
docs/ARCHITECTURE_REVIEW_REQUIRED.md
```

The review focused on architecture, security, memory authority, data boundary, tests, regression and browser behavior.

## 2. Architecture Result

PASS

The committed implementation remains a read-only Context Builder:

- Context version: `learning-context-v1`.
- Action level: `insight_only`.
- API: `GET /api/agent-home/context`.
- Authentication: `authRequired`.
- Identity: `req.userId`.
- No LLM call.
- No Planner, Tutor or Autonomous Action.
- No mutation of Course Space, Knowledge State, Reflection, GrowthMemory or CoachMemory.

Evidence:

```text
backend/src/services/agentHomeService.js:13-14
backend/src/services/agentHomeService.js:180-255
backend/src/routes/agentHome.js:9-16
```

## 3. Boundary Result

PASS

The remediated contract explicitly separates the four context domains:

| Domain | Source | Authority | Result |
| --- | --- | --- | --- |
| Behavior Summary | `reflection_context_source` | `deterministic_projection` | Correctly separate from Reflection |
| Reflection | `reflection_storage` | `unavailable` | Returns unavailable; no behavior substitute |
| GrowthMemory | `cgstore.user.memory` | `derived_memory` | Correctly non-authoritative |
| CoachMemory | `coach_memory` | `unavailable` | Backend remains unavailable |

Evidence:

```text
backend/src/services/agentHomeService.js:143-155
backend/src/services/agentHomeService.js:210-244
```

The permission model contains:

```text
read:
- course_knowledge
- student_knowledge_state
- behavior_summary
- growth_memory_projection

write: []
```

Evidence:

```text
backend/src/services/agentHomeService.js:246-255
```

## 4. Security Result

PASS

- The route requires authentication.
- User identity comes from the JWT-backed `req.userId`.
- SQL queries filter by `user_id = $1`.
- Course nodes are bounded by SQL `LIMIT 10`.
- Knowledge states are bounded by SQL `LIMIT 20`.
- The Knowledge State query joins Course Space nodes on both node ownership and state ownership.
- The API only exposes GET.

Evidence:

```text
backend/src/routes/agentHome.js:5-16
backend/src/db/agentHomeContextModel.js:5-15
backend/src/db/agentHomeContextModel.js:17-40
```

## 5. Memory Authority Result

PASS

The implementation now tags context groups with `source`, `authority`, `type` and `confidence` through a single boundary helper.

Key assertions:

- Behavior is `behavior_summary`.
- Reflection is unavailable and contains no task/focus summary.
- GrowthMemory is `derived_memory`.
- CoachMemory is unavailable.
- `permissions.write` is empty.

Evidence:

```text
backend/test/agentHomeContext.test.js:190-231
```

## 6. Cross-User Isolation Result

PASS

Tests confirm that a second user cannot observe another user's course, Course Knowledge nodes or Knowledge State. Invalid or non-positive user identity is rejected.

Evidence:

```text
backend/test/agentHomeContext.test.js:135-158
```

## 7. Test Verification

PASS

```yaml
Backend: 104/104 PASS
Frontend: 590/590 PASS
Build: PASS
git diff --check: PASS
```

The backend suite includes the new boundary test covering Reflection, Behavior, GrowthMemory, CoachMemory and permission boundaries.

## 8. Browser Smoke Result

PASS

Pages:

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

```yaml
Checks: 10/10 PASS
Console errors: 0
Page errors: 0
HTTP >= 400: 0
Horizontal overflow: 0
Context version: learning-context-v1
readOnly: true
actionLevel: insight_only
behaviorType: behavior_summary
reflectionAvailable: false
growthAuthority: derived_memory
coachAvailable: false
writePermissions: []
```

## 9. Findings

### F-001 Full Sync Payload Is Loaded Before Bounded Projection

Severity: Medium

Evidence:

```text
backend/src/services/agentHomeService.js:168-172
```

The returned context is bounded, but the service obtains a full user sync payload before projection. Very large histories may increase memory and latency.

Recommendation:

Introduce bounded Source of Truth adapters in a later additive phase. Do not bypass Sync or Analytics in Phase 27.1.

### F-002 GrowthMemory Confidence Is Group-Level

Severity: Low

Evidence:

```text
backend/src/services/agentHomeService.js:228-234
```

The GrowthMemory group currently uses a fixed `0.5` confidence because individual memory provenance is not available. This is conservative and does not make the derived memory authoritative.

Recommendation:

In a later phase, preserve per-item provenance and confidence without changing the current read-only boundary.

## 10. Freeze Decision

There are no Critical or High findings. All required tests, build, whitespace and browser checks passed.

```text
PHASE 27.1 CONTEXT BOUNDARY: READY_TO_FREEZE
PHASE 27.2 ENTRY: ALLOWED FOR ARCHITECTURE DOCUMENT ONLY
```
