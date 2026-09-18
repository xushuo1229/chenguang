# Phase 27.1 Context Boundary Remediation

Date: 2026-09-18

Phase: 27.1 Agent Context Builder

Status: ARCHITECTURE REMEDIATION DEFINED

## 1. Problem Statement

The independent re-audit found that `reflections.todaySummary` in the current uncommitted Agent Context implementation was populated by `ReflectionContextSource`. That source deterministically summarizes behavior data such as tasks, focus and streaks. It does not read user-authored Reflection records.

As a result, the LearningContext contract mixed two different concepts:

1. Behavior Summary — deterministic observation of what the user did.
2. Reflection — user-authored learning feedback.

The implementation also lacked explicit authority metadata for GrowthMemory and CoachMemory. This made it possible for a future Agent to treat a derived behavior projection as user Reflection, which would violate the Source of Truth boundary.

This document defines the remediation architecture. It does not authorize Phase 27.2.

## 2. Final Boundary Definitions

### 2.1 Reflection

Reflection means user-initiated learning feedback.

Valid examples:

- user-written daily summary;
- reported learning difficulty;
- mood or energy feedback;
- self-assessment;
- answer to a reflection prompt;
- user-approved corrective insight.

Reflection Source of Truth:

```text
Reflection Storage
```

Rules:

1. Reflection must originate from explicit user input or user-confirmed feedback.
2. Reflection must not be inferred from task completion, focus duration, check-ins or course activity.
3. Behavior Summary must never be presented as Reflection.
4. Agent Context may read Reflection only through a bounded, user-isolated Reflection adapter.
5. Agent Context must never write Reflection.

Current backend status:

```text
No backend Reflection Storage adapter is currently available to Agent Context.
```

Therefore the remediated Agent Context must mark Reflection as unavailable rather than substituting behavior data.

### 2.2 Behavior Summary

Behavior Summary means a deterministic projection of observed user activity.

Allowed sources:

- `todos`;
- `checkins`;
- `focus`;
- courses;
- learning activities;
- activity logs.

Purpose:

- today's learning state;
- completion and focus statistics;
- streaks;
- short-term trends;
- deterministic context for explanation.

Rules:

1. Behavior Summary is factual derived data.
2. It may explain what happened.
3. It must not claim what the user thought or felt.
4. It must be clearly distinguished from Reflection.
5. It must be read-only, bounded and user-isolated.

### 2.3 GrowthMemory

GrowthMemory means long-term, relatively stable growth context.

Valid examples:

- persistent study habits;
- long-term strengths;
- recurring difficulties;
- confirmed milestones;
- durable preferences related to growth.

Current Source:

```text
CGStore user.memory
```

Current authority:

```text
Derived Memory
```

Rules:

1. GrowthMemory is not a primary behavior database.
2. GrowthMemory is not a substitute for Analytics.
3. GrowthMemory is not a substitute for Course Space or Student Knowledge State.
4. GrowthMemory may provide context only when its authority is explicit.
5. Until provenance is available, GrowthMemory must be classified as `derived_memory`.
6. GrowthMemory must not override deterministic behavior facts, Course Knowledge, Knowledge State or Reflection.
7. Agent Context must not create, update, delete or promote GrowthMemory entries.

Update path:

```text
Learning behavior / user confirmation / existing growth flows
        ↓
GrowthMemory update flow
        ↓
CGStore user.memory
        ↓
bounded Agent Context projection
```

The Agent Context Builder is only the final read-only projection step.

### 2.4 CoachMemory

CoachMemory means AI interaction context.

Valid examples:

- recent discussion topic;
- prior suggestion;
- user preference expressed during coaching;
- current coaching state;
- pending clarification.

Current Source:

```text
Browser localStorage: cg_ai_coach_memory_v1
```

Authority:

```text
Interaction Context
```

Rules:

1. CoachMemory is not a fact database.
2. CoachMemory cannot define mastery, knowledge state or behavior truth.
3. CoachMemory cannot override Reflection or Behavior Summary.
4. CoachMemory must not be copied into CGStore as GrowthMemory.
5. A future backend CoachMemory adapter must be user-isolated and bounded.
6. Until such an adapter exists, Agent Context must mark CoachMemory unavailable.

## 3. LearningContext v1 Remediated Contract

Because `learning-context-v1` has not been frozen or committed, this is a pre-freeze contract correction rather than a runtime breaking change.

Every meaningful context group must carry four boundary fields:

| Field | Meaning |
| --- | --- |
| `source` | canonical system or adapter that produced the value |
| `authority` | fact, deterministic projection, derived memory, interaction context or unavailable |
| `type` | semantic data type |
| `confidence` | explicit confidence; deterministic source data uses `1` |

Recommended envelope shape:

