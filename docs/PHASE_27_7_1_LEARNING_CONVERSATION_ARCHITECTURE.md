# Phase 27.7.1 Learning Conversation Architecture

Status: **ARCHITECTURE ONLY — READY_FOR_AUDIT**

Baseline:

```text
3f611b9 fix: enforce provider context firewall boundary
980c5e5 docs: freeze phase 27.7 mvp architecture
```

本阶段只定义架构契约，不实现 Chat UI、不修改生产代码、不改变 Agent 权限。

---

## 1. Purpose

Phase 27.7.1 定义“学习型对话”的目标架构边界，使 Agent 可以围绕用户的确定性学习数据回答解释型问题：

```text
User Query
→ Query Understanding
→ Context Selection
→ Existing Deterministic Adapters
→ Context Firewall
→ Deterministic Reasoning
→ Provider
→ LLM Explanation
→ Validators
→ Validated Learning Answer
```

本阶段的关键不是“让 AI 更自由地聊天”，而是让用户问题进入一条仍然可审计、可引用、可失败、可隔离的解释链路。

核心原则：

1. Analytics / Agent Home adapters 仍然是确定性事实来源。
2. LLM 只解释既有 Evidence、Insight 与 Reasoning。
3. 用户输入用于理解意图，不自动成为系统事实。
4. Course / Document 内容只能作为 DATA，不能作为 INSTRUCTION。
5. Control Plane 与 Data Plane 严格分离。
6. 无足够证据时必须明确返回无答案状态，而不是让 LLM 生成可能正确的内容。

---

## 2. Non-goals

Phase 27.7.1 不实现、不引入、不授权：

1. Chat UI。
2. Streaming。
3. WebSocket。
4. Multi-agent。
5. Autonomous agent。
6. Planner。
7. Action Executor。
8. Memory Writer。
9. GrowthMemory Writer。
10. CoachMemory Writer。
11. Tutor mode。
12. Autonomous tool calling。
13. Arbitrary RAG rewrite。
14. Vector database rewrite。
15. CGStore rewrite。
16. Sync rewrite。
17. Analytics rewrite。
18. Goals rewrite。
19. Course schema rewrite。
20. Knowledge State schema rewrite。
21. Existing Provider replacement。
22. Existing Context Firewall rewrite。
23. Broad frontend refactor。

若实现阶段需要以上能力，必须另建 Phase 并重新审计。

---

## 3. Architecture Overview

### 3.1 逻辑链

```text
User
  ↓ learning-conversation-request-v1
Request Contract + Authentication
  ↓
Query Understanding        query-understanding-v1
  ↓
Context Selection          context-selection-v1
  ↓
Agent Home Read Adapters   learning-context-v1 / agent-insight-v1 / agent-reasoning-v1
  ↓
Context Firewall           agent-llm-context-v1
  ↓
Prompt Registry            versioned prompt contract
  ↓
Provider                   bounded provider payload
  ↓
LLM Explanation            raw candidate only
  ↓
Output Contract
  ↓
Evidence Binding
  ↓
Semantic Validation
  ↓
Numerical / Temporal Consistency
  ↓
Validated Answer           validated-learning-answer-v1
  ↓
User
```

### 3.2 实际装配原则

本阶段不创建第二套 Agent Context、第二套 Validator、第二套 Provider、第二套 Prompt Registry。

Phase 27.7.1 只新增以下前置契约：

```text
learning-conversation-request-v1
query-understanding-v1
context-selection-v1
validated-learning-answer-v1
```

它们必须收敛到现有冻结模块：

```text
agentFirewall
agentPrompt
agentProvider
agentGateway
agentOutputValidator
agentEvidenceBinding
agentSemanticValidator
```

### 3.3 阶段关系说明

Phase 27.7 曾将 Context Selection 与 Query Understanding 记录为后续能力。Phase 27.7.1 是架构-only 层，定义 Learning Conversation 的集成边界；实现顺序仍应保持 additive，不得因为本档存在而跳过契约测试或直接修改冻结模块。

---

## 4. Request Contract

### 4.1 Contract 名称

```text
learning-conversation-request-v1
```

### 4.2 Internal Request Schema

