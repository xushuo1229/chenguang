# Phase 27.6.1 Context Firewall Contract

Date: 2026-09-18

Status: IMPLEMENTED_AND_AUDITED

Implementation: `2c42fa6 feat: add agent llm context firewall contract`

## 1. Goal

建立未来 LLM 调用前的唯一受控边界：

```text
Agent Context
    ↓
Deterministic Insight
    ↓
Deterministic Reasoning
    ↓
Context Firewall
    ↓
agent-llm-context-v1
    ↓
Future LLM Provider
```

本阶段目标是证明：

> 系统能够严格控制未来 LLM 能看到什么。

本阶段不调用 LLM，不连接 Provider，不开放 API。

## 2. Non-Goals

本阶段禁止且未实现：

- LLM Provider 调用；
- Provider SDK 或 API Key 读取；
- 公开 API；
- Agent Home UI 变更；
- Chat / Planner / Tutor；
- Action Executor；
- Memory Writer；
- RAG / Vector Database / Embedding；
- CGStore、Analytics、Goals、Sync、Reflection、Course Knowledge、Knowledge State 修改；
- 将 Firewall 输出写入任何持久化数据。

## 3. Position in Agent Architecture

Context Firewall 位于确定性事实之后、未来 Provider 之前：

```text
USER DATA
    ↓
DETERMINISTIC CONTEXT
    ↓
CONTEXT FIREWALL
    ↓
BOUNDED LLM CONTEXT
    ↓
LLM
```

它不能反向生成事实，也不能代替 Insight / Evidence / Reasoning。

## 4. Context Firewall Contract

实现契约：

```text
agent-llm-context-v1
```

### 4.1 Firewall Internal Context

```json
{
  "version": "agent-llm-context-v1",
  "ownerUserId": 1,
  "task": "explain_daily",
  "available": true,
  "truncated": false,
  "sources": [],
  "insights": [],
  "reasoning": [],
  "constraints": {},
  "metadata": {
    "readOnly": true,
    "actionLevel": "insight_only",
    "providerIndependent": true
  }
}
```

`ownerUserId` 只存在于内部 Firewall Context，用于所有权校验和测试；不会进入 Provider Payload。

### 4.2 Provider Payload

`toProviderPayload()` 输出不包含：

```text
ownerUserId
userId
permissions.write
raw source values
credentials
internal security metadata
```

它只保留 Provider 解释所需的最小结构。

### 4.3 Task Allowlist

```text
explain_daily
explain_insights
summarize_learning_context
```

自由 prompt 不是 task，本阶段直接 fail closed。

## 5. Allowed Sources

Firewall 只识别这些 Context boundary：

| Key | Source 类别 | 可进入模型 |
| --- | --- | --- |
| `courses` | source projection | 元数据；原始值不进入本阶段 |
| `courseKnowledge` | source / deterministic projection | 元数据；原始值不进入本阶段 |
| `knowledgeStates` | source | 元数据；原始值不进入本阶段 |
| `behavior` | deterministic projection | 元数据；原始值不进入本阶段 |

真正进入模型的事实只来自：

1. `agent-insight-v1.insights`
2. Insight Evidence
3. `agent-reasoning-v1.explanations`

Reflection 与 CoachMemory 当前不可用，不进入 Context。

GrowthMemory 虽然是 derived_memory，但 27.6.1 保守处理：本阶段只允许 source metadata，不发送 memory 内容。

## 6. Authority Model

允许 authority：

```text
source
deterministic_projection
derived_memory
unavailable
```

拒绝：

```text
ai_generated
model_generated
llm
unknown
空 authority
```

`unavailable` 只能作为来源状态，不能被解释为事实。

## 7. User Isolation

Hard Security Boundary：

```text
context.userId
    =
insights.userId
    =
reasoning.userId
```

任何不一致都会抛出：

```text
FIREWALL_OWNERSHIP_MISMATCH
```

不允许 fallback，不允许“尽量返回”。

## 8. Field Allowlist

### Context

只校验并使用：

```text
version
userId
readOnly
actionLevel
permissions
courses / courseKnowledge / knowledgeStates / behavior 的 source metadata
```

### Insight

只保留：

```text
id
type
title
explanation
source
authority
confidence
actionLevel
evidence[]
```

### Evidence

只保留：

```text
evidenceId
source
authority
metric
period
value
```

`value` 只允许 finite number、boolean 或有界 string；object / array 被拒绝进入。

### Reasoning

只保留：

```text
id
insightId
title
why
evidenceRefs[]
confidence
actionLevel
```

