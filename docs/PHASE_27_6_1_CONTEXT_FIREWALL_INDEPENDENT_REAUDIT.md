# Phase 27.6.1 Context Firewall Independent Re-Audit

Date: 2026-09-18

## Audit Result

READY_TO_FREEZE

## Scope

- `backend/src/services/agentFirewall/contextContract.js`
- `backend/src/services/agentFirewall/contextFirewall.js`
- `backend/test/agentLlmContextFirewall.test.js`
- `docs/PHASE_27_6_1_CONTEXT_FIREWALL_CONTRACT.md`
- `docs/PHASE_27_6_LLM_REASONING_ARCHITECTURE.md`
- `docs/PHASE_27_6_LLM_REASONING_ARCHITECTURE_AUDIT.md`
- 现有 Agent Context / Insight / Reasoning 链路

本阶段未修改 Agent Home UI、公开 API、CGStore、Analytics、Goals、Sync、Reflection、GrowthMemory、CoachMemory、Course Knowledge 或 Student Knowledge State。

## Implementation Summary

- 新增内部契约 `agent-llm-context-v1`。
- 新增纯函数 `buildLlmContext()`。
- 新增 `toProviderPayload()`，区分内部所有权上下文与 Provider Payload。
- 严格 allowlist Insight / Evidence / Reasoning 字段。
- 敏感键在任意嵌套层级 fail closed。
- 输出有界、排序确定、引用可追溯。
- 未连接 Provider，未新增 API，未修改前端。

## Contract Review

PASS

- Schema version：`agent-llm-context-v1`。
- Task 只允许固定 enum。
- Input schema fail closed。
- Confidence 必须是 finite number 且 `[0,1]`，禁止 string / null / boolean 强转。
- Insight 必须有 Evidence。
- Reasoning explanation 必须有 valid evidenceRefs。
- `available=false` 不允许携带 explanations。

Evidence:

- `backend/src/services/agentFirewall/contextContract.js:145`
- `backend/src/services/agentFirewall/contextFirewall.js:156`
- `backend/test/agentLlmContextFirewall.test.js:87`

## Security Review

### Isolation

PASS

Firewall 强制：

```text
context.userId === insights.userId === reasoning.userId
```

不一致时抛出 `FIREWALL_OWNERSHIP_MISMATCH`，没有 fallback。

Evidence:

- `backend/src/services/agentFirewall/contextContract.js:63`
- `backend/test/agentLlmContextFirewall.test.js:111`

### Secret Filtering

PASS

以下敏感键在嵌套输入中出现时直接拒绝：

```text
jwt
authToken
accessToken
refreshToken
apiKey / api_key
password
secret
credential
cookie
authorization
sessionId
```

Evidence:

- `backend/src/services/agentFirewall/contextContract.js:10`
- `backend/test/agentLlmContextFirewall.test.js:103`

### Provider Payload

PASS

`toProviderPayload()` 不输出 `ownerUserId`、`userId` 或 `permissions.write`。测试验证序列化 payload 中不出现这些内部字段。

Evidence:

- `backend/src/services/agentFirewall/contextFirewall.js:179`
- `backend/test/agentLlmContextFirewall.test.js:77`

### Injection Boundary

PASS

- Firewall 只接受固定 task。
- 不接受自由 prompt。
- 不执行文本中的命令。
- Payload 是 provider-neutral 数据，不含 tool call / action / mutation 权限。

Evidence:

- `backend/test/agentLlmContextFirewall.test.js:97`
- `backend/src/services/agentFirewall/contextFirewall.js:179`

## Bounds Review

PASS

实现预算：

```text
maxBytes: 8192
maxInsights: 6
maxEvidencePerInsight: 3
maxReasoning: 6
maxTextChars: 240
maxEvidenceTextChars: 160
maxSourceReferences: 12
```

Evidence:

- `backend/src/services/agentFirewall/contextFirewall.js:10`

数组长度、文本长度、confidence、authority、evidence index 都被限制。超过 byte budget 时先确定性丢弃低优先级 reasoning / insights，仍超限则 `FIREWALL_CONTEXT_TOO_LARGE`。

Evidence:

- `backend/src/services/agentFirewall/contextFirewall.js:138`
- `backend/test/agentLlmContextFirewall.test.js:141`

## Provenance Review

PASS

- Insight Evidence 保留 `insightId:index` 形式的 `evidenceId`。
- 保留 source、authority、metric、period 和 primitive value。
- Reasoning 保留 `insightId` 和 evidenceRefs。
- 不输出数据库主键、内部权限或用户身份。

Evidence:

- `backend/src/services/agentFirewall/contextFirewall.js:73`
- `backend/src/services/agentFirewall/contextFirewall.js:104`

## Determinism Review

PASS

- Sources 按 authority / key 排序。
- Insights 按 id / type 排序。
- Reasoning 按 insightId 排序。
- 同一输入多次运行 deep-equal。

Evidence:

- `backend/test/agentLlmContextFirewall.test.js:118`

## Boundary Review

### Provider Independence

PASS

- 没有 Provider SDK。
- 没有 API Key。
- 没有 Base URL。
- 没有 fetch / HTTP Provider 调用。
- 模块只做 validate / filter / project / bound / sort。

### Read-only

PASS

- 不访问数据库。
- 不写 CGStore。
- 不写 Memory。
- 不写 Knowledge State。
- 不执行 Action。
- 输出 metadata 固定 `readOnly=true`、`actionLevel=insight_only`。

### Memory Boundary

PASS

GrowthMemory 只允许 source metadata，且本阶段未将其内容放入模型事实。CoachMemory 和 Reflection 不进入 Context。

### Regression Boundary

PASS

- `learning-context-v1` 未修改。
- `agent-insight-v1` 未修改。
- `agent-reasoning-v1` 未修改。
- Agent Home API 未修改。
- 前端未修改。

## Test Verification

### Backend

```text
npm test --prefix backend
Tests: 137/137 PASS
Failures: 0
```

### Frontend

```text
npm test
Tests: 598/598 PASS
Failures: 0
```

### Build

```text
npm run build
PASS
```

### Browser

```text
Desktop 1920x1080: PASS
Mobile 375x812: PASS
Sections: 6
Console errors: 0
Page errors: 0
HTTP >= 400: 0
Horizontal overflow: 0
```

### Git

```text
git diff --check: PASS
```

## Findings

### Critical

None

### High

None

### Medium

None

### Low

#### L-001 GrowthMemory Content Not Projected

- Evidence: Phase 27.6 架构允许 bounded derived memory context，但 27.6.1 只保守传递 source metadata，不传递 memory 内容。
- Recommendation: 保留当前最小实现。未来如果 LLM 需要 GrowthMemory，必须先新增独立的 bounded memory projection contract 和测试。

#### L-002 Output Validation Is Out Of Phase Scope

- Evidence: 本阶段只建立 input firewall；未来 LLM output validator 属于 27.6.3。
- Recommendation: 不要在 Provider Abstraction 前跳过 output validator；任何 Provider 输出必须先通过独立 schema 与 evidence binding 验证。

## Freeze Gate

```text
Contract: PASS
Security: PASS
Isolation: PASS
Bounds: PASS
Determinism: PASS
Evidence: PASS
Read-only: PASS
Provider Independence: PASS

Critical: 0
High: 0
Medium: 0
Low: 2
```

## Final Verdict

READY_TO_FREEZE
