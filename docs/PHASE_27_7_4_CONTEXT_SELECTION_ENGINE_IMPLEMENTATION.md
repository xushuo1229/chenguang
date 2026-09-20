# Phase 27.7.4 Context Selection Engine Implementation

Status: **IMPLEMENTATION COMPLETE — READY_FOR_INDEPENDENT_AUDIT**

Baseline:

```text
720b383 docs: freeze phase 27.7.3 query understanding contract
512c45c docs: architect phase 27.7.3 query understanding contract
03cad8c docs: freeze phase 27.7.2 context selection architecture
```

---

## 1. Implementation Goal

实现最小、纯确定性、只读的 Context Selection Engine：

```text
query-understanding-v1
  ↓
Context Selection Engine
  ↓
context-selection-result-v1
```

本阶段不实现 API、不接入 Provider、不引入 LLM、不修改 Context Firewall。

---

## 2. Module Boundary

```text
backend/src/services/agentContextSelection/
  contextSelectionContract.js
  contextSelectionEngine.js
```

### `contextSelectionContract.js`

负责：

1. `context-selection-result-v1` contract 常量。
2. `context-item-v1` contract 常量。
3. Source Allowlist / authority / priority。
4. Budget policy。
5. Control Plane validation。
6. `query-understanding-v1` validation。
7. Selection Result / Context Item validation。
8. deterministic fingerprint / deterministic UUID helpers。

### `contextSelectionEngine.js`

负责：

1. 纯确定性 selection。
2. scope matching。
3. deterministic relevance scoring。
4. deterministic ordering。
5. deterministic budget trimming。
6. provenance / authority projection。
7. fail-closed unsupported / ambiguous / cross-user paths。

不负责：

1. Query Understanding。
2. Retrieval。
3. Reasoning。
4. Answer generation。
5. Evidence / Insight / Reasoning creation。
6. Provider 调用。
7. 数据库访问。
8. Memory / Course / State mutation。

---

## 3. Contract Mapping

### Input

```text
query-understanding-v1
```

实现按 27.7.3 的 closed schema 校验，包括：

1. query / normalized query。
2. intent / queryType。
3. scope / courseRefs / knowledgeRefs。
4. requestedExplanation。
5. userProvidedContext。
6. ambiguity / clarification。
7. selectionHints。
8. confidence。
9. bounded conversationContext。
10. parser metadata。

### Output

```text
context-selection-result-v1
```

输出结构：

```json
{
  "controlPlane": {
    "requestId": "uuid",
    "ownerUserId": 1,
    "authorization": {
      "read": true,
      "write": false
    }
  },
  "dataPlane": {
    "contractVersion": "context-selection-result-v1",
    "selectionId": "uuid",
    "requestId": "uuid",
    "status": "selected | partial | insufficient_context | no_relevant_context | invalid_scope | rejected",
    "scope": {},
    "selectedItems": [],
    "omittedSources": [],
    "conflicts": [],
    "budget": {},
    "insufficientContext": true,
    "evidenceAvailable": true,
    "provenance": {},
    "metadata": {}
  }
}
```

`ownerUserId` 只存在于 `controlPlane`，不进入 `dataPlane`。

---

## 4. Source Adapter Mapping

Engine 不直接访问 DB / CGStore / Sync / Course Space / Knowledge State。

调用方必须传入已经由 approved read-only adapter 产出、并按 authenticated owner 获取的 bounded candidates。

| sourceType | Allowed adapter source | v1 status |
|---|---|---|
| `deterministic_fact` | behavior / deterministic learning summary projection | selectable |
| `approved_insight` | `agent-insight-v1` approved insight projection | selectable |
| `approved_reasoning` | `agent-reasoning-v1` reasoning projection | selectable |
| `course_knowledge` | Course Knowledge bounded projection | selectable |
| `student_knowledge_state` | Student Knowledge State bounded projection | selectable |
| `evidence` | existing evidence reference projection | selectable |
| `permitted_user_input` | current request bounded user input | selectable |
| `bounded_conversation_history` | ephemeral bounded conversation context | selectable |
| GrowthMemory | 不在 27.7.2 v1 source allowlist | not selectable |
| Reflection | adapter unavailable | not selectable |
| CoachMemory | adapter unavailable | not selectable |
| raw DB / CGStore / Sync / provider config | prohibited | rejected |

未知 source key 会触发：

```text
UNKNOWN_CONTEXT_SOURCE
```

---

## 5. Candidate Projection

Engine 输入候选是 approved adapter 的 bounded candidate，而不是 raw database row。

每个候选只允许：

```text
id
sourceId
text
scopeKind
courseId
knowledgeNodeId
labels
confidence
observedAt
provenance
evidenceRefs
metadata
ownerUserId
```

`ownerUserId` 只用于 input ownership validation；output context item 中删除该字段，只保留：

```json
{
  "ownershipVerified": true
}
```

---

## 6. Deterministic Selection Policy

### Scope Match

支持：

```text
no_scope
current_course
explicit_course
multiple_courses
explicit_knowledge
current_learning_period
explicit_time_period
mixed_scope
ambiguous_scope
```

规则：