## 9. Sensitive Data Policy

输入在任何嵌套层级包含以下键时 fail closed：

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

错误：

```text
SENSITIVE_FIREWALL_INPUT
```

本阶段不尝试脱敏后继续，因为这不是任务必需，也会扩大误放行风险。

## 10. Bounds

实现预算：

| Limit | Value |
| --- | --- |
| serialized firewall context | 8,192 bytes |
| insights | 6 |
| evidence per insight | 3 |
| reasoning items | 6 |
| insight / reasoning text | 240 chars |
| evidence string value | 160 chars |
| source references | 12 |

Phase 27.6 架构冻结的上限是 12,288 bytes；27.6.1 选择更保守的 8,192 bytes。

## 11. Ordering

输出顺序确定：

1. Sources：`authority` 升序，然后 `key` 升序。
2. Insights：`id` 升序，然后 `type` 升序。
3. Evidence：保持 Insight 内原始 index。
4. Reasoning：`insightId` 升序。

同一输入多次运行输出完全一致。

## 12. Truncation

文本过滤控制字符后截断到固定长度，并设置：

```json
{ "truncated": true }
```

超过 total byte budget 时按确定性顺序丢弃：

1. 先丢弃排序靠后的 reasoning；
2. 再丢弃排序靠后的 insights；
3. 如果仍超限，fail closed：

```text
FIREWALL_CONTEXT_TOO_LARGE
```

不会破坏 JSON 结构，不会静默扩大预算。

## 13. Provenance

事实 provenance 保留：

```text
insightId
evidenceId = insightId:index
evidence source / authority / metric / period
reasoningId = reasoning:insightId
reasoning evidenceRefs
```

内部数据库主键、内部权限字段和用户身份不进入 Provider Payload。

## 14. Prompt Injection Boundary

本阶段 Firewall 不解释文本中的命令。

```text
COURSE CONTENT ≠ INSTRUCTION
EVIDENCE TEXT ≠ SYSTEM PROMPT
USER TEXT ≠ SYSTEM INSTRUCTION
```

未来 Prompt 层必须将 Firewall Payload 放入 `<context_data>` 数据边界，并声明其只是 DATA。

## 15. Read-only Boundary

Firewall 只执行：

```text
validate
filter
bound
project
sort
truncate
```

不执行：

```text
DB mutation
CGStore mutation
Memory write
Knowledge State write
Reflection write
Action execution
```

## 16. Provider Independence

Firewall 不依赖：

```text
OpenAI
Anthropic
Gemini
DeepSeek
任何 SDK
Base URL
API Key
Model name
```

它只输出 provider-neutral 结构。

## 17. Failure Behavior

| Failure | Result |
| --- | --- |
| invalid schema | fail closed |
| invalid authority | fail closed |
| invalid confidence | fail closed |
| malformed provenance | fail closed |
| sensitive key | `SENSITIVE_FIREWALL_INPUT` |
| ownership mismatch | `FIREWALL_OWNERSHIP_MISMATCH` |
| writable context | `INVALID_CONTEXT_PERMISSIONS` |
| free prompt task | `INVALID_FIREWALL_TASK` |
| still over budget | `FIREWALL_CONTEXT_TOO_LARGE` |

## 18. Testing Contract

新增测试：

```text
backend/test/agentLlmContextFirewall.test.js
```

覆盖：

- valid context；
- provider payload 不含 owner / userId / internal permissions；
- invalid schema / confidence / provenance / task；
- sensitive keys；
- ownership mismatch；
- writable context；
- deterministic ordering；
- byte budget；
- unsupported authority。

## 19. Future Integration

后续阶段顺序：

```text
27.6.2 Provider Abstraction
27.6.3 LLM Output Validator
27.6.4 API Integration
27.6.5 Frontend Explanation Section
27.6.6 Independent Re-Audit
```

在输出 Validator 冻结前，Firewall 不应直接连接 Provider。

## 20. Architecture Invariants

```text
A. Context Firewall is the only path from deterministic context to LLM.
B. Firewall is allowlist first and fails closed.
C. Cross-user context is a hard security failure.
D. Sensitive credentials never enter LLM context.
E. Evidence provenance must survive Firewall projection.
F. All Firewall output is bounded and deterministic.
G. Firewall cannot mutate user data or execute actions.
H. Firewall does not know or depend on any LLM Provider.
I. LLM unavailable does not affect Agent Home deterministic output.
```

## Final Status

```text
PHASE 27.6.1: READY_TO_FREEZE
```
