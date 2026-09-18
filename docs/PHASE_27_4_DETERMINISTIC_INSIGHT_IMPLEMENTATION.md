# Phase 27.4 Deterministic Insight Implementation

Date: 2026-09-18

Status: READY_FOR_REVIEW

## 1. Objective

Phase 27.4 adds a bounded deterministic Insight Engine between Agent Context and Agent Home UI. It converts Adapter projections into evidence-backed `agent-insight-v1` observations without LLM reasoning, Planner, Tutor, chat, or autonomous action.

## 2. Architecture

Text flow:

```text
Product Adapters
    -> learning-context-v1
    -> backend/src/services/agentInsights/insightEngine.js
    -> deterministic rules
    -> agent-insight-v1
    -> js/agentHomeService.js
    -> js/agentHomeView.js
```

The engine accepts only a validated `learning-context-v1` object. It does not access HTTP requests, databases, AI providers, CGStore, Analytics, Goals, Sync, or Course Space directly.

## 3. Rule Architecture

| Rule | File | Input | Deterministic Output |
| --- | --- | --- | --- |
| Focus Trend | `rules/focusTrendRule.js` | Behavior Adapter `recent7` | `focus_increase` / `focus_decline` |
| Learning Consistency | `rules/learningConsistencyRule.js` | Behavior Adapter `recent7` | `consistency_stable` / `consistency_drop` |
| Knowledge Gap | `rules/knowledgeGapRule.js` | Student Knowledge Adapter | `knowledge_gap_detected` |
| Course Progress | `rules/courseProgressRule.js` | Course Knowledge Adapter | `course_progress_status` |

Each rule is a pure function with no side effects. Missing input produces `null`; missing data never produces an inferred insight.

The Behavior Adapter now projects a bounded seven-day `recent7` summary:

```text
focusMinutes
current3FocusMinutes
previous4FocusMinutes
studyActiveDays
current3StudyDays
previous4StudyDays
startDate
endDate
```

The trend comparison uses the average of the latest three days against the average of the preceding four days. Study activity is based on positive focus or English minutes only.

## 4. Insight Lifecycle

1. Adapter builds a bounded, user-owned projection.
2. Agent Context composes the boundary with source, authority, type, and confidence.
3. The engine validates `learning-context-v1` and `readOnly=true`.
4. Rules receive only their matching Adapter boundary.
5. A rule emits an insight or `null`.
6. The engine normalizes evidence, text, confidence, IDs, and action level.
7. The API returns at most ten insights.
8. Agent Home renders at most five insights.

## 5. Evidence Model

Every insight contains one or more evidence records:

```json
{
  "source": "behavior_adapter",
  "authority": "deterministic_projection",
  "metric": "focus_minutes",
  "period": "current_3d",
  "value": 80,
  "field": "focus_minutes"
}
```

`field` is retained only as a backward-compatible alias of `metric`. The canonical evidence identity is `source`, `authority`, `metric`, `period`, and `value`.

## 6. Contract

The payload remains:

```text
agent-insight-v1
```

Each insight now includes:

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

The implementation keeps `kind` and `headline` as short-term aliases of `type` and `title` for existing read-only consumers. The previous `recommended_actions` field is removed from the deterministic insight output. Every insight has:

```text
confidence = 1
actionLevel = insight_only
```

## 7. Boundary

The implementation does not modify:

- CGStore;
- Analytics;
- Goals;
- Sync;
- Course Space schema or behavior;
- Student Knowledge State schema or calculation;
- Reflection storage.

The engine can analyze and explain Adapter data only. It cannot mutate user data.

## 8. Frontend Enhancement

Agent Home now displays the canonical insight title, explanation, evidence metric, period, value, source, and authority. It still displays no button, form, chat input, planner entry, or action entry.

The frontend service additionally rejects an insight payload when its metadata action level is not `insight_only`.

## 9. Test Results

```yaml
Backend: 119/119 PASS
Frontend: 597/597 PASS
Build: PASS
git diff --check: PASS
Browser Desktop 1920x1080: PASS
Browser Mobile 375x812: PASS
Console errors: 0
Page errors: 0
HTTP >= 400: 0
Horizontal overflow: 0
Rendered sections: 5/5
```

## 10. Future Extension Boundary

Future insight rules must remain pure, deterministic, bounded, and evidence-backed. They may read Adapter projections but must not query storage directly, invent trends, generate actions, or call an LLM.

Future LLM-based reasoning must consume this engine output as structured facts and must remain in a separate architecture phase.