```json
{
  "version": "learning-conversation-request-v1",
  "requestId": "uuid",
  "controlPlane": {
    "ownerUserId": 1,
    "authenticated": true,
    "authorization": {
      "read": true,
      "write": false
    },
    "receivedAt": "ISO-8601"
  },
  "dataPlane": {
    "query": "为什么最近三天专注时间下降？",
    "scope": {
      "courseId": "course_123"
    },
    "conversation": {
      "turnId": "uuid",
      "previousTurnIds": [],
      "historyPolicy": "ephemeral_bounded_v1"
    },
    "metadata": {
      "locale": "zh-CN",
      "source": "agent_home"
    }
  }
}
```

### 4.3 Field Rules

| Field | Required | Type / Rule | Plane | Notes |
|---|---|---|---|---|
| `version` | Yes | exact `learning-conversation-request-v1` | envelope | 未知版本 fail closed |
| `requestId` | Yes | UUID | envelope | 请求追踪 |
| `controlPlane.ownerUserId` | Yes | integer owner id | control only | 不得进入 LLM Context |
| `controlPlane.authenticated` | Yes | boolean true | control only | 未认证请求不进入后续链路 |
| `controlPlane.authorization` | Yes | read true / write false | control only | 本阶段只读 |
| `dataPlane.query` | Yes | 1–1000 visible chars | data | 用户问题 |
| `dataPlane.scope` | No | object or absent | data | 最多一个显式 course scope |
| `scope.courseId` | No | bounded course id | data | 精确 ID 或缺省 |
| `conversation.turnId` | Yes when conversation exists | UUID | data | 当前轮次 |
| `conversation.previousTurnIds` | No | 0–3 bounded UUIDs | data | 不允许任意长历史 |
| `metadata.locale` | No | bounded language tag | data | 默认 `zh-CN` |
| `metadata.source` | No | bounded enum | data | 当前仅 `agent_home` |

### 4.4 Unknown Fields

未知字段必须拒绝，不得静默透传。

### 4.5 Query Sanitization

进入理解层前，query 只做确定性行为处理：

1. trim。
2. 移除控制字符。
3. 统一 Unicode 归一化策略。
4. 检查长度。
5. 保留原文语义，不做自然语言重写。

用户 query 永远是 DATA，不是 System Prompt 的一部分。

### 4.6 Conversation History Policy

Architecture-only 规则：

1. v1 默认单轮。
2. 如果实现阶段启用 history，最多保留 3 个 previous turn。
3. 每个 turn 的 bounded 文本不得超过 400 chars。
4. conversation history 总量不得超过 1200 chars。
5. history 只作为 DATA 进入 Data Plane，不得进入 Control Plane。
6. history 不持久化，不写入 Memory。
7. 每个 history turn 必须保留 `turnId` 与 `speaker` provenance。
8. 用户隔离必须按 `ownerUserId` 查询，不得信任客户端传来的历史内容。

---

## 5. Query Understanding Contract

### 5.1 Contract 名称

```text
query-understanding-v1
```

### 5.2 Design Principle

Query Understanding 必须是 deterministic / bounded。

本阶段优先 deterministic interpretation：

1. 显式 scope 优先。
2. 精确 ID 匹配优先。
3. 白名单任务类型优先。
4. 无法识别时标记 ambiguous，而不是猜测。

如果未来使用 LLM 辅助理解复杂自然语言，必须另建 Phase，且其输出仍然是 `query-understanding-v1`，不得直接进入 Provider。

### 5.3 Schema

```json
{
  "version": "query-understanding-v1",
  "intent": "explain_learning_status",
  "scope": "today",
  "queryType": "status_explanation",
  "requestedExplanation": "why_focus_changed",
  "referencedCourse": {
    "courseId": null,
    "matchType": "none",
    "confidence": 0
  },
  "referencedKnowledge": {
    "knowledgeNodeId": null,
    "matchType": "none",
    "confidence": 0
  },
  "ambiguity": "none",
  "confidence": 1,
  "truncated": false
}
```

### 5.4 Allowed Enums

| Field | Allowed Values |
|---|---|
| `intent` | `explain_learning_status`, `explain_insight`, `explain_course_progress`, `clarify_selected_context`, `unsupported_or_ambiguous` |
| `scope` | `today`, `course`, `knowledge_state`, `no_scope` |
| `queryType` | `status_explanation`, `evidence_explanation`, `progress_explanation`, `clarification`, `unsupported` |
| `requestedExplanation` | `why_focus_changed`, `why_consistency_changed`, `why_progress_changed`, `why_knowledge_gap`, `what_selected_context_means`, `none` |
| `ambiguity` | `none`, `multiple_course`, `missing_reference`, `unrecognized_reference`, `unsupported_query` |
| `matchType` | `exact`, `none` |

