# Phase 27.2.2 Product Adapters Independent Re-Audit

Date: 2026-09-18

Implementation commit: `6a925b7 feat: add bounded product adapters`

Final verdict: READY_TO_FREEZE

## 1. Audit Scope

This independent audit reviewed the committed Product Adapter Layer:

```text
backend/src/services/agentAdapters/adapterContract.js
backend/src/services/agentAdapters/syncDataAdapter.js
backend/src/services/agentAdapters/behaviorAdapter.js
backend/src/services/agentAdapters/courseKnowledgeAdapter.js
backend/src/services/agentAdapters/knowledgeStateAdapter.js
backend/src/services/agentAdapters/growthMemoryAdapter.js
backend/src/services/agentAdapters/reflectionAdapter.js
backend/src/db/agentHomeContextModel.js
backend/src/services/agentHomeService.js
backend/test/agentProductAdapters.test.js
backend/test/agentHomeContext.test.js
docs/PHASE_27_2_2_PRODUCT_ADAPTER_ARCHITECTURE.md
```

## 2. Architecture Result

PASS

The Agent Home Service now composes read-only adapters instead of directly accessing the database or Sync Service.

Implemented adapter contracts:

| Adapter | Source | Authority | Type |
| --- | --- | --- | --- |
| `behavior` | `sync.activity` | `deterministic_projection` | `behavior_summary` |
| `course_knowledge` | `course_space` | `source` | `course_knowledge_projection` |
| `knowledge_state` | `student_knowledge_states` | `source` | `student_knowledge_state_projection` |
| `growth_memory` | `cgstore.user.memory` | `derived_memory` | `growth_memory_projection` |
| `reflection` | `reflection_storage` | `unavailable` | `user_reflection` |

All adapters return:

```text
adapter / version=adapter-v1 / source / authority / type / data / confidence / readOnly=true
```

Evidence:

```text
backend/src/services/agentAdapters/adapterContract.js:43-62
backend/src/services/agentHomeService.js:6-11
backend/src/services/agentHomeService.js:60-100
```

## 3. Boundary Result

PASS

The adapters preserve the required boundaries:

1. Behavior Summary is separate from Reflection.
2. Reflection explicitly remains unavailable.
3. GrowthMemory remains `derived_memory`.
4. CoachMemory remains unavailable.
5. Knowledge State is projected without recalculation or mutation.
6. Course Knowledge is projected without mutation.

Evidence:

```text
backend/src/services/agentAdapters/behaviorAdapter.js:45-78
backend/src/services/agentAdapters/reflectionAdapter.js:7-21
backend/src/services/agentAdapters/growthMemoryAdapter.js:31-51
backend/src/services/agentAdapters/knowledgeStateAdapter.js:49-79
```

## 4. Adapter Isolation Result

PASS

- `syncDataAdapter` validates a positive integer user id before reading Sync data.
- `courseKnowledgeAdapter` and `knowledgeStateAdapter` validate user identity before database reads.
- Behavior and GrowthMemory adapters reject a missing or invalid Sync adapter snapshot.
- Adapter tests confirm User B cannot see User A's course, node, evidence or Knowledge State.

Evidence:

```text
backend/src/services/agentAdapters/syncDataAdapter.js:7-31
backend/src/services/agentAdapters/courseKnowledgeAdapter.js:33-60
backend/src/services/agentAdapters/knowledgeStateAdapter.js:57-79
backend/test/agentProductAdapters.test.js:104-129
```

## 5. Source Authority Result

PASS

Source and authority are explicit for every adapter:

| Data | Authority |
| --- | --- |
| Course Space / Knowledge State | `source` |
| Behavior Summary | `deterministic_projection` |
| GrowthMemory | `derived_memory` |
| Reflection | `unavailable` |
| CoachMemory | `unavailable` |

No adapter output is allowed to override Source of Truth.

## 6. Boundedness Result

PASS

Current limits:

```text
courses: 10
course nodes: 10
course evidence: 10
knowledge states: 20
weak topics: 10
strong topics: 10
recently reviewed: 5
growth memory items: 10
```

The new bounded adapter test creates 12 nodes and 12 evidence rows, then verifies only 10 are returned.

Evidence:

```text
backend/src/services/agentAdapters/courseKnowledgeAdapter.js:7-9
backend/src/services/agentAdapters/knowledgeStateAdapter.js:6-10
backend/test/agentProductAdapters.test.js:176-200
```

## 7. Security Result

PASS

- No adapter exposes a write API.
- No adapter accepts client-controlled identity; service identity comes from authenticated `req.userId`.
- SQL queries remain user-bound.
- Course evidence output is allowlisted and text-bounded.
- Reflection and CoachMemory cannot be inferred from behavior data.
- No LLM call is added.

## 8. Regression Result

PASS

```yaml
Backend: 113/113 PASS
Frontend: 590/590 PASS
Build: PASS
git diff --check: PASS
```

The LearningContext and Agent Insight contracts remain backward compatible. Existing tests continue to pass; only the Behavior source label was updated from `reflection_context_source` to the more accurate `sync.activity`.

## 9. Browser Smoke Result

PASS

```yaml
Desktop: 1920x1080
Mobile: 375x812
Pages: workbench / today / stats / goals / ai
Checks: 10/10 PASS
Console errors: 0
Page errors: 0
HTTP >= 400: 0
Horizontal overflow: 0
Context status: 200
Context readOnly: true
Context actionLevel: insight_only
Behavior source: sync.activity
Reflection available: false
GrowthMemory authority: derived_memory
CoachMemory available: false
Write permissions: []
Insights status: 200
Insight version: agent-insight-v1
Insight readOnly: true
```

## 10. Findings

### F-001 Sync Snapshot Is Still A Full Payload

Severity: Medium

Evidence:

```text
backend/src/services/agentAdapters/syncDataAdapter.js:16-31
```

The adapter centralizes Sync access and the output remains bounded, but the underlying `syncService.getData` still returns the full payload before projection.

Recommendation:

In a later additive phase, replace the snapshot with narrower Source of Truth queries or streaming projection without bypassing Sync.

### F-002 Course Evidence Includes Bounded Quotes

Severity: Low

Evidence:

```text
backend/src/services/agentAdapters/courseKnowledgeAdapter.js:26-37
backend/src/db/agentHomeContextModel.js:42-54
```

Evidence quotes are truncated to 220 characters. This is user-owned course evidence and is useful for evidence-backed insight, but Agent UI should display it carefully.

Recommendation:

When Agent Home UI is implemented, render evidence quotes as read-only evidence with explicit source labels.

## 11. Freeze Decision

There are no Critical or High findings. Architecture, boundary, isolation, source authority, security, regression and browser checks passed.

```text
PHASE 27.2.2: READY_TO_FREEZE
NEXT: PHASE 27.3 AGENT HOME UI FOUNDATION
```
