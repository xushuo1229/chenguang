# Phase 27.5 Reasoning Layer Architecture

Date: 2026-09-18

Status: ARCHITECTURE_READY

## 1. Baseline

- Deterministic Insight Engine: 55b6314 feat: add deterministic insight engine
- Independent audit: b69c852 docs: freeze phase 27.4 deterministic insights
- Context Contract: `learning-context-v1`
- Deterministic Insight Contract: `agent-insight-v1`

## 2. Objective

Phase 27.5 defines an optional Reasoning Layer that converts deterministic insights into user-facing explanations while preserving the deterministic facts as the only source of truth.

The layer is additive. It is not a replacement for the Insight Engine.

## 3. Non-Goals

The Reasoning Layer must not introduce:

- Autonomous Action;
- Planner;
- Tutor;
- Chat;
- tool execution;
- memory mutation;
- course mutation;
- knowledge-state mutation;
- goal mutation;
- todo mutation;
- new facts, metrics, mastery values, or trends not present in deterministic insights.

## 4. Architecture Position

```text
Product Adapters
    -> Agent Context Layer
    -> Deterministic Insight Layer
    -> Reasoning Layer
    -> Structured Explanation Contract
    -> Agent Home UI
```

The deterministic insight layer remains the factual boundary. The Reasoning Layer may only reorganize, explain, or summarize insights that already exist.

## 5. Core Principle

```text
Analytics / Adapters are facts.
Deterministic Insights are validated observations.
Reasoning is explanation.
The user controls action.
```

If AI reasoning is unavailable, malformed, or slow, Agent Home must continue to display deterministic insights without failure.

## 6. Reasoning Input

The Reasoning Layer may receive:

1. The validated `agent-insight-v1` payload;
2. authority and source metadata from the payload;
3. a bounded request scope such as `agent_home`;
4. explicit locale information.

It must not receive the full raw user database. It must not receive credentials, provider internals, system prompts from other features, or unrelated user content.

## 7. Proposed Contract

A future additive contract may be:

```json
{
  "version": "agent-reasoning-v1",
  "scope": "agent_home",
  "sourceInsightVersion": "agent-insight-v1",
  "summary": {},
  "explanations": [],
  "metadata": {
    "readOnly": true,
    "actionLevel": "insight_only"
  }
}
```

Each explanation should reference an existing insight ID and may include:

```text
insightId
narrative
evidenceRefs
confidence
```

The model must not generate new evidence values. `evidenceRefs` must point to evidence already present in the source insight.

## 8. Permission Boundary

The Reasoning Layer is read-only.

It may:

- explain;
- summarize;
- clarify;
- compare only facts already present in deterministic insights.

It must not:

- modify data;
- issue commands;
- recommend autonomous actions;
- create task plans;
- adjust mastery;
- decide on behalf of the user.

## 9. Prompt And Safety Design

The future prompt order must be:

```text
System Prompt
    -> Bounded Reasoning Task
    -> Output Schema
    -> Bounded Agent Insight Data
    -> User Locale Request
```

Required controls:

1. Data is labeled as data, never as instruction.
2. User-facing text must be safely rendered.
3. Output must validate against the schema.
4. Unknown fields are ignored.
5. The action level must remain `insight_only`.
6. Provider errors must return a generic user-safe failure.
7. Timeout and output token limits are mandatory.

## 10. API Direction

The current deterministic insight API remains unchanged.

A future implementation should add one bounded read-only endpoint, such as:

```text
GET /api/agent-home/reasoning
```

It must reuse authentication, user isolation, and bounded context assembly. It must not duplicate the deterministic insight engine.

## 11. Fallback Contract

When reasoning is unavailable:

```json
{
  "version": "agent-reasoning-v1",
  "available": false,
  "reason": "reasoning_unavailable",
  "metadata": {
    "readOnly": true,
    "actionLevel": "insight_only"
  }
}
```

Agent Home must then render deterministic insights as it does today.

## 12. Implementation Roadmap

### Phase 27.5.1 Reasoning Contract

Define and test `agent-reasoning-v1`, including fallback and schema validation.

### Phase 27.5.2 Reasoning Service

Implement a bounded service that accepts only `agent-insight-v1` and returns `agent-reasoning-v1`.

### Phase 27.5.3 API Integration

Add one authenticated, bounded, read-only endpoint with timeout and output limits.

### Phase 27.5.4 UI Enhancement

Show AI explanations only when valid. Continue showing deterministic insights when unavailable.

### Phase 27.5.5 Independent Audit And Freeze

Audit prompt injection, security, determinism fallback, boundedness, regression, and browser behavior.

## 13. Risks

| Risk | Control |
| --- | --- |
| AI invents facts | Source must be `agent-insight-v1`; evidence refs must resolve |
| Prompt injection | Context is data; strict schema; system priority |
| Hidden autonomous action | Only `insight_only` is accepted |
| Provider outage | Deterministic fallback is mandatory |
| Token explosion | Bounded insight input and output token limit |
| UX confusion | AI explanation must be visually distinct from deterministic fact |

## 14. Final Status

ARCHITECTURE_READY