### 5.5 Deterministic Rules

1. 显式 `scope.courseId` 存在时，`scope = course`，`referencedCourse.matchType = exact`。
2. 无 scope 且无法解析课程引用时，`scope = today` 或 `no_scope`，不得猜课程。
3. 无法识别用户问题对应的白名单解释类型时，`intent = unsupported_or_ambiguous`。
4. `confidence` 只表示解析器对自身分类的确定性，不表示学习事实正确性。
5. Query Understanding 不调用 Course mutation、Knowledge State mutation、Memory mutation 或 Analytics mutation。
6. Query Understanding 不创建 Evidence。
7. Query Understanding 不决定答案内容。

---

## 6. Context Selection Contract

### 6.1 Contract 名称

```text
context-selection-v1
```

### 6.2 Role

Context Selection 决定“哪些既有来源可以进入确定性上下文组装”，不生成新事实，不解释答案。

### 6.3 Schema

```json
{
  "version": "context-selection-v1",
  "requestId": "uuid",
  "ownerUserId": 1,
  "selection": {
    "learningContext": true,
    "approvedInsights": true,
    "approvedReasoning": true,
    "courseKnowledge": false,
    "studentKnowledgeState": false,
    "conversationHistory": false
  },
  "sourceLimits": {
    "maxInsights": 6,
    "maxReasoning": 6,
    "maxCourseKnowledgeNodes": 5,
    "maxKnowledgeStates": 5,
    "maxEvidenceReferences": 12,
    "maxHistoryTurns": 3
  },
  "reasonCodes": [
    "today_scope",
    "focus_insight_relevant"
  ]
}
```

注意：`ownerUserId` 允许出现在内部 selection 记录中，但该对象不得进入 `agent-llm-context-v1` 或 Provider payload。

### 6.4 Selectable Data

只允许选择：

1. deterministic facts。
2. approved insights。
3. approved reasoning。
4. existing course knowledge projections。
5. student knowledge state projections。
6. existing evidence references。
7. permitted user query。
8. bounded ephemeral conversation history。

### 6.5 Non-selectable Data

禁止选择：

1. raw DB dumps。
2. auth metadata。
3. tokens。
4. secrets。
5. session internals。
6. unrelated users。
7. internal implementation details。
8. arbitrary backend objects。
9. unbounded conversation history。
10. hidden system configuration。
11. raw analytics tables。
12. full CGStore object。
13. full course document。
14. Provider credentials。

### 6.6 Deterministic Selection Rules

1. Explicit course scope 优先。
2. 精确 course ID 优先于自然语言猜测。
3. Today 类问题优先选择当前学习状态、focus / consistency insight。
4. Course progress 类问题优先选择该课程的 knowledge state 与 progress insight。
5. 无 relevant source 时返回 `NO_RELEVANT_CONTEXT`，不进入 LLM。
6. Selection result 必须可由 source、limit、reason code 复现。
7. Selection 不得绕过 Agent Home adapters 直接访问 DB / CGStore。
8. Selection 不得因为上下文不足而扩大为全库扫描。

### 6.7 Boundedness

Context Selection 自身必须 bounded：

1. `maxInsights = 6`。
2. `maxReasoning = 6`。
3. `maxCourseKnowledgeNodes = 5`。
4. `maxKnowledgeStates = 5`。
5. `maxEvidenceReferences = 12`。
6. `maxHistoryTurns = 3`。
7. 最终仍由 Context Firewall 8192 bytes 预算兜底。

---

## 7. Context Firewall Boundary

### 7.1 Contract

最终进入 LLM 的上下文仍然必须收敛为：

```text
agent-llm-context-v1
```

不得创建：

```text
conversation-llm-context-v1
free-chat-context-v1
second-agent-context
```

### 7.2 Existing Boundary

1. `buildLlmContext()` 是唯一受控入口。
2. Provider payload 必须来自 `toProviderPayload()`。
3. Provider 侧必须再次执行 `toProviderPayload()`。
4. Context 预算仍为 8192 bytes。
5. 敏感键全树拒绝。
6. 未知字段不得透传。
7. `ownerUserId` 不进入 `agent-llm-context-v1`。
8. `ownerUserId` 不进入 Provider payload。
9. `permissions.write` 必须为空。
10. `actionLevel` 必须保持 `insight_only`。