1. `ambiguous_scope` 不选择。
2. `high ambiguity` 不选择。
3. `clarification.required = true` 不选择。
4. explicit course 只匹配 request 中合法引用的课程。
5. multiple courses 只匹配显式比较请求。
6. explicit knowledge 只匹配显式 knowledge reference。
7. no scope / time scope 只匹配 bounded general learning period。

### Relevance

Deterministic score：

| Signal | Score |
|---|---:|
| explicit course match | 100 |
| explicit knowledge match | 100 |
| normalized label token match | 80 |
| bounded current / time scope match | 70 |
| queryType / source affinity match | 60 |
| unrelated | omitted |

Threshold：

```text
score >= 60
```

### Ordering

同 score 时按：

1. source priority。
2. `sourceId` lexicographic。
3. candidate `id` lexicographic。

不使用随机、时间、LLM、Provider 或数据库顺序。

---

## 7. Budget

实现 `context-selection-budget-v1`：

| Limit | Value |
|---|---:|
| max source count | 8 |
| max items per source | 6 |
| max total items | 24 |
| max evidence items | 12 |
| max reasoning items | 6 |
| max insight items | 6 |
| max course items | 12 |
| max student state items | 5 |
| max history turns | 3 |
| max history chars | 1200 |
| max query chars | 1000 |
| max selected content chars | 4800 |
| max serialized selection bytes | 6144 |
| max estimated tokens | 1536 |

超预算时 deterministic omit，并写入：

```text
omittedSources[].reason = budget_exceeded
```

---

## 8. Security Boundary

### User Isolation

1. Control Plane 必须包含 authenticated owner。
2. authorization 必须是 `read=true`、`write=false`。
3. 任何 candidate owner mismatch 都使整个 selection 进入：

```text
rejected / CROSS_USER_SOURCE
```

不允许 filter-and-continue。

### Source Isolation

1. deny by default。
2. 未知 source reject。
3. 未知 candidate field reject。
4. 未知 result field reject。
5. sensitive source keys reject。
6. 不允许 raw DB row。
7. 不允许 full CGStore / Sync dump。

### Authority

每个 source type 输出固定 authority：

```text
deterministic_fact              → deterministic_projection
approved_insight                → approved_insight
approved_reasoning              → approved_reasoning
course_knowledge                → course_projection
student_knowledge_state         → knowledge_state_projection
evidence                        → evidence
permitted_user_input            → user_provided
bounded_conversation_history    → user_provided
```

Selection relevance 不改变 authority。

### Evidence Integrity

1. 只能选择已有 Evidence。
2. 非 Evidence item 只能引用最终已选中的 Evidence。
3. 引用不存在或未选中的 Evidence 时，item omitted。
4. Selector 不创建 Evidence。

### Prompt Injection

Course / Evidence / User Input / History 文本始终是 DATA。

Selector 不因文本内容改变 authority、scope、permissions 或 source allowlist。

---

## 9. Provider / API Boundary

本阶段：

1. 不新增 HTTP API。
2. 不修改 Runtime Gateway。
3. 不修改 Context Firewall。
4. 不修改 Provider。
5. 不产生 OpenAI request。
6. 不产生 Prompt。
7. 不执行 network call。

Selection result 是 internal architecture contract，不是 Provider contract。

---

## 10. Test Strategy

新增：

```text
backend/test/agentContextSelection.test.js
```

覆盖：

1. valid result。
2. invalid query understanding。
3. unknown query field。
4. oversized query。
5. deterministic output。
6. deterministic ordering。
7. cross-user fail-closed isolation。
8. explicit course isolation。
9. explicit multi-course comparison。
10. explicit knowledge selection。
11. missing knowledge 不猜测。
12. existing evidence selection。
13. existing insight + evidence linkage。
14. existing student knowledge state。
15. Reflection / CoachMemory unavailable 不伪造。
16. user input authority。
17. conversation history bounds。
18. per-source budget。
19. high ambiguity 不猜。
20. unsupported planner / action。
21. prompt injection remains DATA。
22. control-plane identity 不进入 data plane。
23. empty selection。
24. result contract self-validation。
25. unknown source。
26. unknown candidate field。

---

## 11. Validation Results

```yaml
Context Selection focused tests:
  26/26 PASS

Backend full regression:
  259/259 PASS

Frontend full regression:
  609/609 PASS

Build:
  PASS
```

---

## 12. Known Limitations

1. 本阶段不提供 HTTP API；这是刻意的最小边界。
2. 本阶段不把 Engine 自动接入 Runtime Gateway。
3. 本阶段不实现 semantic retrieval / embedding / vector index。
4. 本阶段不接入 GrowthMemory，因为 27.7.2 v1 source allowlist 未授权。
5. Reflection / CoachMemory 保持 unavailable。
6. Conversation history 默认由调用方以 bounded ephemeral 数据传入，Selector 不持久化。

---

## 13. Out of Scope

1. Query Understanding Engine。
2. Chat UI。
3. Tutor。
4. Planner。
5. Action Executor。
6. Memory Writer。
7. Evidence Writer。
8. Insight Writer。
9. Reasoning Writer。
10. Provider integration。
11. RAG / vector database。
12. Phase 27.7.5。
