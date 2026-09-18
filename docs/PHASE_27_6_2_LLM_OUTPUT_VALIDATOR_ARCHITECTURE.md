# Phase 27.6.2 LLM Output Validator Architecture

Date: 2026-09-18

Status: ARCHITECTURE_REVIEWED

Baseline:

```text
Phase 27.6 Architecture Freeze: 2eb00d5
Phase 27.6.1 Firewall Implementation: 2c42fa6
Phase 27.6.1 Freeze: 43485b8
```

## 1. Goal

定义未来 LLM 与用户之间的第二道安全边界：

```text
LLM
    ↓
Raw Model Output
    ↓
Output Validator
    ↓
Validated LLM Explanation
    ↓
User
```

Output Validator 不判断模型“聪不聪明”。它只判断：

- 结构是否合法；
- 事实是否可追溯；
- 引用是否属于当前用户和当前请求；
- 语义是否超出证据支持范围；
- 是否包含 PII / credential / action / tool request；
- 输出是否 bounded；
- 失败时是否能安全回到 deterministic fallback。

## 2. Non-Goals

本阶段明确禁止且不实现：

- LLM Provider 实现；
- OpenAI / Anthropic / Gemini / DeepSeek SDK；
- API Key / Base URL；
- fetch 到模型服务；
- Chat UI；
- Agent Chat API；
- Planner；
- Tutor；
- Tool Calling；
- Action Executor；
- Memory Writer；
- Reflection Writer；
- Student Knowledge State Writer；
- Course Knowledge Writer；
- RAG rewrite；
- Multi-Agent。

本阶段只冻结架构，不修改生产代码。

## 3. Position in Agent Architecture

完整双边界：

```text
USER DATA
    ↓
DETERMINISTIC FACTS
    ↓
INSIGHT
    ↓
EVIDENCE
    ↓
DETERMINISTIC REASONING
    ↓
CONTEXT FIREWALL
    ↓
agent-llm-context-v1
    ↓
LLM
    ↓
Raw Model Output
    ↓
OUTPUT VALIDATOR
    ↓
agent-llm-output-v1
    ↓
VALIDATED EXPLANATION
    ↓
USER
```

Output Validator 不能重新定义 Insight、Evidence、Reasoning、Context Firewall 或 Source of Truth。

## 4. Raw Output Boundary

Raw LLM Output 绝对不能进入 frontend。

验证顺序必须固定：

```text
Parse
→ Schema Validation
→ Semantic Validation
→ Evidence Binding Validation
→ Reasoning Binding Validation
→ Authority Validation
→ Safety / Boundary Validation
→ Bounds Validation
→ Validated Output
```

任何一步失败都必须 reject item 或进入 deterministic fallback。

## 5. Contract

输出契约：

```text
agent-llm-output-v1
```

### 5.1 Validator Input

```json
{
  "version": "agent-llm-output-v1",
  "requestId": "opaque-request-id",
  "firewallContext": "agent-llm-context-v1",
  "rawOutput": {},
  "providerMetadata": {
    "provider": "provider-name",
    "model": "model-name",
    "latencyMs": 420,
    "providerRequestId": "opaque-id"
  }
}
```

`providerMetadata` 只能来自后端 Provider Adapter，不能来自前端，也不能进入用户可见 payload。

### 5.2 Validated Internal Output

```json
{
  "version": "agent-llm-output-v1",
  "requestId": "opaque-request-id",
  "ownerUserId": 1,
  "scope": "agent_home",
  "status": "validated",
  "available": true,
  "explanations": [],
  "suggestions": [],
  "uncertainties": [],
  "safetyFlags": [],
  "validation": {
    "status": "validated",
    "acceptedExplanationCount": 0,
    "rejectedExplanationCount": 0,
    "acceptedSuggestionCount": 0,
    "rejectedSuggestionCount": 0,
    "failureCodes": []
  },
  "fallback": null,
  "metadata": {
    "readOnly": true,
    "actionLevel": "insight_only",
    "providerIndependent": true
  }
}
```

`ownerUserId` 只存在于内部输出，用于隔离校验和测试，不进入用户可见 payload。

### 5.3 User-Facing Projection

用户可见字段只允许：

```text
version
scope
status
available
explanations
suggestions
uncertainties
safetyFlags
fallback
metadata
```

用户可见 projection 不包含：

```text
rawOutput
providerMetadata
ownerUserId
validation 内部诊断
providerRequestId
token usage
内部 failure path
```

