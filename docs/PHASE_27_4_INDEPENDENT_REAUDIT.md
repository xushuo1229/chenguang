# Phase 27.4 Independent Re-Audit

Date: 2026-09-18

## Audit Result

READY_TO_FREEZE

## Baseline

Implementation: 55b6314 feat: add deterministic insight engine

Architecture: ab4cef4 docs: architect phase 27.4 deterministic insights

Previous freeze: 7be7a2f docs: freeze phase 27.3 agent home ui foundation

## Scope

This audit reviewed:

- `backend/src/services/agentInsights/insightEngine.js`
- `backend/src/services/agentInsights/ruleSupport.js`
- the four deterministic rule modules
- Behavior Adapter recent-seven-day projection
- Agent Insight API
- Agent Home frontend rendering and contract validation
- backend and frontend tests

## Architecture Review

PASS

The engine consumes a validated `learning-context-v1` object and dispatches each rule to the matching Adapter boundary at `backend/src/services/agentInsights/insightEngine.js:18-23` and `61-78`. It rejects missing, writable, or malformed context at `backend/src/services/agentInsights/insightEngine.js:61-67`.

The four rules are pure functions:

- Focus Trend
- Learning Consistency
- Knowledge Gap
- Course Progress

There is no LLM reasoning, Planner, Tutor, chat, autonomous workflow, command execution, or data mutation.

## Determinism Review

PASS

The same Adapter context produces the same insight set. The only non-deterministic envelope field is `generatedAt`; insight content is deterministic. The backend test compares the full normalized insight arrays across two invocations and ignores only `generatedAt`.

Each rule has a stable ID and emits `null` when its evidence is absent. No random values or black-box scores are used.

## Evidence Review

PASS

Every insight must contain at least one evidence item. Evidence is normalized with source, authority, metric, period, value, and a backward-compatible `field` alias. The rule support enforces confidence `1` and `actionLevel: insight_only` at `backend/src/services/agentInsights/ruleSupport.js:70-71`.

The engine strips any missing-evidence insight and limits output to ten items at `backend/src/services/agentInsights/insightEngine.js:15` and `72`.

## Boundary Review

PASS

The implementation does not modify CGStore, Analytics, Goals, Sync, Course Space, Student Knowledge State, Reflection, GrowthMemory, or CoachMemory.

The engine does not access databases, requests, sessions, global mutable state, or AI providers. It reads only the Adapter boundaries already present in the learning context.

## Security Review

PASS

- The existing Agent Insight route remains authenticated at `backend/src/routes/agentHome.js:17-24`.
- Context ownership continues to come from `req.userId`.
- The engine preserves the caller-owned `userId` in the output.
- Adapter projections remain bounded and authority-tagged.
- The frontend rejects metadata action level other than `insight_only` at `js/agentHomeService.js:25-30`.
- The frontend continues to use `textContent`; the Agent Home root has no button or form controls, asserted at `tests/agentHomeUI.test.js:174-175`.

## Contract Review

PASS

The output remains `agent-insight-v1`. Canonical insight fields are:

```text
id
type
title
explanation
source
authority
evidence
confidence
actionLevel
```

`kind` and `headline` are retained as compatibility aliases. The legacy `recommended_actions` field is removed; no action or recommendation is generated.

## Regression Review

PASS

```yaml
Backend: 119/119 PASS
Frontend: 597/597 PASS
Build: PASS
git diff --check: PASS
```

## Browser Review

PASS

```yaml
Desktop 1920x1080: PASS
Mobile 375x812: PASS
Console errors: 0
Page errors: 0
HTTP >= 400: 0
Horizontal overflow: 0
Rendered sections: 5/5
```

## Findings

### L-001 Server-local day boundary

Severity: Low

Evidence: `backend/src/services/agentAdapters/behaviorAdapter.js:17-22` and `46-121`.

The seven-day projection uses the server-local date. If users cross time zones, the boundary may differ from the user's local day. This follows the existing Behavior Adapter pattern and is not a blocker.

Recommendation: In a future additive phase, pass an explicit user-local reference date through the context.

### L-002 Existing snapshot is linearly read

Severity: Low

Evidence: `backend/src/services/agentAdapters/behaviorAdapter.js:46-69`.

The new seven-day projection scans the focus and English arrays from the existing Sync snapshot. Output and date window are bounded, but source scan cost grows with history size. This is safe at current scale.

Recommendation: When data volume grows, add a bounded recent-activity projection or indexed date query.

## Final Verdict

READY_TO_FREEZE
