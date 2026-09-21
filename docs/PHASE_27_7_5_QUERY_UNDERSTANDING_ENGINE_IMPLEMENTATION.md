# Phase 27.7.5 Query Understanding Engine Implementation

## 1. Frozen Contract

本阶段实现冻结契约 `query-understanding-v1`。Engine 只负责把 bounded user query 确定性转换为结构化理解结果，不负责 retrieve、select context、reason、answer、plan、act 或调用 Provider。

Source of Truth：

```text
docs/PHASE_27_7_3_QUERY_UNDERSTANDING_CONTRACT.md
docs/PHASE_27_7_4_CONTEXT_SELECTION_ENGINE_IMPLEMENTATION.md
```

## 2. Architecture

```text
bounded input
  → strict input validation
  → deterministic normalization
  → intent / queryType classification
  → scope extraction
  → course / knowledge reference extraction
  → ambiguity / clarification
  → selection hints
  → query-understanding-v1 data plane
  → context-selection-v1
```

模块：

| 文件 | 职责 |
| --- | --- |
| `backend/src/services/agentQueryUnderstanding/queryUnderstandingEngine.js` | deterministic parser / classifier |
| `backend/test/agentQueryUnderstanding.test.js` | contract、taxonomy、scope、reference、security、bounds、determinism、selection integration tests |

未修改 `agentContextSelection/`、`agentFirewall/`、`agentGateway/` 或 Provider。

## 3. Input Boundary

Engine 输入只允许：

```text
query
currentCourseContext
userProvidedContext
conversationContext
referenceTime
```

规则：

1. Unknown field fail closed。
2. 空查询、空白查询、超长查询、控制字符 reject。
3. `referenceTime` 只能来自显式 server context。
4. 不读取 wall clock、database、CGStore、Provider、memory 或 network。
5. Control plane 在第二参数中传入，`ownerUserId` 不进入 data plane。

## 4. Normalization

允许：

1. Unicode NFC。
2. 移除首尾空白。
3. 折叠连续空白。
4. 移除末尾标点。

禁止：

1. 翻译。
2. 释义。
3. 改变课程或知识语义。
4. 删除否定词。
5. 补充不存在的信息。

`query.raw` 保留原始 untrusted user input；`normalizedQuery` 是独立 bounded derivation。

## 5. Classification

支持契约内全部 intent：

```text
explain
summarize
compare
clarify
review
diagnose_learning
locate_knowledge
reflect
unsupported
unknown
```

同时保持 intent 与 queryType 分离。queryType 只描述问题结构，不代替用户目标。

## 6. Scope and References

Scope 支持全部契约值：

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

Reference 规则：

1. Course refs 最多 3 个。
2. Knowledge refs 最多 5 个。
3. 引用只表示用户提到，不验证数据库存在性。
4. `resolvedCourseId` / `resolvedKnowledgeNodeId` 保持 null。
5. explicit 与 contextual scope 分离；冲突保留为 `ambiguous_scope`。
6. 没有课程上下文时不猜测课程。

## 7. Ambiguity and Confidence

Ambiguity 描述多个合理解释；confidence 只描述 parser 对问题结构的理解确定性。

1. High ambiguity 触发 bounded clarification。
2. Clarification round 上限为 1。
3. Engine 不猜测 reference。
4. Confidence 不代表 fact、evidence、reasoning、LLM confidence。
5. Confidence 数值由 explicit signals、scope completeness、reference clarity 和 ambiguity deterministic 派生。

## 8. Security and Bounds

用户 query、user context、conversation context 全部视为 untrusted DATA。

安全边界：

1. Prompt injection 不执行。
2. Secret extraction 不响应。
3. Control-plane identity 不进入 data plane。
4. User input 不提升为 system fact。
5. 不创建 Evidence、Insight、Reasoning、Memory、Reflection。
6. 不修改 Todo、Goal、Analytics、Sync、AI Context。

Boundedness：

| 边界 | 值 |
| --- | ---: |
| query chars | 1000 |
| course refs | 3 |
| knowledge refs | 5 |
| user context items | 3 |
| user context per item chars | 400 |
| user context total chars | 1200 |
| conversation turns | 3 |
| conversation total chars | 1200 |
| serialized data-plane bytes | 4096 |

超界 fail closed，不截断语义。

## 9. Determinism

Engine 是 synchronous pure classifier：

1. 不使用 random。
2. 不使用 LLM。
3. 不使用 Provider。
4. 不使用 wall clock。
5. 不依赖 async order。
6. 不使用 external dependency。
7. 同一 input + control plane 产生相同 semantic output。

`interpretationId` 和 `metadata.fingerprint` 由 canonical data-plane hash 派生。

## 10. Context Selection Compatibility

测试直接使用 frozen `validateQueryUnderstanding()` 验证输出，并将输出传入 frozen `selectLearningContext()`。

Integration 覆盖：

1. explicit course。
2. explicit knowledge。
3. ambiguous query。
4. unsupported query。

Context Selection 仍然负责 existence、ownership、source priority、budget 和 selection decision。

## 11. Verification

```yaml
Query Understanding focused tests: 23/23 PASS
Backend regression: 282/282 PASS
Frontend regression: 609/609 PASS
Build: PASS
```

## 12. Known Limitations

1. Reference extraction 使用 deterministic lexical patterns，不做 semantic parsing。
2. 本阶段没有 HTTP API，也不接入 Gateway。
3. 不做 semantic retrieval、embedding 或 vector search。
4. 相对时间没有 `referenceTime` 时进入 safe ambiguity，不读取系统时间。
5. Course / Knowledge existence validation 属于 Context Selection。

## 13. Future Extension Boundary

后续如扩展 semantic parsing、history resolution、多轮澄清或 language-specific parser，必须新建 Phase 并保持：

1. deterministic parser boundary。
2. `query-understanding-v1` closed contract。
3. Control plane / data plane separation。
4. Context Selection ownership。
5. No LLM classification in Query Understanding。
