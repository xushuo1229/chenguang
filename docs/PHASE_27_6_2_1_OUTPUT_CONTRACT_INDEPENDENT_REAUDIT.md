# Phase 27.6.2.1 Output Contract Independent Re-Audit

Date: 2026-09-18

## Audit Result

READY_TO_FREEZE

## Scope

- `backend/src/services/agentOutputValidator/outputContract.js`
- `backend/src/services/agentOutputValidator/outputLimits.js`
- `backend/test/agentLlmOutputContract.test.js`
- `docs/PHASE_27_6_2_1_OUTPUT_CONTRACT_IMPLEMENTATION.md`
- `docs/PHASE_27_6_2_LLM_OUTPUT_VALIDATOR_ARCHITECTURE.md`
- `docs/PHASE_27_6_1_CONTEXT_FIREWALL_CONTRACT.md`
- 现有 Agent Home / Insight / Reasoning 链路

## Contract

PASS

- Version 显式固定为 `agent-llm-output-v1`。
- Status enum 固定为 `validated` / `partial` / `fallback`。
- Claim type enum 固定为 `fact` / `interpretation` / `suggestion` / `uncertainty`。
- 顶层 schema、metadata、fallback、explanation、reference 均有 required / optional field 边界。
- Evidence reference 固定为 `{ insightId, evidenceId, metric, period }`。
- Reasoning reference 固定为 `{ reasoningId, insightId }`。

Evidence:

- `backend/src/services/agentOutputValidator/outputContract.js:5`
- `backend/src/services/agentOutputValidator/outputContract.js:6`
- `backend/src/services/agentOutputValidator/outputContract.js:218`
- `backend/src/services/agentOutputValidator/outputContract.js:231`

## Strictness

PASS

- 不做 silent coercion。
- `generationConfidence` 必须是真 number 且 finite `[0,1]`。
- `"0.8"`、`null`、`NaN`、`Infinity`、越界 number 被拒绝。
- fact 禁止模型 factual / generation confidence。
- 未知字段直接返回 `UNKNOWN_FIELD`，不会被 strip 或穿透。
- metadata 必须精确为 `readOnly=true`、`actionLevel=insight_only`、`providerIndependent=true`。

Evidence:

- `backend/src/services/agentOutputValidator/outputContract.js:39`
- `backend/test/agentLlmOutputContract.test.js:118`
- `backend/test/agentLlmOutputContract.test.js:134`

## Security

PASS

- 敏感键 fail closed：`jwt`、`authToken`、`accessToken`、`refreshToken`、`apiKey`、`password`、`secret`、`credential`、`cookie`、`authorization`、`sessionId`。
- fake evidence object 中的 `content` 是未知字段，导致 reject。
- provenance 只允许引用，不允许内嵌 evidence 内容。
- evidenceId 必须精确等于 `insightId:index`。
- reasoningId 必须精确等于 `reasoning:insightId`。
- injection 文本只作为 DATA 通过结构校验，不会被执行；本阶段没有 UI / API 暴露路径。
- fallback 禁止混入 LLM claim 内容。

Evidence:

- `backend/src/services/agentOutputValidator/outputContract.js:9`
- `backend/src/services/agentOutputValidator/outputContract.js:51`
- `backend/src/services/agentOutputValidator/outputContract.js:64`
- `backend/src/services/agentOutputValidator/outputContract.js:85`
- `backend/test/agentLlmOutputContract.test.js:102`
- `backend/test/agentLlmOutputContract.test.js:134`
- `backend/test/agentLlmOutputContract.test.js:151`

## Bounds

PASS

实现并测试以下限制：

```text
MAX_EXPLANATIONS = 5
MAX_FACTS = 5
MAX_SUGGESTIONS = 3
MAX_UNCERTAINTIES = 2
MAX_EVIDENCE_REFS_PER_CLAIM = 3
MAX_REASONING_REFS_PER_CLAIM = 1
MAX_EXPLANATION_LENGTH = 240
MAX_SUGGESTION_LENGTH = 180
MAX_UNCERTAINTY_LENGTH = 180
MAX_ID_LENGTH = 120
MAX_TOTAL_OUTPUT_BYTES = 8192
```

Evidence:

- `backend/src/services/agentOutputValidator/outputLimits.js:3`
- `backend/test/agentLlmOutputContract.test.js:158`
- `backend/test/agentLlmOutputContract.test.js:194`

## Determinism

PASS

`validateOutputContract()` 是纯结构校验：

- 无 Provider；
- 无 network；
- 无 DB；
- 无 mutation；
- 无时间依赖；
- 无随机依赖；
- same input 返回 deep-equal result。

Evidence:

- `backend/test/agentLlmOutputContract.test.js:201`

## Boundary

PASS

- 没有 Provider SDK、Provider URL、API key 或 fetch。
- 没有数据库访问。
- 没有修改 Agent Home API 或 UI。
- 没有写入 Memory、Reflection、Knowledge State、Course Knowledge。
- 没有 action executor、planner、tool call。
- metadata 强制 `readOnly=true`、`actionLevel=insight_only`。

Evidence:

- `backend/src/services/agentOutputValidator/outputContract.js:201`
- `backend/src/services/agentOutputValidator/outputContract.js:212`

## Provenance

PASS

- Evidence refs 是稳定 ID reference。
- 不允许 embedded fake evidence。
- `evidenceId` 强制匹配 `insightId:index`。
- `reasoningId` 强制匹配 `reasoning:insightId`。
- suggestion / uncertainty 禁止 provenance。

Evidence:

- `backend/src/services/agentOutputValidator/outputContract.js:64`
- `backend/src/services/agentOutputValidator/outputContract.js:85`
- `backend/test/agentLlmOutputContract.test.js:102`

## Regression

PASS

```text
Backend: 147/147 PASS
Frontend: 598/598 PASS
Build: PASS
git diff --check: PASS
```

Browser：

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
- Insight Engine；
- Agent Home API；
- Agent Home UI。

## Findings

### Critical

None

### High

None

### Medium

None

### Low

#### L-001 Semantic Validation Is Not Implemented By Design

- Evidence: 本阶段只做 structural contract validation；`"Ignore previous instructions..."` 这类文本可以通过 schema。
- Recommendation: 后续 Evidence Binding / Semantic / Safety Validator 阶段必须拒绝不可信事实和 unsafe 内容。当前实现没有 UI / API 暴露路径，风险不进入用户面。

#### L-002 Reference Existence Validation Is Deferred

- Evidence: 本阶段校验 reference 结构和 ID 格式，但尚未证明 reference 存在于 `agent-llm-context-v1`。
- Recommendation: 下一阶段必须实现 Evidence Binding Validator，并测试 cross-user、missing insight、missing evidence、fake reasoning。

## Freeze Gate

```text
Contract: PASS
Schema: PASS
Security: PASS
Strictness: PASS
Bounds: PASS
Determinism: PASS
Provider Independence: PASS

Critical: 0
High: 0
Medium: 0
Low: 2
```

## Final Verdict

READY_TO_FREEZE
