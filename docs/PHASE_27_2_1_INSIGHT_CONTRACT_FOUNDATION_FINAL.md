# Phase 27.2.1 Insight Contract Foundation Final

Date: 2026-09-18

Status: READY_FOR_INDEPENDENT_REAUDIT

## 1. Objective

This phase implements the deterministic Agent Insight contract defined by Phase 27.2.

It does not implement Agent Home UI, LLM reasoning, Planner, Tutor, RAG, vector database or autonomous action.

## 2. Contract

New Insight contract:

```text
agent-insight-v1
```

Output shape:

```json
{
  "version": "agent-insight-v1",
  "generatedAt": "2026-09-18T00:00:00.000Z",
  "userId": 1,
  "scope": "agent_home",
  "insights": [],
  "metadata": {
    "readOnly": true,
    "actionLevel": "insight_only",
    "contextVersion": "learning-context-v1"
  }
}
```

Every insight contains:

```text
id / kind / headline / explanation / evidence / confidence / recommended_actions
```

Every evidence item contains:

```text
source / authority / field / value / comparison
```

Only `review` and `navigate` action types are allowed. No mutation command is emitted.

## 3. Deterministic Insight Rules

### Behavior Summary

If the LearningContext contains a `behavior_summary` with task totals, the service emits one task completion insight.

Evidence:

```text
source: learning_context.behavior
authority: deterministic_projection
field: taskSummary.completed
```

### Knowledge State

For up to three weak topics, the service emits one Knowledge State insight per topic.

Evidence:

```text
source: student_knowledge_states
authority: source
field: weakTopics[index].masteryLevel
```

Confidence comes from the Knowledge State record and is bounded to `0..1`.

## 4. Read API

New endpoint:

```text
GET /api/agent-home/insights
```

Behavior:

1. requires authentication;
2. builds the current user's bounded LearningContext;
3. converts LearningContext into `agent-insight-v1`;
4. performs no mutation;
5. rejects invalid or writable LearningContext.

## 5. Files Changed

| File | Change |
| --- | --- |
| `backend/src/services/agentInsightService.js` | Deterministic Insight contract service |
| `backend/src/routes/agentHome.js` | Add authenticated read-only Insights endpoint |
| `backend/test/agentInsight.test.js` | Contract, evidence, confidence and safety tests |
| `docs/PHASE_27_2_1_INSIGHT_CONTRACT_FOUNDATION_FINAL.md` | This document |

## 6. Boundary Rules

- Analytics remains the statistical Source of Truth.
- Reflection remains unavailable.
- GrowthMemory remains `derived_memory`.
- CoachMemory remains unavailable.
- Knowledge State remains read-only.
- Agent Home remains Action Level 0.
- No UI is implemented in this phase.

## 7. Validation

```yaml
Backend: 107/107 PASS
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
Insights API: 200
Insight version: agent-insight-v1
Scope: agent_home
readOnly: true
actionLevel: insight_only
contextVersion: learning-context-v1
Empty-state insight count: 0
All non-empty insights evidence-backed: true
Allowed actions only: true
```