### 7.3 Composition Boundary

`learning-conversation-request-v1`、`query-understanding-v1` 与 `context-selection-v1` 不得整体 spread 到 Firewall Context。

允许进入 Firewall 的只有显式 allowlist 字段，例如：

1. bounded task。
2. bounded available flag。
3. bounded sources。
4. bounded insights。
5. bounded reasoning。
6. bounded constraints。
7. bounded read-only metadata。
8. bounded permitted query understanding fields。

禁止 object spread、deep clone passthrough、raw request passthrough。

### 7.4 Task Extension

现有 task enum 是固定 allowlist。若实现阶段需要学习问答 task，只能 additive 新增：

```text
answer_learning_question
```

并同步更新 Context Contract、Provider Contract、Prompt Registry 与测试。任何新增都必须保持既有 task 向后兼容。

---

## 8. Reasoning Boundary

### 8.1 Deterministic Facts

Deterministic facts 只能来自：

1. Analytics。
2. Agent Home deterministic adapters。
3. Course Space approved projections。
4. Student Knowledge State approved projections。

它们不是 LLM 输出。

### 8.2 Insight

Insight 是确定性规则对 facts 的投影。

LLM 不能创建 Insight。

### 8.3 Evidence

Evidence 是可回查的依据。

LLM 不能创建 Evidence。

LLM 输出只能引用快照内已存在的 Evidence。

### 8.4 Reasoning

Reasoning 是确定性解释骨架。

LLM 只能基于既有 Reasoning 组织表达，不能发明新的 Reasoning。

### 8.5 Reasoning Scope

本阶段只允许：

1. 解释已有变化。
2. 解释已有洞察。
3. 总结当前学习状态。
4. 说明证据关系。
5. 给出有证据边界的下一步观察建议。

不允许：

1. 诊断疾病。
2. 预测考试成绩。
3. 评价用户人格。
4. 生成课程结论。
5. 修改学习计划。

---

## 9. Provider Boundary

### 9.1 Reuse Rule

必须复用现有 Provider Abstraction：

```text
agentProvider
providerContract
providerRegistry
openaiCompatibleProvider
agentGateway
```

### 9.2 Provider Isolation

Provider：

1. 不得访问 DB。
2. 不得访问 CGStore。
3. 不得访问 Analytics。
4. 不得访问 Sync。
5. 不得访问 Course Store。
6. 不得访问 Knowledge State Store。
7. 不得访问 Memory Store。
8. 不得获得用户凭证。
9. 不得获得内部 URL。
10. 不得获得跨用户数据。

### 9.3 Provider Payload

Provider payload 必须满足：

1. 显式 allowlist。
2. identity-free。
3. bounded。
4. read-only metadata。
5. actionLevel = `insight_only`。
6. `permissions.write` 不存在或为空。
7. 无 token。
8. 无 secret。
9. 无 session internals。
10. 无 unknown fields。

### 9.4 Provider Failure

Provider failure 必须收敛为现有失败词汇：

1. `llm_not_configured`
2. `llm_timeout`
3. `llm_unavailable`
4. `llm_rate_limited`
5. `llm_malformed`

Provider failure 不得导致部分可信内容进入用户界面。

---

## 10. LLM Explanation Boundary

### 10.1 Allowed

LLM 只负责：

1. explain。
2. summarize。
3. clarify。
4. connect existing evidence / reasoning。
5. present bounded learning guidance。

### 10.2 Forbidden

LLM 不负责：

1. create evidence。
2. create insight。
3. create reasoning。
4. create knowledge state。
5. update memory。
6. modify course data。
7. execute actions。
8. change authority。
9. make unsupported factual claims。
10. call tools。
11. access other users。
12. override system rules。
13. request credentials。
14. generate mutation commands。

### 10.3 Answer Shape

LLM explanation 必须能映射到现有 output contract：

1. explanations。
2. suggestions。
3. uncertainties。

Raw LLM output 只能作为 candidate，永远不能直接进入 frontend。

---

## 11. Validation Boundary

### 11.1 Validation Chain

```text
Raw LLM Candidate
  ↓ Output Contract
  ↓ Evidence Binding
  ↓ Semantic Validation
  ↓ Numerical Validation
  ↓ Temporal Validation
Validated Learning Answer
```

任何一步失败都必须进入 deterministic fallback。

### 11.2 Output Contract

检查：