```json
{
  "version": "learning-context-v1",
  "generatedAt": "2026-09-18T00:00:00.000Z",
  "userId": 1,
  "readOnly": true,
  "actionLevel": "insight_only",
  "courses": {
    "value": [],
    "source": "cgstore.sync.courses",
    "authority": "source",
    "type": "source_projection",
    "confidence": 1
  },
  "behavior": {
    "value": {
      "today": "2026-09-18",
      "taskSummary": {},
      "focusSummary": {},
      "streaks": {},
      "goals": {}
    },
    "source": "reflection_context_source",
    "authority": "deterministic_projection",
    "type": "behavior_summary",
    "confidence": 1
  },
  "courseKnowledge": {
    "value": { "nodes": [] },
    "source": "course_space.nodes",
    "authority": "source",
    "type": "course_knowledge_projection",
    "confidence": 1
  },
  "knowledgeStates": {
    "value": { "weakTopics": [], "strongTopics": [], "recentlyReviewed": [] },
    "source": "student_knowledge_states",
    "authority": "source",
    "type": "student_knowledge_state_projection",
    "confidence": 1
  },
  "reflections": {
    "value": {
      "available": false,
      "reason": "reflection_storage_adapter_not_available"
    },
    "source": "reflection_storage",
    "authority": "unavailable",
    "type": "user_reflection",
    "confidence": 0
  },
  "memories": {
    "growth": {
      "value": { "available": false, "items": [] },
      "source": "cgstore.user.memory",
      "authority": "derived_memory",
      "type": "growth_memory_projection",
      "confidence": 0.5
    },
    "coach": {
      "value": {
        "available": false,
        "reason": "client_side_memory_not_available_to_backend"
      },
      "source": "coach_memory",
      "authority": "unavailable",
      "type": "interaction_context",
      "confidence": 0
    }
  },
  "permissions": {
    "read": [
      "course_knowledge",
      "student_knowledge_state",
      "behavior_summary",
      "growth_memory_projection"
    ],
    "write": []
  }
}
```

The exact response may remain a compact projection, but it must include metadata sufficient to distinguish the groups above. A parallel field descriptor map is acceptable if wrapping every value is too verbose, provided no field can be interpreted without its source and authority.

## 4. Required Field Corrections

### 4.1 Remove Behavior From Reflection

The remediated implementation must not place `ReflectionContextSource` output under `reflections.todaySummary`.

Behavior summary belongs under:

```text
behavior
```

or remains solely under:

```text
learningHistory
```

provided `learningHistory` is explicitly typed as a behavior summary.

### 4.2 Reflection Becomes Explicitly Unavailable

Until a backend Reflection Storage adapter exists:

```json
{
  "reflections": {
    "available": false,
    "reason": "reflection_storage_adapter_not_available"
  }
}
```

No behavior summary, streak or completion statistic may be substituted.

### 4.3 LearningHistory Must Be Typed

`learningHistory` may continue to expose deterministic task, focus, streak and goal summaries, but its metadata must identify it as:

```text
source: reflection_context_source
authority: deterministic_projection
type: behavior_summary
```

### 4.4 GrowthMemory Must Be Authority-Tagged

GrowthMemory entries may be projected from CGStore `user.memory`, but the group must be marked:

```text
source: cgstore.user.memory
authority: derived_memory
type: growth_memory_projection
```

If individual memory provenance later becomes available, its authority may be refined without changing the group boundary.

### 4.5 CoachMemory Remains Unavailable

CoachMemory remains:

```text
available: false
```

until a bounded server-side CoachMemory adapter is separately designed and implemented.

## 5. Implementation Decision

Code modification is required before Phase 27.1 can be frozen.

Required changes:

1. Update `backend/src/services/agentHomeService.js` to implement the remediated boundary.
2. Stop exposing behavior data as Reflection.
3. Add source / authority / type / confidence metadata.
4. Keep reads bounded and user-isolated.
5. Update `backend/test/agentHomeContext.test.js` to assert that Reflection is unavailable and that behavior summary is not labeled Reflection.
6. Update `docs/PHASE_27_1_AGENT_CONTEXT_BUILDER_FINAL.md` to describe the corrected contract.

Not allowed in the remediation:

1. Creating Reflection Storage.
2. Creating a server-side CoachMemory store.
3. Creating a second Analytics engine.
4. Modifying CGStore.
5. Modifying Analytics.
6. Modifying Goals.
7. Modifying Sync.
8. Modifying GrowthMemory update logic.
9. Introducing Agent, Planner, Tutor or Autonomous Action.

The smallest safe implementation is therefore a read-layer contract correction, not a data migration.

## 6. Validation Checklist

After implementation, the following must pass:

```yaml
Backend: all tests PASS
Frontend: all tests PASS
Build: PASS
git diff --check: PASS
Browser Desktop 1920x1080: PASS
Browser Mobile 375x812: PASS
Agent Context API: learning-context-v1
readOnly: true
actionLevel: insight_only
Reflection: unavailable
Behavior Summary: separate from Reflection
GrowthMemory: derived_memory
CoachMemory: unavailable
```

## 7. Freeze Decision

Phase 27.1 is not ready to refreeze yet.

It may be re-audited for freeze only after:

1. This boundary remediation is implemented.
2. Tests explicitly cover the corrected Reflection / Behavior / GrowthMemory / CoachMemory boundaries.
3. The implementation is committed as a focused Phase 27.1 baseline.
4. A fresh independent re-audit runs against that commit.

Until then:

```text
PHASE 27.1: NOT_READY_TO_FREEZE
PHASE 27.2: BLOCKED
```