## 6. Claim Types

Claim type 只允许四种：

| Type | Evidence 要求 | Authority | 用户语义 |
| --- | --- | --- | --- |
| `fact` | 必须绑定 Evidence + Reasoning | `deterministic_projection` | 系统已有确定性观察 |
| `interpretation` | 必须引用 Evidence，但不新增事实 | derived / interpretation | AI 对已有观察的解释 |
| `suggestion` | 不要求历史 Evidence | suggestion | AI 建议，不是事实 |
| `uncertainty` | 不要求 Evidence | uncertainty | 数据不足或无法解释 |

本阶段不引入：

```text
question
warning
summary
command
task
```

Summary 由系统模板生成，不由 LLM 声明为事实。

## 7. Evidence Binding

LLM 不能创建 Evidence。

只能引用 Context Firewall 已提供的 Evidence：

```json
{
  "insightId": "focus-trend-7d",
  "evidenceId": "focus-trend-7d:0",
  "metric": "focus_minutes",
  "period": "current_3d"
}
```

Validator 必须验证：

1. `insightId` 存在于当前 Firewall Context；
2. `evidenceId` 与 `insightId:index` 完全匹配；
3. `metric` / `period` 与 Evidence 完全匹配；
4. 引用属于当前 request；
5. 引用属于当前用户；
6. evidence authority 允许支持 claim；
7. 没有伪造的新 evidence；
8. claim 没有超出 evidence 支持范围。

任何 fake evidence 都导致该 item reject。

## 8. Reasoning Binding

LLM 不能创建 Deterministic Reasoning。

Reasoning 引用必须满足：

```text
reasoningId = reasoning:<insightId>
```

Validator 必须验证：

1. `reasoningId` 存在于当前 Firewall Context；
2. 对应 `insightId` 存在；
3. reasoning 属于当前 request / 用户；
4. reasoning authority 是 deterministic；
5. LLM 只解释 reasoning，不重写它的事实值。

禁止：

```text
LLM Output → New Deterministic Reasoning
LLM Output → New Insight
LLM Output → New Evidence
```

## 9. Authority Model

Authority hierarchy 保持：

```text
System Facts
    >
Deterministic Projection
    >
Evidence-backed Memory
    >
User Input
    >
AI-generated Content
```

Claim authority 固定：

| Claim | authority |
| --- | --- |
| `fact` | `deterministic_projection` |
| `interpretation` | `interpretation` |
| `suggestion` | `suggestion` |
| `uncertainty` | `uncertainty` |

Output Validator 禁止提升 AI output authority：

```text
LLM Output → Evidence ❌
LLM Output → Insight ❌
LLM Output → Reasoning ❌
LLM Output → Memory ❌
LLM Output → Fact ❌
```

## 10. Confidence Model

禁止使用容易误导的字段：

```text
confidence
factualConfidence
truthScore
accuracy
```

LLM 只能提供：

```text
generationConfidence
```

规则：

- `generationConfidence` 必须是 finite number 且 `[0,1]`；
- 不做 silent coercion；
- 它表示生成置信度，不是事实真值；
- `fact` 的 factual confidence 来自 source Evidence / Deterministic Insight；
- `interpretation` 的 generationConfidence 不得超过 `0.7`；
- `suggestion` 的 generationConfidence 不得超过 `0.6`；
- `uncertainty` 不需要 generationConfidence。

用户界面必须标注：

```text
AI 解释 / AI 建议 / 不确定
```

不得把 generation confidence 展示为“事实可信度”。

## 11. Semantic Validation

Schema 合法不等于内容可信。

Deterministic semantic rules：

1. `fact.claims` 必须有至少一个 valid evidence ref；
2. fact 文本不得包含 Evidence 中不存在的数值；
3. fact 文本不得包含 Evidence 中不存在的时间范围；
4. fact 文本不得引用 Context 中不存在的主题；
5. fact 文本不得包含健康、情绪、睡眠、人格等无 Context 主题；
6. `interpretation` 必须引用 evidence，但只能做定性解释；
7. invalid interpretation 可降级为 `uncertainty`，前提是文本不含事实数字；
8. `suggestion` 不得包含事实断言；
9. `uncertainty` 不得包含事实断言；
10. 无法确定性验证的事实 claim 必须 reject。

Validator 不是万能 NLI / Truth Engine。宁可 reject 或 fallback，也不能“相信模型”。