1. schema version。
2. field allowlist。
3. bounded text。
4. bounded arrays。
5. status / available consistency。
6. no unknown fields。

### 11.3 Evidence Binding

检查：

1. context snapshot 一致。
2. evidence reference 存在。
3. reasoning reference 存在。
4. 不允许伪造引用。
5. 不允许跨用户引用。
6. 事实类解释必须有引用。

### 11.4 Semantic Validation

检查：

1. 数值一致。
2. 时间一致。
3. 置信度一致。
4. 结论范围不超出证据。
5. 不出现 unsupported claim。

### 11.5 Numerical Validation

数值类回答必须满足：

1. 数值来自 Evidence 或 Deterministic Fact。
2. 单位一致。
3. 百分比、分钟、次数不混淆。
4. 不做四舍五入后改变语义。
5. 不凭空补足缺失数值。

### 11.6 Temporal Validation

时间类回答必须满足：

1. period 与 Evidence period 一致。
2. today / 7d / 30d 不互换。
3. 趋势方向一致。
4. 不把历史周期表述为当前周期。
5. 不凭空插入时间点。

---

## 12. Evidence Binding

### 12.1 Answer Evidence Rule

`fact` / `interpretation` 类回答必须绑定：

1. existing evidence。
2. existing reasoning。
3. context snapshot。

### 12.2 Suggestion Evidence Rule

suggestion 不得伪造证据。

它只能：

1. 基于既有 uncertainty。
2. 基于既有 suggestion。
3. 基于用户已有数据的 bounded guidance。

### 12.3 Failure

任何无效引用都触发：

```text
llm_evidence_mismatch
```

并返回 deterministic fallback。

### 12.4 No Evidence Creation

LLM 输出中的以下情况都不允许：

1. 新 evidence id。
2. 新 metric。
3. 新 source。
4. 新 authority。
5. 新用户。
6. 新课程。
7. 新知识点。

---

## 13. User Input Authority

### 13.1 Authority

用户输入的 authority 是：

```text
user_provided
```

不是：

1. `system_fact`
2. `course_knowledge`
3. `evidence_backed_fact`
4. `analytics_derived`
5. `deterministic_projection`

### 13.2 Permitted Use

用户输入可以用于：

1. 理解意图。
2. 选择 course scope。
3. 选择 knowledge reference。
4. 澄清上下文。
5. 提供后续对话中的 bounded context。

### 13.3 Forbidden Use

用户输入不能用于：

1. 覆盖 system rules。
2. 修改权限。
3. 提升 authority。
4. 伪造 Evidence。
5. 修改用户身份。
6. 访问其他用户。
7. 写入 Memory。
8. 直接写入 Todo、Goal、Course、Knowledge State。
9. 执行 Action。
10. 重置 Analytics。

### 13.4 User Claim Handling

如果用户说：

```text
我今天学习了 10 小时
```

系统只能将其视为：

```text
user_asserted_unverified
```

不得自动写入系统数据，不得转化为 Evidence，不得作为统计事实。

---

## 14. Course / Document Data Handling

### 14.1 Data-not-Instruction

Course content、document text、knowledge node description 都是 DATA。

它们不能改变：

1. system prompt。
2. permission。
3. task。
4. schema。
5. validator rules。
6. output authority。
7. user identity。

### 14.2 Current Phase Boundary

Phase 27.7.1 不引入 raw course document 或 arbitrary RAG。

可选进入未来上下文的只有：

1. existing course knowledge projection。
2. approved knowledge node metadata。
3. bounded, source-labeled excerpt（若未来 Phase 明确授权）。

当前架构默认不把课程正文加入 Prompt。

### 14.3 Future Excerpt Rule

未来若引入 document excerpt，必须：

1. 使用独立 DATA wrapper。
2. 明确 source。
3. 明确 authority。
4. 明确 bounded length。
5. 明确不可执行。
6. 递归扫描 injection pattern。
7. 不允许 excerpt 出现在 System Prompt。
8. 不允许 excerpt 改变 JSON schema。
9. 输出引用必须回查到该 excerpt 的稳定引用。

---

## 15. User Isolation

### 15.1 Identity Boundary

`ownerUserId`：

1. 可以存在 control plane。
2. 用于 authentication / authorization。
3. 用于 Agent Home adapters 查询。
4. 用于 Evidence Binding ownership validation。
5. 不得进入 `agent-llm-context-v1`。
6. 不得进入 Provider payload。
7. 不得进入 Prompt。
8. 不得进入 LLM output。
9. 不得进入 user-visible answer。

