# Phase 27.2.1 Agent Insight Re-Audit

Date: 2026-09-18

Implementation commit: `420b09a feat: add agent insight contract foundation`

Final verdict: READY_TO_FREEZE

## 1. Scope

This audit reviewed the committed deterministic Insight Contract Foundation:

```text
backend/src/services/agentInsightService.js
backend/src/routes/agentHome.js
backend/test/agentInsight.test.js
docs/PHASE_27_2_1_INSIGHT_CONTRACT_FOUNDATION_FINAL.md
```

## 2. Architecture Result

PASS

The implementation creates `agent-insight-v1` above the frozen `learning-context-v1` contract.

It does not introduce:

1. Planner;
2. Tutor;
3. Agent chat;
4. LLM reasoning;
5. RAG or vector database;
6. autonomous action;
7. UI.

The service rejects a LearningContext that is missing, version-mismatched or writable.

## 3. Insight Contract Result

PASS

The response includes:

```text
version / generatedAt / userId / scope / insights / metadata
```

Insight metadata is fixed to:

```text
readOnly: true
actionLevel: insight_only
contextVersion: learning-context-v1
```

Every emitted insight contains evidence. Confidence is bounded to `0..1`. Actions are restricted to `review` and `navigate`.

## 4. Data Authority Result

PASS

Behavior insights are derived from:

```text
learning_context.behavior
authority: deterministic_projection
type: behavior_summary
```

Knowledge insights are derived from:

```text
student_knowledge_states
authority: source
```

The service does not read raw todos or raw Knowledge State rows. It does not recalculate mastery and does not write any user data.

## 5. Security Result

PASS

The endpoint is:

```text
GET /api/agent-home/insights
```

It is protected by `authRequired`, uses `req.userId`, and performs no write operation. Existing LearningContext user isolation and bounded queries remain unchanged.

## 6. Regression Result

PASS

```yaml
Backend: 107/107 PASS
Frontend: 590/590 PASS
Build: PASS
git diff --check: PASS
```

No existing test was modified or weakened.

## 7. Browser Smoke Result

PASS

```yaml
Desktop: 1920x1080
Mobile: 375x812
Pages: 5
Checks: 10/10 PASS
Console errors: 0
Page errors: 0
HTTP >= 400: 0
Horizontal overflow: 0
Insights status: 200
Insight version: agent-insight-v1
Empty-state insight count: 0
Evidence-backed check: true
Allowed-actions-only check: true
```

The empty result is correct for a new smoke user with no tasks or Knowledge State records.

## 8. Findings

### F-001 Insight Rules Are Currently Minimal

Severity: Low

Evidence:

```text
backend/src/services/agentInsightService.js
```

Only task completion and weak Knowledge State rules are implemented. This is intentional for the first contract phase and does not block freezing.

Recommendation:

Add more deterministic rules only after bounded Analytics and Adapter foundations are implemented.

### F-002 Insights Are Ephemeral

Severity: Low

Evidence:

```text
backend/src/services/agentInsightService.js
backend/src/routes/agentHome.js
```

Insights are generated on request and not persisted. This avoids creating a second source of truth.

Recommendation:

Keep insights derived until a later phase explicitly requires auditable snapshot history.

## 9. Freeze Decision

There are no Critical or High findings. Architecture, data authority, security, tests, build and browser checks passed.

```text
PHASE 27.2.1: READY_TO_FREEZE
NEXT: PHASE 27.2.2 BOUNDED PRODUCT ADAPTERS
```