## 12. Numerical Validation

规则：

- 文本中每个数字都必须绑定 Evidence；
- 数字必须与 Evidence `value` 精确匹配；
- v1 不允许模型自行单位换算；
- v1 不允许模型计算 derived number；
- 不允许无来源百分比；
- 不允许四舍五入后的新数值；
- 任何 unbound number 导致 item reject。

示例：

```text
Context: focus_minutes.current_3d = 120
允许: “最近 3 天专注 120 分钟。”
拒绝: “最近 3 天专注 2 小时。”
拒绝: “最近 3 天专注约 120 分钟。” unless source value matches.
拒绝: “过去 7 天专注 20 小时。”
```

## 13. Temporal Validation

文本时间范围必须与 Evidence period 匹配。

初始映射：

| Text | Allowed Evidence Period |
| --- | --- |
| 当前 / 今天 | `current` / task-specific current |
| 最近 3 天 | `current_3d` |
| 此前 4 天 | `previous_4d` |
| 最近 7 天 | `7d` |

禁止映射：

```text
昨天
上周
过去 30 天
本月
本学期
未来 7 天
```

除非 Firewall Context 的 Evidence 明确包含对应 period。

## 14. Prompt Injection Defense

Course document / Evidence text / Memory text 永远是 DATA：

```text
COURSE CONTENT ≠ INSTRUCTION
EVIDENCE TEXT ≠ SYSTEM PROMPT
USER TEXT ≠ SYSTEM INSTRUCTION
```

Output Validator 第二层防御：

1. 拒绝不在 Context 中的 PII；
2. 拒绝 fake evidence；
3. 拒绝新事实数字；
4. 拒绝新时间范围；
5. 拒绝 tool request；
6. 拒绝 action payload；
7. 拒绝 system / developer 角色伪装；
8. 拒绝权限变化；
9. 拒绝 secret / credential；
10. 无法验证时 deterministic fallback。

## 15. Privacy Boundary

输出中出现以下内容且 Context 未明确提供时 reject：

```text
email
phone
address
身份证号 / national id
student id
device id
credential
token
password
API key
session id
精确地址
```

LLM 不允许猜测或生成用户身份信息。

## 16. Action Boundary

LLM Output 不允许包含：

```text
createTodo
updateTodo
updateGoal
updateCourse
changeMastery
writeMemory
writeReflection
sendMessage
executePlanner
tool_call
function_call
navigation command
```

输出固定：

```json
{ "actionLevel": "insight_only" }
```

未来 Action 必须走：

```text
Proposal
→ Validation
→ User Confirmation
→ Executor
```

不属于 Phase 27.6.2。

## 17. Memory Boundary

LLM Output 不能写入：

```text
GrowthMemory
CoachMemory
Reflection
Student Knowledge State
Course Knowledge
Evidence
Analytics
Goals
```

未来如果需要 Memory，必须独立设计：

```text
Candidate
→ Validation
→ Policy
→ User Confirmation
→ Memory Writer
```

## 18. Output Bounds

初始冻结预算：

| Limit | Value |
| --- | --- |
| total validated output | 8,192 bytes |
| explanations | 5 |
| suggestions | 3 |
| uncertainties | 2 |
| claims per explanation | 3 |
| evidence refs per claim | 3 |
| reasoning refs per claim | 1 |
| explanation text | 240 chars |
| suggestion text | 180 chars |
| generationConfidence | `[0,1]` |
| output max tokens | 700 |

超过预算时必须 deterministic truncate 或 reject item；不能静默扩大预算。

## 19. Partial Acceptance

采用保守 partial acceptance：

- 合法 item 可以保留；
- 含非法 factual claim 的 explanation item 整体 reject；
- 不尝试删除句子后保留剩余文本，因为可能产生语义断裂；
- invalid interpretation 如果不含事实数字，可降级为 `uncertainty`；
- invalid suggestion 直接 reject；
- 只要至少一个 item 通过，`status=partial`；
- 全部失败时 `status=fallback`。

非法内容不得被合法 response envelope 掩盖。

## 20. Fallback

Validator 失败时使用 Phase 27.5 Deterministic Reasoning 作为 fallback：

```json
{
  "version": "agent-llm-output-v1",
  "status": "fallback",
  "available": false,
  "fallback": {
    "type": "deterministic_reasoning",
    "reason": "llm_output_invalid",
    "source": "agent-reasoning-v1"
  },
  "explanations": [],
  "suggestions": [],
  "uncertainties": [],
  "metadata": { "readOnly": true, "actionLevel": "insight_only" }
}
```