### 15.2 Cross-user Protection

1. Agent Home adapters 必须以 authenticated `ownerUserId` 查询。
2. 不得信任客户端传入的另一个 userId。
3. Context Selection 记录必须与 request owner 一致。
4. Evidence Binding 必须检测 LLM 输出中的 cross-user identity。
5. cross-user 一律 fail closed。

### 15.3 Isolation Tests

必须覆盖：

1. owner A 请求不能看到 owner B context。
2. owner A query 不能触发 owner B evidence。
3. LLM output 引用 owner B identity 时 fail closed。
4. history 不得跨 owner 读取。
5. request owner 与 adapter owner 不一致时 fail closed。

---

## 16. Bounded Context Policy

### 16.1 Budget Layers

| Layer | Bound |
|---|---|
| query | 1000 chars |
| history turn | 400 chars |
| history total | 1200 chars |
| previous turns | 3 |
| selected insights | 6 |
| selected reasoning | 6 |
| selected course knowledge nodes | 5 |
| selected knowledge states | 5 |
| selected evidence references | 12 |
| final LLM context | 8192 bytes |
| LLM output | existing output byte limit |

### 16.2 Overflow Behavior

1. Selection 层先按确定性 priority 裁剪。
2. Context Firewall 最终按既有确定性预算裁剪。
3. 超出预算必须置 `truncated = true`。
4. 不得为了回答用户问题临时提高预算。
5. 不得使用 unbounded serialization。
6. 不得隐藏 truncation。

### 16.3 History Retention

1. v1 不持久化 history。
2. 默认单轮。
3. history 只能 ephemeral。
4. 不写入 Memory。
5. 不写入 GrowthMemory。
6. 不写入 CoachMemory。
7. 不写入 Analytics。
8. 不写入 Course Space。

---

## 17. Failure Matrix

| # | Failure | Behavior | Fallback / Result | User-visible | Logging | Security Implication |
|---|---|---|---|---|---|---|
| F01 | invalid request | fail closed | `INVALID_REQUEST` | 友好错误：请检查问题输入 | error code + request id，不含 raw query | 防止 unknown fields / oversized payload 进入 |
| F02 | unauthorized user | fail closed | `UNAUTHORIZED` | 登录提示 / 401 | request id + auth failure | 阻止匿名访问 |
| F03 | forbidden write intent | fail closed | `READ_ONLY_REQUIRED` | 当前仅支持只读学习解释 | request id | 阻止权限提升 |
| F04 | ambiguous query | fail closed before LLM | `AMBIGUOUS_QUERY` | 请选择课程或补充范围 | ambiguity code | 防止猜测生成 |
| F05 | no relevant context | fail closed before LLM | `NO_RELEVANT_CONTEXT` | 暂无可解释的学习数据 | reason code | 防止无中生有 |
| F06 | insufficient evidence | deterministic no-answer | `INSUFFICIENT_EVIDENCE` | 证据不足，无法解释 | reason code | 防止 unsupported claim |
| F07 | context limit exceeded | deterministic truncation / fallback | `CONTEXT_LIMIT_EXCEEDED` | 提示上下文受限 | limits + truncated flag | 防止 token / cost 爆炸 |
| F08 | provider unavailable | fail closed to fallback | `llm_unavailable` | 确定性学习摘要或稍后再试 | provider reason | 阻止内部错误泄露 |
| F09 | provider timeout | fail closed to fallback | `llm_timeout` | 稍后再试 | reason + latency bucket | 阻止挂起 |
| F10 | provider rate limited | fail closed to fallback | `llm_rate_limited` | 稍后再试 | reason | 成本保护 |
| F11 | malformed LLM output | fail closed | `llm_malformed` / `llm_schema_invalid` | deterministic fallback | validator summary | 阻止 raw output |
| F12 | unsupported factual claim | fail closed | `llm_unsupported_claim` | deterministic fallback | semantic violation code | 防止幻觉 |
| F13 | invalid evidence reference | fail closed | `llm_evidence_mismatch` | deterministic fallback | binding violation | 阻止伪造引用 |
| F14 | cross-user reference | fail closed | `llm_evidence_mismatch` / ownership violation | generic fallback | ownership violation，不含跨用户数据 | 强隔离 |
| F15 | semantic mismatch | fail closed | `llm_unsafe` | deterministic fallback | semantic violation | 阻止语义漂移 |
| F16 | numerical mismatch | fail closed | `llm_unsafe` / numerical violation | deterministic fallback | numeric check code | 防止数字幻觉 |
| F17 | temporal mismatch | fail closed | `llm_unsafe` / temporal violation | deterministic fallback | temporal check code | 防止时间幻觉 |
| F18 | prompt injection in query | query remains DATA | `unsupported_or_ambiguous` 或 normal bounded flow | 不执行注入指令 | injection attempt category | 防止用户文本变成指令 |
| F19 | prompt injection in course text | data stays DATA, output validation remains | `llm_unsafe` / evidence mismatch | deterministic fallback | injection category | 防止资料覆盖系统规则 |
| F20 | validation failure generic | fail closed | `llm_unsafe` / `llm_schema_invalid` | deterministic fallback | validator summary | 保持 raw output 不出链 |

