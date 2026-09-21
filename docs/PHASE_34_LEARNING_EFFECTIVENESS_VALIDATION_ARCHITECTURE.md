# Phase 34 Learning Effectiveness Validation Architecture

Status: IMPLEMENTATION_CONTRACT

Baseline: `1a0e97e docs: freeze phase 33 product experience validation`

## 1. Goal

Measure whether the Personal Learning Agent helps learning using deterministic, observable records.

The system must not create an AI Learning Score and must not allow a language model to evaluate its own teaching quality.

## 2. Learning Loop

```text
Initial state
  → Practice / Assessment
  → Mastery evidence
  → Review
  → Repeated assessment
  → Deterministic comparison
```

## 3. Data Boundary

Inputs are bounded projections of existing records:

```text
student_practice_attempts
student_knowledge_evidence
learning_action_proposals
```

Outputs are read-only metrics. The endpoint must be authenticated, course-owned and bounded by a time window.

## 4. Metric Contract

| Metric | Source | Definition | Missing-data behavior |
| --- | --- | --- | --- |
| Practice completion rate | learning_action_proposals | Completed assessment actions / non-dismissed assessment actions | `unavailable` when denominator is zero |
| Assessment accuracy | student_practice_attempts | Average score of assessment attempts | `unavailable` when no attempts |
| Repeated error rate | student_practice_attempts | Consecutive assessment scores below 0.5 / assessment sequences with a prior score | `unavailable` when no comparable sequence |
| Mastery improvement | student_practice_attempts | Average latest-minus-earliest score per node | `unavailable` when no node has two or more scores |
| Review completion rate | learning_action_proposals | Completed review actions / non-dismissed review actions | `unavailable` when denominator is zero |
| Post-review improvement | completed review actions + attempts | Average after-review score minus before-review score per reviewed node | `unavailable` when no reviewed node has both sides |
| Learning continuity | student_practice_attempts | Active days / days in the bounded window | `unavailable` when no attempts |

Every available metric contains its denominator or comparison count. Every unavailable metric returns a reason and `value: null`.

## 5. Trust Rules

- Scores are facts recorded after user-confirmed practice or assessment.
- Action statuses are facts from explicit user completion.
- The service never estimates missing attempts.
- LLM output is not an input.
- Metrics do not mutate user data.

## 6. API

```text
GET /api/learning/effectiveness/:courseId?days=30
```

`days` is bounded to 1–365. The response exposes the window, metric provenance and read-only metadata.

## 7. Non-Goals

- No new effectiveness table.
- No AI self-assessment.
- No synthetic data in production metrics.
- No automatic plan mutation.
