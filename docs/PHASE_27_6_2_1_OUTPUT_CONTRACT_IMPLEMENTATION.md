# Phase 27.6.2.1 Output Contract Implementation

Date: 2026-09-18

Status: IMPLEMENTED_AND_AUDITED

Implementation: `15c283c feat: add llm output contract validation`

## 1. Goal

将冻结的 `agent-llm-output-v1` 实现为严格、可测试、provider-neutral 的结构契约：

```text
Raw LLM Output
    ↓
agent-llm-output-v1
    ↓
Strict Structural Validation
```

本阶段只实现 Contract / Schema / Bounds / Error Contract。

## 2. Implemented Modules

| Module | Responsibility |
| --- | --- |
| `backend/src/services/agentOutputValidator/outputLimits.js` | 冻结输出上限 |
| `backend/src/services/agentOutputValidator/outputContract.js` | schema、claim types、strict validation |
| `backend/test/agentLlmOutputContract.test.js` | contract regression tests |

未创建空模块，未引入依赖。

## 3. Contract

Schema version：

```text
agent-llm-output-v1
```

Status enum：

```text
validated
partial
fallback
```

Claim type enum：

```text
fact
interpretation
suggestion
uncertainty
```

Metadata 固定为：

```json
{
  "readOnly": true,
  "actionLevel": "insight_only",
  "providerIndependent": true
}
```

## 4. Schema

顶层字段严格限定：

```text
schemaVersion
status
available
fallback
explanations
suggestions
uncertainties
metadata
```

未知字段会被拒绝，不会被 strip。

### 4.1 Explanation

```json
{
  "id": "exp-1",
  "type": "fact",
  "text": "最近 3 天专注时间高于此前 4 天。",
  "evidenceRefs": [
    {
      "insightId": "focus-trend-7d",
      "evidenceId": "focus-trend-7d:0",
      "metric": "focus_minutes",
      "period": "current_3d"
    }
  ],
  "reasoningRefs": [
    {
      "reasoningId": "reasoning:focus-trend-7d",
      "insightId": "focus-trend-7d"
    }
  ]
}
```

规则：

- `fact` 必须有 evidence refs 和 reasoning refs；
- `fact` 禁止 `generationConfidence`；
- `interpretation` 必须有 evidence refs，可选 reasoning refs；
- `suggestion` 和 `uncertainty` 禁止 provenance；
- 所有 provenance 只能是 reference，不能内嵌 evidence 内容。

### 4.2 Fallback

`status=fallback` 时：

- `available` 必须是 `false`；
- `fallback.type` 必须是 `deterministic_reasoning`；
- `fallback.source` 必须是 `agent-reasoning-v1`；
- `fallback.reason` 只能来自 allowlist；
- LLM explanations / suggestions / uncertainties 必须为空；
- fallback explanations 只允许引用 deterministic reasoning 的结构。

## 5. Bounds

| Limit | Value |
| --- | --- |
| explanations | 5 |
| facts | 5 |
| suggestions | 3 |
| uncertainties | 2 |
| evidence refs per claim | 3 |
| reasoning refs per claim | 1 |
| explanation text | 240 chars |
| suggestion text | 180 chars |
| uncertainty text | 180 chars |
| id | 120 chars |
| total output | 8,192 bytes |

## 6. Error Contract

`validateOutputContract()` 返回：

```json
{
  "valid": false,
  "errors": [
    {
      "path": "explanations[0].type",
      "code": "INVALID_EXPLANATION_TYPE"
    }
  ]
}
```

错误 code 包括：

```text
INVALID_SCHEMA_VERSION
INVALID_STATUS
INVALID_EXPLANATION_TYPE
INVALID_FIELD_TYPE
MISSING_REQUIRED_FIELD
UNKNOWN_FIELD
SENSITIVE_FIELD
INVALID_CONFIDENCE
FORBIDDEN_FACT_CONFIDENCE
INVALID_REFERENCE
INVALID_EVIDENCE_REFS
INVALID_REASONING_REFS
FORBIDDEN_PROVENANCE
INVALID_EXPLANATION_LENGTH
SUGGESTION_TOO_LONG
UNCERTAINTY_TOO_LONG
TOO_MANY_EXPLANATIONS
TOO_MANY_FACTS
TOO_MANY_SUGGESTIONS
TOO_MANY_UNCERTAINTIES
OUTPUT_TOO_LARGE
INVALID_ACTION_LEVEL
INVALID_FALLBACK
FORBIDDEN_FALLBACK_CONTENT
FORBIDDEN_SUCCESS_FALLBACK
```

错误只包含 path 和 machine-readable code，不包含 raw LLM 内容、secret 或用户数据。

## 7. Security Boundary

- 未知字段 fail closed。
- 敏感键 fail closed：JWT、API key、password、secret、credential、cookie、authorization、session token 等。
- 不做类型强转：`"0.8"`、`null`、`NaN`、`Infinity`、越界 number 均被拒绝。
- fake evidence object / embedded evidence content 被拒绝。
- evidenceId 必须精确匹配 `insightId:index`。
- reasoningId 必须精确匹配 `reasoning:insightId`。
- prompt injection 文本只作为 DATA 处理，validator 不执行、不解释、不调用外部系统。
- raw output 不进入 Agent Home API 或 UI。

## 8. Tests

`backend/test/agentLlmOutputContract.test.js` 覆盖：

- minimal valid output；
- fact / interpretation / suggestion / uncertainty；
- strict schema version 和 status；
- missing / wrong field type；
- fake evidence object；
- missing evidence / reasoning refs；
- factual confidence rejection；
- malformed generation confidence；
- unknown fields；
- sensitive fields；
- prompt injection as data；
- explanation / fact / suggestion / uncertainty bounds；
- evidence refs / reasoning refs bounds；
- total output byte bound；
- deterministic fallback；
- same input same result。

## 9. Regression

```text
Backend: 147/147 PASS
Frontend: 598/598 PASS
Build: PASS
git diff --check: PASS
```

Browser smoke：

```text
Desktop 1920x1080: PASS
Mobile 375x812: PASS
Console errors: 0
Page errors: 0
HTTP >= 400: 0
Horizontal overflow: 0
```

未修改：

- Context Firewall；
- Deterministic Reasoning；
- Agent Home API；
- Agent Home UI；
- CGStore / Analytics / Goals / Sync / Reflection / Memory。

## 10. Non-Goals

本阶段未实现：

- Provider；
- API；
- UI；
- Chat；
- semantic truth engine；
- evidence existence validation against firewall context；
- numeric semantic validation；
- temporal semantic validation；
- PII / safety content validator；
- action validator；
- memory writer。

这些属于后续 Output Validator Engine 阶段。

## 11. Known Limitations

- 本阶段只验证结构，不验证 evidence 是否真的存在于当前 Firewall Context。
- Injection 文本可以通过结构校验，因此不能直接展示；后续 semantic / safety validator 必须拒绝。
- fallback explanations 使用 deterministic reasoning 的结构，而不是 LLM claim 结构。
- `MAX_CLAIMS_PER_EXPLANATION` 保留自冻结架构，但当前 schema 将每个 explanation 视为单一 claim；若未来需要嵌套 claims，必须扩展 schema 并保持向后兼容。

## 12. Next Phase

```text
Phase 27.6.2.2 — Evidence Binding Validator
```

该阶段应将 output references 与 `agent-llm-context-v1` 中真实 Insight / Evidence / Reasoning 绑定。
