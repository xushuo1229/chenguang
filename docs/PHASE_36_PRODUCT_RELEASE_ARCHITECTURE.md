# Phase 36 Product Release Architecture

Status: RELEASE_CONTRACT

Baseline: `f2bcb19 docs: freeze phase 35 agent hardening`

## 1. Release Scope

Personal Learning Agent 2.0 includes:

```text
Course Knowledge / Evidence
  → Query Understanding
  → Context Selection
  → Context Firewall
  → Deterministic Reasoning
  → Learning Conversation
  → Assessment / Practice
  → Student Knowledge State
  → Adaptive Review
  → Learning Planner
  → Action Proposal
  → User Confirmation
  → Feedback
  → Learning Effectiveness
```

This phase adds no product code. It verifies the frozen release candidate.

## 2. Release Gates

| Gate | Requirement |
| --- | --- |
| Product UX | Journey, empty/error, accessibility, responsive and cancel controls validated |
| Learning effectiveness | Deterministic observable metrics; unavailable data disclosed |
| Data integrity | Practice, assessment and evidence writes remain atomic |
| Security | Authentication, authorization, confirmation, replay/expiry and provider boundaries hold |
| Regression | Frontend, backend, build and focused E2E smoke pass |
| Privacy | No provider/stack/secret leakage; user data remains owner-scoped |

## 3. Authority Model

```text
System facts
  > deterministic analytics
  > course knowledge
  > student state
  > evidence
  > insight
  > reasoning
  > user input
  > LLM content
```

The LLM remains an explanation layer and cannot mutate Todo, Goal, Course, Knowledge, State or Action records.

## 4. Release Boundary

- No React, Vue, Tailwind or Docker migration.
- No second store or effectiveness persistence table.
- No autonomous action.
- No memory writer or agent tool mutation.
- No hidden provider dependency.

## 5. Known Non-Blocking Low

Post-review improvement compares assessment attempts around completed review-action timestamps. It does not yet use a dedicated review-attempt event type. The metric exposes explicit provenance and remains non-blocking.
