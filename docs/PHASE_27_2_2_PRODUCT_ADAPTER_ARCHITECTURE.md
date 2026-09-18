# Phase 27.2.2 Product Adapter Architecture

Date: 2026-09-18

Baseline:

```text
76a7822 docs: freeze phase 27.2.1 agent insight foundation
420b09a feat: add agent insight contract foundation
```

Status: READY_FOR_COMMIT

## 1. Objective

Phase 27.2.2 establishes a bounded read-only adapter layer between existing systems and the Agent Product Layer.

The adapters prepare existing data for `agent-insight-v1`. They do not create a second data system, do not copy business logic, and do not mutate Source of Truth.

## 2. Adapter Boundary

```text
CGStore / Sync
Course Space
Student Knowledge State
        ↓
Agent Product Adapters
        ↓
LearningContext v1
        ↓
Agent Insight v1
```

`Agent Home Service` no longer reads the database or Sync Service directly. It only composes adapter output.

Implemented adapters:

| Adapter | Source | Authority | Output |
| --- | --- | --- | --- |
| `behaviorAdapter` | `sync.activity` | `deterministic_projection` | `BehaviorSummary` |
| `courseKnowledgeAdapter` | Course Space | `source` | `CourseKnowledgeSummary` |
| `knowledgeStateAdapter` | Student Knowledge State | `source` | `KnowledgeStateSummary` |
| `growthMemoryAdapter` | CGStore `user.memory` | `derived_memory` | `GrowthMemoryProjection` |
| `reflectionAdapter` | Reflection Storage | `unavailable` | explicit unavailable state |

An internal `syncDataAdapter` loads the current user's Sync payload once for behavior and growth-memory projection. It is not a public product concept and does not expose write capability.

## 3. Unified Adapter Contract

Every adapter returns:

```json
{
  "adapter": "behavior",
  "version": "adapter-v1",
  "source": "sync.activity",
  "authority": "deterministic_projection",
  "type": "behavior_summary",
  "data": {},
  "confidence": 1,
  "readOnly": true
}
```

Rules:

1. `source` must identify the real originating system.
2. `authority` must distinguish source, deterministic projection, derived memory and unavailable data.
3. `confidence` must be finite and between 0 and 1.
4. `readOnly` must always be true.
5. Adapter data must be bounded.

## 4. Adapter Responsibilities

### Behavior Adapter

Reads activity data through the existing deterministic projection helpers and outputs:

```text
courses / today / taskSummary / focusSummary / streaks / goals / risks / trend
```

It never outputs Reflection.

### Course Knowledge Adapter

Reads bounded Course Space nodes and evidence.

Current limits:

```text
nodes: 10
evidence: 10
```

It does not modify Course Space.

### Student Knowledge Adapter

Reads user-owned Knowledge State rows and outputs:

```text
weakTopics / strongTopics / recentlyReviewed
```

It does not recalculate mastery or write evidence.

### Growth Memory Adapter

Reads CGStore `user.memory` and outputs a bounded projection.

Authority remains:

```text
derived_memory
```

It cannot update, delete or promote memory.

### Reflection Adapter

No backend Reflection Storage exists. The adapter therefore returns:

```json
{
  "available": false,
  "reason": "reflection_storage_adapter_not_available"
}
```

Behavior Summary is never used as Reflection.

## 5. Source Of Truth

| Data | Source of Truth |
| --- | --- |
| Course / Document / Node / Evidence | Course Space |
| Mastery / confidence / state | Student Knowledge State |
| Behavior statistics | Activity data through deterministic projection |
| Long-term memory | CGStore `user.memory` as derived memory |
| User Reflection | Reflection Storage (not yet implemented) |
| Coach interaction | Browser-side CoachMemory (not backend-readable) |

Adapters project these systems; they never replace them.

## 6. Data Flow

```text
Agent Home Service
    ↓
syncDataAdapter
    ↓
behaviorAdapter + growthMemoryAdapter

Agent Home Service
    ↓
courseKnowledgeAdapter

Agent Home Service
    ↓
knowledgeStateAdapter

Agent Home Service
    ↓
reflectionAdapter
    ↓
LearningContext v1
    ↓
Agent Insight v1
```

The composed LearningContext contract remains backward compatible:

```text
value / source / authority / type / confidence
```

## 7. Permission Model

Adapters accept only the authenticated service-owned `userId`.

Allowed:

```text
read current-user Course Knowledge
read current-user Knowledge State
read current-user behavior summary
read current-user GrowthMemory projection
return Reflection unavailable
```

Forbidden:

```text
write Course Space
write Knowledge State
write Evidence
write Mastery
write GrowthMemory
write Reflection
read another user's data
call LLM
execute action
```

The composed context continues to expose:

```json
{
  "readOnly": true,
  "actionLevel": "insight_only",
  "permissions": {
    "write": []
  }
}
```

## 8. Future Agent Compatibility

This adapter layer prepares a future Agent without giving it authority over user data.

Future Agent may:

1. consume adapter-backed LearningContext;
2. explain evidence;
3. summarize state;
4. suggest review or navigation.

Future Agent may not:

1. bypass adapters;
2. treat GrowthMemory as fact;
3. treat CoachMemory as fact;
4. treat Behavior Summary as Reflection;
5. mutate Course, Knowledge State, Goal, Memory or Reflection data.

## 9. Testing Strategy

Adapter tests cover:

1. authority metadata;
2. adapter contract version;
3. read-only flag;
4. cross-user isolation;
5. empty data;
6. bounded nodes and evidence;
7. Reflection unavailable;
8. GrowthMemory derived authority;
9. Knowledge State read-only boundary;
10. invalid user identity rejection.

## 10. Final Status

```text
PHASE 27.2.2: READY_FOR_COMMIT
```

## 11. Validation

```yaml
Backend: 113/113 PASS
Frontend: 590/590 PASS
Build: PASS
git diff --check: PASS
Browser Desktop 1920x1080: PASS
Browser Mobile 375x812: PASS
Pages: workbench / today / stats / goals / ai
Console errors: 0
Page errors: 0
HTTP >= 400: 0
Horizontal overflow: 0
Context version: learning-context-v1
Context readOnly: true
Context actionLevel: insight_only
Behavior source: sync.activity
Reflection available: false
GrowthMemory authority: derived_memory
CoachMemory available: false
Write permissions: []
Insights API: agent-insight-v1 / readOnly=true
```