### 17.1 No-answer Boundary

系统必须显式支持：

```text
INSUFFICIENT_EVIDENCE
UNSUPPORTED
OUTSIDE_SCOPE
AMBIGUOUS_QUERY
NO_RELEVANT_CONTEXT
UNAVAILABLE
```

禁止：

```text
模型觉得可能正确 → 自动成为事实
```

---

## 18. Security Model

### 18.1 Authority Levels

| Source | Authority |
|---|---|
| Analytics / deterministic adapters | `deterministic_projection` |
| Insight | `approved_insight` |
| Evidence | `evidence` |
| Reasoning | `approved_reasoning` |
| Course knowledge | `course_projection` |
| Student knowledge state | `knowledge_state_projection` |
| User query | `user_provided` |
| LLM text | `llm_explanation_only` |
| Document excerpt（future） | `bounded_document_data` |

### 18.2 Hard Rules

1. `ownerUserId` 不进入 LLM context。
2. `ownerUserId` 不进入 Provider payload。
3. authorization token 不进入 Prompt。
4. secret / API key 不进入 Prompt。
5. session internals 不进入 Prompt。
6. unknown fields 不得自动透传。
7. cross-user context 必须 fail closed。
8. course / document text 只能作为 DATA。
9. malicious document text 不得改变 system rules。
10. LLM output 不得提升 authority。
11. LLM output 不得写 Memory。
12. LLM output 不得执行 Action。
13. Provider 不得获得 DB / CGStore 访问权。
14. Provider adapter 不得绕过 Context Firewall。
15. Context Selection 不得绕过 Agent Home adapters / existing source boundaries。

---

## 19. Privacy Model

1. 只处理当前 authenticated owner 的数据。
2. 不把 raw query 写入日志。
3. 不把用户内容写入 observability。
4. 不记录 token、secret、authorization header。
5. 不记录 internal stack trace。
6. 不把 Provider 响应原文作为系统日志。
7. 日志只允许 reason code、request id、bounded latency、validator summary。
8. v1 不持久化 conversation。
9. 未来若持久化 conversation，必须另建 retention、encryption、owner isolation 和删除策略。

---

## 20. Observability

### 20.1 Allowed Signals

1. `requestId`
2. `turnId`
3. reason code
4. fallback reason
5. context truncated flag
6. validator violation category
7. provider failure reason
8. latency bucket
9. outcome enum

### 20.2 Forbidden Signals

1. raw query。
2. LLM raw prompt。
3. LLM raw reply。
4. owner user id in data-plane logs。
5. authorization token。
6. secret。
7. session internals。
8. other users' data。
9. full Provider payload。
10. full stack trace。

### 20.3 Trace Correlation

日志必须能通过 `requestId` 关联 request outcome，但不得把可恢复的用户文本与身份写入同一日志。

---

## 21. Testing Strategy

### 21.1 Contract Tests

覆盖：

1. valid request。
2. invalid version。
3. missing query。
4. empty query。
5. oversized query。
6. invalid scope。
7. unknown fields。
8. invalid conversation metadata。
9. invalid locale。
10. oversized history。

### 21.2 Query Understanding Tests

覆盖：

1. explicit course scope。
2. today scope。
3. unsupported query。
4. ambiguous course reference。
5. missing reference。
6. confidence 不作为事实正确性。

### 21.3 Context Selection Tests

覆盖：

1. allowlist-first。
2. deterministic priority。
3. source limits。
4. no relevant context。
5. unrelated user data 不选择。
6. raw DB 不选择。
7. arbitrary object 不选择。
8. budget overflow。

