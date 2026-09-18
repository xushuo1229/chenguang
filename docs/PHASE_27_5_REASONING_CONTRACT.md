# Phase 27.5 Reasoning Contract

Date: 2026-09-18

Contract: `agent-reasoning-v1`

Status: FROZEN

## 1. Purpose

The Reasoning Layer explains existing deterministic insights. It does not create facts, recommendations, commands, or actions.

## 2. Input Schema

The reasoning engine accepts:

```json
{
  "context": {
    "version": "learning-context-v1",
    "userId": 1,
    "readOnly": true,
    "permissions": {
      "write": []
    }
  },
  "insights": {
    "version": "agent-insight-v1",
    "userId": 1,
    "scope": "agent_home",
    "insights": [],
    "metadata": {
      "readOnly": true,
      "actionLevel": "insight_only",
      "contextVersion": "learning-context-v1"
    }
  }
}
```

Required input rules:

1. Context version must be `learning-context-v1`.
2. Context must be read-only.
3. Context and insight user IDs must match.
4. Insight version must be `agent-insight-v1`.
5. Insight action level must be `insight_only`.
6. Every source insight must contain evidence.

Raw user data, database records, request objects, credentials, provider clients, and memory contents are not accepted as reasoning input.

## 3. Output Schema

Success output:

```json
{
  "version": "agent-reasoning-v1",
  "generatedAt": "2026-09-18T00:00:00.000Z",
  "userId": 1,
  "scope": "agent_home",
  "available": true,
  "summary": {
    "title": "学习观察解释",
    "narrative": "以下解释只基于已验证的结构化洞察。",
    "insightCount": 1,
    "evidenceCount": 1
  },
  "explanations": [
    {
      "insightId": "focus-trend-7d",
      "insightType": "focus_increase",
      "title": "为什么出现专注趋势观察？",
      "why": "该观察比较了最近 3 天与此前 4 天的专注记录。",
      "evidenceRefs": [
        {
          "insightId": "focus-trend-7d",
          "index": 0,
          "source": "behavior_adapter",
          "metric": "focus_minutes",
          "period": "current_3d"
        }
      ],
      "confidence": 1,
      "actionLevel": "insight_only"
    }
  ],
  "permissions": {
    "read": ["deterministic_insights"],
    "write": []
  },
  "metadata": {
    "readOnly": true,
    "actionLevel": "insight_only",
    "sourceInsightVersion": "agent-insight-v1",
    "contextVersion": "learning-context-v1"
  }
}
```

Output rules:

1. Maximum 10 explanations.
2. Each explanation references one source insight.
3. Each explanation contains one or more evidence references.
4. Evidence references must resolve to evidence in the source insight.
5. Confidence must be finite and between 0 and 1.
6. `actionLevel` must always be `insight_only`.
7. No mutation permission is allowed.

## 4. Evidence Model

An evidence reference is not new evidence. It points to existing evidence from the source insight:

```json
{
  "insightId": "focus-trend-7d",
  "index": 0,
  "source": "behavior_adapter",
  "metric": "focus_minutes",
  "period": "current_3d"
}
```

The referenced evidence value is not copied into reasoning output. The UI continues to read the deterministic insight evidence as the fact source.

## 5. Confidence Model

Deterministic reasoning confidence is copied from the source insight. Since Phase 27.4 deterministic rules always use confidence `1`, deterministic reasoning confidence is `1`.

If a future reasoning source introduces uncertainty, it must use a finite value between 0 and 1 and must not exceed the source insight confidence.

## 6. Fallback Behavior

When no insights exist, reasoning is unavailable, or input is safely ignored, the output is:

```json
{
  "version": "agent-reasoning-v1",
  "generatedAt": "2026-09-18T00:00:00.000Z",
  "userId": 1,
  "scope": "agent_home",
  "available": false,
  "reason": "no_insights",
  "summary": {
    "title": "暂无推理解释",
    "narrative": "当前没有可解释的结构化洞察。",
    "insightCount": 0,
    "evidenceCount": 0
  },
  "explanations": [],
  "permissions": {
    "read": ["deterministic_insights"],
    "write": []
  },
  "metadata": {
    "readOnly": true,
    "actionLevel": "insight_only",
    "sourceInsightVersion": "agent-insight-v1",
    "contextVersion": "learning-context-v1"
  }
}
```

Allowed fallback reasons:

```text
no_insights
reasoning_unavailable
```

Invalid context or insight contracts must be rejected by the backend, not silently converted into success fallback.

## 7. Security Boundary

The reasoning layer may:

- explain;
- summarize;
- clarify.

It must not:

- create tasks;
- modify plans;
- mutate data;
- execute tools;
- call Agents;
- issue commands;
- generate recommendations.

There is no chat input and no LLM loop in this phase.

## 8. Final Status

CONTRACT_FROZEN