允许 fallback reason：

```text
llm_unavailable
llm_not_configured
llm_timeout
llm_malformed
llm_schema_invalid
llm_unsafe
llm_unsupported_claim
llm_evidence_mismatch
llm_context_mismatch
llm_output_too_large
llm_rate_limited
```

Fallback 不能展示 raw LLM output。

## 21. Provider Independence

Validator 只接受 generic：

```text
rawOutput
providerMetadata?
```

不依赖：

```text
OpenAI
Anthropic
Gemini
DeepSeek
Provider SDK
Provider message format
Provider tool-call format
```

Provider-specific normalization 必须在 Provider Adapter 内完成。

## 22. Observability

允许记录：

```text
requestId
validationStatus
failureCodes
accepted counts
rejected counts
latencyMs
promptVersion
provider name
model name
tokenUsage
truncated flag
fallbackReason
```

禁止记录：

```text
API key
JWT
cookie
password
raw prompt
raw context
raw LLM output
raw user data
PII
provider raw error body
```

## 23. Failure Matrix

| Failure | Detection | Action | User-visible |
| --- | --- | --- | --- |
| malformed JSON | parser | fallback | deterministic |
| schema failure | schema validator | reject item / fallback | safe |
| fake evidence | provenance validator | reject item | safe |
| unsupported fact | semantic validator | reject / downgrade | safe |
| number mismatch | numerical validator | reject item | safe |
| time mismatch | temporal validator | reject item | safe |
| cross-user ref | isolation validator | fail closed | safe |
| PII output | privacy validator | reject item | safe |
| secret output | safety validator | reject | safe |
| action request | action validator | reject | safe |
| oversized output | bounds validator | deterministic reject / fallback | bounded |
| provider error | provider adapter | fallback | deterministic |
| prompt injection | provenance / authority | reject | safe |

## 24. Testing Strategy

### Contract Tests

- schema version；
- claim type enum；
- required fields；
- numeric types；
- text / array limits；
- generationConfidence bounds。

### Fact Boundary Tests

- fake evidence；
- fake insight；
- fake reasoning；
- cross-user reference；
- unsupported claim；
- authority escalation；
- raw output leakage。

### Semantic Tests

- numeric match；
- numeric mismatch；
- period match；
- period mismatch；
- unsupported topic；
- invalid interpretation downgrade；
- suggestion containing fact。

### Safety Tests

- PII；
- credential；
- action payload；
- tool call；
- prompt injection；
- oversized output；
- partial acceptance pollution。

### Regression Tests

- 27.4 Insight unchanged；
- 27.5 Reasoning unchanged；
- 27.6.1 Context Firewall unchanged；
- LLM fallback 时 Agent Home 仍可用。

## 25. Architecture Invariants

```text
A. Raw LLM output is never user-visible.
B. LLM cannot create Evidence.
C. LLM cannot create deterministic Insight.
D. LLM cannot create deterministic Reasoning.
E. LLM cannot increase source authority.
F. Factual claims require valid provenance.
G. Unsupported factual claims are rejected or explicitly downgraded.
H. LLM confidence is never factual truth.
I. LLM cannot access data outside Context Firewall.
J. LLM cannot mutate user state.
K. LLM cannot execute actions.
L. LLM cannot write memory.
M. Provider independence is preserved.
N. Validation is deterministic.
O. Fallback remains available when LLM fails.
P. Cross-user reference is a hard failure.
Q. Secrets never appear in user-visible output.
R. Output is bounded.
S. Course/document text remains DATA, never INSTRUCTION.
```

## 26. Future Implementation Plan

```text
27.6.2.1 Output Contract Constants + Types
27.6.2.2 Schema Validator
27.6.2.3 Evidence / Reasoning Binding Validator
27.6.2.4 Semantic / Numerical / Temporal Rules
27.6.2.5 Safety / Privacy / Action Validator
27.6.2.6 Bounds + Partial Acceptance
27.6.2.7 Deterministic Fallback Adapter
27.6.2.8 Provider Abstraction
27.6.2.9 API + UI Integration
27.6.2.10 Independent Re-Audit + Freeze
```

Provider Abstraction 必须在 Output Validator 实现并审计之后进行。

## Final Status

```text
PHASE 27.6.2: ARCHITECTURE_REVIEWED
```