### 21.4 Security Tests

覆盖：

1. `ownerUserId` leakage。
2. `userId` leakage。
3. sessionId leakage。
4. token leakage。
5. secret leakage。
6. cross-user context。
7. malicious course text。
8. malicious evidence text。
9. prompt injection inside document。
10. prompt injection inside query。
11. LLM identity spoofing。

### 21.5 Boundary Tests

覆盖：

1. Query Understanding cannot write。
2. Context Selection cannot write。
3. Provider cannot access DB。
4. LLM cannot create evidence。
5. LLM cannot create reasoning。
6. LLM cannot create memory。
7. LLM cannot execute actions。
8. Context Firewall cannot be bypassed。
9. Provider adapter cannot be bypassed。

### 21.6 Validation Tests

覆盖：

1. unsupported claim。
2. invalid evidence。
3. numerical mismatch。
4. temporal mismatch。
5. semantic mismatch。
6. malformed output。
7. oversized output。
8. fake reference。
9. cross-user reference。

### 21.7 Regression Tests

覆盖：

1. 既有 Agent Home GET 链路。
2. 既有 explain task。
3. 既有 fallback 行为。
4. 既有 Context Firewall 8192 bytes。
5. 既有 Provider allowlist。
6. 既有 Validator chain。
7. frontend 现有页面无回归。

---

## 22. Future Extension Boundary

| Future Capability | Boundary |
|---|---|
| Context Selection implementation | 必须使用 `context-selection-v1`，不得直接改防火墙 |
| Query Understanding implementation | 必须使用 `query-understanding-v1`，不得让用户文本成为指令 |
| Course / Document evidence | 必须另建 Phase，使用 DATA wrapper 与稳定引用 |
| Conversation persistence | 必须另建 retention / privacy / deletion phase |
| Tutor mode | 必须扩展 reasoning / pedagogy boundary，不得自动写 Mastery |
| Adaptive Planning | 必须保持建议 → 用户确认 → Store 写入 |
| Memory Writer | 必须独立 Phase，禁止 LLM 直接写 |
| Tool Calling | 必须另建 permissioned tool contract |
| Multi-agent | 禁止在 27.7.x 引入 |

---

## 23. Architecture Invariants

1. Analytics 是事实来源，LLM 不是。
2. Learning Conversation 只做解释，不创造事实。
3. `ownerUserId` 只属于 control plane。
4. `ownerUserId` 不进入 `agent-llm-context-v1`。
5. `ownerUserId` 不进入 Provider payload。
6. Provider payload 是 identity-free allowlist。
7. 用户输入是 `user_provided`，不是系统事实。
8. Course / Document text 是 DATA，不是 INSTRUCTION。
9. LLM 不能创建 Evidence、Insight、Reasoning、Knowledge State、Memory。
10. LLM 不能执行 Action。
11. `permissions.write` 必须为空。
12. `actionLevel` 必须保持 `insight_only`。
13. Context Selection 不能绕过 Agent Home adapters。
14. Provider 不能访问 DB / CGStore。
15. Validator 链不能被绕过。
16. Raw LLM output 不能进入 frontend。
17. 无证据必须返回无答案，而不是生成答案。
18. Cross-user access 必须 fail closed。
19. Unknown fields 必须 fail closed。
20. Context / output 必须 bounded。
21. Prompt injection 输入不能改变 system rules。
22. Validation failure 必须进入 deterministic fallback。
23. 本阶段不引入 Memory Writer、Action Executor、Tutor、Autonomous Agent。
24. 任何未来扩展不得破坏 Phase 27.7 冻结边界。

---

## 24. Freeze Criteria

Phase 27.7.1 Architecture 可以 freeze，当且仅当：

1. Architecture completeness PASS。
2. Request / Understanding / Selection / Answer contract 一致。
3. Context boundary 与 Phase 27.7 冻结边界一致。
4. Identity boundary 明确。
5. User isolation 完整。
6. Evidence integrity 完整。
7. LLM authority boundary 完整。
8. Provider isolation 完整。
9. Prompt injection boundary 完整。
10. Failure matrix 完整。
11. Boundedness 明确。
12. Privacy model 明确。
13. Backward compatibility PASS。
14. Future extensibility 明确。
15. Independent audit Critical = 0、High = 0、Medium = 0。
16. 本阶段没有修改生产代码。

## Final Status

**READY_FOR_INDEPENDENT_AUDIT**
