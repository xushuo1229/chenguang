# Phase 27.5 Reasoning Implementation Plan

Date: 2026-09-18

Status: PLAN_APPROVED_FOR_IMPLEMENTATION

## 1. Current Architecture Review

### Context Boundary

`learning-context-v1` is assembled by `backend/src/services/agentHomeService.js`. It derives ownership from `req.userId`, exposes `readOnly: true`, and returns `permissions.write: []`.

Adapter boundaries are authority-tagged:

```text
behavior: deterministic_projection
courseKnowledge: source
knowledgeStates: source
growthMemory: derived_memory
reflection: unavailable
```

### Evidence Boundary

`agent-insight-v1` is produced by `backend/src/services/agentInsights/insightEngine.js`. Every insight must contain at least one evidence item. Evidence is bounded and normalized with source, authority, metric, period, and value.

### Memory Boundary

GrowthMemory remains a `derived_memory` projection. CoachMemory remains unavailable to the backend reasoning path. Reflection remains unavailable and is never replaced by behavior data.

### API Boundary

`GET /api/agent-home/context` and `GET /api/agent-home/insights` are authenticated and read-only. A new reasoning endpoint may reuse this same ownership and context assembly path.

## 2. Design Decision

Phase 27.5 will implement deterministic reasoning first. It will not call an LLM. This provides a safe explanation layer without prompt injection, provider cost, or invented facts.

The Reasoning Layer will consume only:

```text
learning-context-v1
agent-insight-v1
```

It will not read databases, request objects, provider clients, or raw user data.

## 3. Implementation Scope

| File | Responsibility |
| --- | --- |
| `backend/src/services/agentReasoning/reasoningContract.js` | Validate and normalize `agent-reasoning-v1` |
| `backend/src/services/agentReasoning/reasoningEngine.js` | Build deterministic explanations from insights |
| `backend/src/services/agentReasoning/reasoningRules.js` | Pure per-type explanation rules |
| `backend/src/services/agentReasoning/fallback.js` | Build safe fallback payloads |
| `backend/src/routes/agentHome.js` | Add `GET /api/agent-home/reasoning` |
| `js/apiClient.js` | Add one Agent Home reasoning client method |
| `js/agentHomeService.js` | Validate reasoning and apply frontend fallback |
| `js/agentHomeView.js` | Render Reasoning Explanation card |

## 4. Data Flow

```text
learning-context-v1
    -> agent-insight-v1
    -> agent-reasoning-v1
    -> Agent Home UI
```

Reasoning cannot generate new facts. Every explanation must reference at least one evidence item from its source insight.

## 5. Safety Rules

- action level remains `insight_only`;
- permissions.write remains empty;
- confidence remains between 0 and 1;
- missing insights produce no explanation;
- invalid provider-like content is rejected;
- no chat, Planner, Tutor, RAG, tool execution, or autonomous workflow is introduced.

## 6. Test Plan

### Backend

- contract schema validation;
- deterministic reasoning output;
- evidence reference requirement;
- confidence bounds;
- empty insight fallback;
- context and insight version rejection;
- user ownership and API authentication;
- no mutation and empty write permissions.

### Frontend

- reasoning rendering;
- fallback rendering;
- malformed reasoning rejection;
- no action controls.

### Validation

Run backend tests, frontend tests, build, and browser smoke at 1920x1080 and 375x812.

## 7. Non-Goals

No LLM provider integration, RAG, memory system, Agent loop, Planner, Tutor, or data mutation will be added in this phase.

## 8. Final Status

PLAN_APPROVED_FOR_IMPLEMENTATION
