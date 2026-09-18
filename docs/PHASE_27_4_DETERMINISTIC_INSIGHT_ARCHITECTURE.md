# Phase 27.4 Deterministic Insight Layer Architecture

Date: 2026-09-18

Status: ARCHITECTURE_READY

## 1. Baseline

- Phase 27.3 implementation: 483aa73 feat: add agent home ui foundation
- Phase 27.3 freeze: 7be7a2f docs: freeze phase 27.3 agent home ui foundation
- Agent Context Contract: learning-context-v1
- Agent Insight Contract: agent-insight-v1

## 2. Objective

Phase 27.4 will strengthen the existing deterministic insight path so Agent Home can produce more useful observations without introducing an LLM reasoning loop.

The layer must remain:

- read-only;
- evidence-backed;
- deterministic;
- bounded;
- user isolated;
- safe for future Agent productization.

## 3. Non-Goals

Phase 27.4 must not introduce:

- Planner;
- Tutor;
- chat;
- autonomous action;
- goal mutation;
- todo mutation;
- knowledge-state mutation;
- a second memory system;
- a vector database;
- black-box mastery scoring.

## 4. Architecture Position

Text flow:

Agent Context Layer
    -> Deterministic Insight Layer
    -> agent-insight-v1 payload
    -> Agent Home UI

The insight layer may read only the validated learning-context-v1 object. It must not query databases directly and must not depend on request, session, or global mutable state.

## 5. Design Rules

1. Every insight must have a stable id.
2. Every insight must include at least one evidence item.
3. Every evidence item must identify source, authority, field, and value.
4. Confidence must be finite and between 0 and 1.
5. Text length and result count must be bounded.
6. Missing data must produce no insight, not an inferred insight.
7. Recommended action types remain limited to review and navigate.
8. Output must remain compatible with agent-insight-v1.

## 6. Initial Rule Set

Phase 27.4 may add only deterministic rules derived from existing context:

| Rule | Input | Output | Condition |
| --- | --- | --- | --- |
| task-completion | behavior.taskSummary | completion observation | total > 0 |
| weak-knowledge | knowledgeStates.weakTopics | review observation | non-empty topics |
| strong-knowledge | knowledgeStates.strongTopics | reinforcement observation | non-empty topics |
| focus-summary | behavior.focusSummary | focus observation | today focus is available |

No rule may claim a trend without an explicit multi-period field already present in context.

## 7. Contract Compatibility

The current required fields remain unchanged:

- version
- generatedAt
- userId
- scope
- insights
- metadata

Future additions must be additive optional fields. Existing consumers must continue to work when unknown fields are ignored.

## 8. Recommended Implementation Boundary

The implementation should remain inside the existing Agent Insight service path or a small additive rule module. It must continue to receive learning-context-v1 and return agent-insight-v1.

It must not add a new public API.

## 9. Test Plan

Required tests:

1. deterministic output for the same context;
2. stable insight IDs;
3. evidence required for every insight;
4. confidence bounds;
5. bounded text and result count;
6. no insight when data is absent;
7. action types remain review or navigate;
8. writable context is rejected;
9. malformed context is rejected;
10. Agent Home renders new insights without action controls.

## 10. Risks

| Risk | Control |
| --- | --- |
| Fabricated conclusions | Evidence-backed rules only |
| Trend overstatement | No trend claim without explicit multi-period data |
| Result explosion | Maximum ten insights |
| UI becoming actionable | Continue rejecting non-review and non-navigate actions |
| Contract drift | Additive fields only and full frontend/backend regression |

## 11. Entry Criteria

Implementation may start only when:

- Phase 27.3 remains frozen;
- learning-context-v1 is unchanged;
- agent-insight-v1 remains read-only;
- tests cover all rules and boundary cases;
- browser validation shows no new console, page, HTTP, or layout errors.

## 12. Final Status

ARCHITECTURE_READY
