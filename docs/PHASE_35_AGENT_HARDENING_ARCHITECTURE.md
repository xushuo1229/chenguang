# Phase 35 Agent Hardening Architecture

Status: IMPLEMENTATION_CONTRACT

Baseline: `3bf1292 docs: freeze phase 34 learning effectiveness validation`

## 1. Goal

Harden the Personal Learning Agent data, action and security boundaries without changing existing API contracts.

## 2. Data Integrity

The legacy manual practice path must write the attempt and the corresponding knowledge-state evidence atomically.

```text
BEGIN
  → practice attempt
  → knowledge-state evidence
  → derived mastery state
COMMIT
```

A failure in any step must leave no orphan attempt.

## 3. Mastery Gate

The promotion gate must inspect explicit assessment evidence, not infer it from the final mastered state.

Requirements:

```text
mastery >= 0.75
AND assessmentEvidenceCount > 0
AND evidenceCount >= 2
```

The state projection exposes the assessment evidence count additively; legacy response fields remain unchanged.

## 4. Action Security

Action completion remains explicit and idempotent:

- Unconfirmed completion is rejected.
- Foreign proposals are invisible and rejected.
- Assessment completion requires assessment evidence.
- A completed proposal returns the same current state rather than mutating again.
- A proposal confirmed more than 24 hours ago expires and requires reconfirmation.
- Plan/block fingerprint mismatch remains rejected.

The 24-hour boundary is a security hardening threshold and does not alter the response schema.

## 5. Retained Boundaries

- CGStore, Analytics, Sync and Agent Core remain frozen.
- AI remains read-only.
- Provider output remains non-authoritative.
- No new persistence system is introduced.
- No action runs without explicit user confirmation.
