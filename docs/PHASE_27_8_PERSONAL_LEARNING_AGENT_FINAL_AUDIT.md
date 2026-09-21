# Phase 27.8 Personal Learning Agent MVP+ Final Audit

## Audit Result

READY_TO_FREEZE

## Executive Summary

Phase 27.8 独立审计完成。审计期间发现 Context Selection 曾主要承担调用门控职责，而 Insight、Reasoning 与 Gateway 仍可能接收完整 Agent Home Context。该问题已在 `56a3280 fix: enforce selected context projection boundary` 中以最小增量方式修复。

修复后，Learning Conversation Runtime 先执行 Query Understanding 与 Context Selection，再通过 `projectSelectedContext()` 生成只读、有界、owner-isolated 的 Selected Context Projection。随后 Deterministic Reasoning、Context Firewall、Provider、Output Validator、Evidence Binding 只消费该投影。

最终 Critical = 0、High = 0、Medium = 0，允许冻结。

## Scope

| File | Result |
| --- | --- |
| `backend/src/services/agentContextSelection/queryUnderstandingEngine.js` | PASS |
| `backend/src/services/agentContextSelection/contextSelectionEngine.js` | PASS |
| `backend/src/services/agentContextSelection/contextSelectionContract.js` | PASS |
| `backend/src/services/agentLearningConversation/learningConversationRuntime.js` | PASS |
| `backend/src/services/agentGateway/runtimeGateway.js` | PASS |
| `backend/src/services/agentFirewall/contextFirewall.js` | PASS |
| `backend/src/services/agentOutputValidator/outputContract.js` | PASS |
| `backend/src/services/agentEvidenceBinding/evidenceBindingContract.js` | PASS |
| `backend/src/services/agentSemanticValidator/semanticValidatorContract.js` | PASS |
| `backend/src/routes/agentHome.js` | PASS |
| `backend/src/services/studentPracticeService.js` | PASS |
| `backend/src/services/learningReviewService.js` | PASS |
| `backend/src/routes/learning.js` | PASS |
| `backend/test/agentLearningConversation.test.js` | PASS |
| `js/agentHomeView.js` | PASS |

## Architecture Scope

当前 MVP+ 保持以下冻结边界：

1. Query Understanding 不生成事实。
2. Context Selection 不生成事实、Evidence、Insight 或 Reasoning。
3. Runtime 只做只读编排。
4. Agent Home / deterministic adapters 仍是事实来源。
5. Context Firewall 是 Provider 前最后一道上下文边界。
6. LLM 输出必须通过 Output Contract、Evidence Binding 和 Semantic Validation。
7. Practice、Mastery Gate 与 Review Queue 继续复用 Student Knowledge State。
8. 没有引入 Planner、Action Executor、Memory Writer、Autonomous Agent、FSRS、BKT、Vector DB 或 Multi-Agent。

## Runtime Chain

修复后的实际链路：

```text
User Query
  → Input Allowlist
  → Query Understanding
  → Context Selection
  → Selected Context Projection
  → Deterministic Insight / Reasoning
  → Context Firewall
  → Provider / deterministic fallback
  → Output Validator
  → Evidence Binding
  → Semantic Validation
  → Validated / fallback answer
```

Evidence:

- `backend/src/services/agentLearningConversation/learningConversationRuntime.js:165` 定义 `projectSelectedContext()`。
- `backend/src/services/agentLearningConversation/learningConversationRuntime.js:261` 生成 `selectedContext`。
- `backend/src/services/agentLearningConversation/learningConversationRuntime.js:262` 使用投影生成 Insight。
- `backend/src/services/agentLearningConversation/learningConversationRuntime.js:263` 使用投影生成 Reasoning。
- `backend/src/services/agentLearningConversation/learningConversationRuntime.js:265` 将投影传给 Gateway。
- `backend/src/services/agentGateway/runtimeGateway.js:95` 在 Gateway 内部强制重建 Firewall Context。

## Security Boundary

PASS

1. `POST /api/agent-home/learning-conversation` 使用 `authRequired` 与 `aiLimiter`。
2. 用户身份只来自 authenticated `req.userId`，不信任客户端 owner。
3. Query、course context、selection scope、source allowlist、unknown field 均为 fail-closed。
4. High ambiguity、unsupported intent、rejected selection、empty selection 不会调用 Provider。
5. Runtime 权限恒为 read-only，`permissions.write` 为空数组。
6. Prompt 注入文本保持为 DATA，不改变 scope、authority、permissions 或 action level。
7. Provider failure、invalid provider、malformed JSON、invalid schema、unsupported claim 均进入 deterministic fallback。

Evidence:

- `backend/src/routes/agentHome.js:43`
- `backend/src/services/agentLearningConversation/learningConversationRuntime.js:75`
- `backend/src/services/agentLearningConversation/learningConversationRuntime.js:246`
- `backend/src/services/agentGateway/runtimeGateway.js:95`
- `backend/src/services/agentGateway/runtimeGateway.js:159`
- `backend/src/services/agentGateway/runtimeGateway.js:167`
- `backend/src/services/agentGateway/runtimeGateway.js:177`

## Cross-user Isolation

PASS

1. Learning Conversation 使用 authenticated owner 构建Control Plane。
2. Agent Home Context、Course Knowledge、Knowledge State、Practice、Mastery 和 Review Queue 均按 owner 查询。
3. Context Selection 对 cross-user source 整体 fail closed。
4. Evidence Binding 校验 output owner 与 firewall context owner。
5. Runtime 测试确认第二用户不能读取第一用户课程上下文。

Evidence:

- `backend/src/services/agentLearningConversation/learningConversationRuntime.js:256`
- `backend/test/agentContextSelection.test.js:309`
- `backend/test/agentLearningConversation.test.js:159`
- `backend/test/agentEvidenceBinding.test.js:127`
- `backend/test/learningPracticeMasteryReview.test.js:125`

## Context Firewall

PASS

1. Gateway 是唯一入口，调用方无法直接向 Provider 传入现成上下文。
2. `buildLlmContext()` 只投影 allowlisted sources、insights、reasoning 和 constraints。
3. Firewall Context 保持 8192 bytes 上限。
4. `toProviderPayload()` 继续移除非契约字段和内部 metadata。
5. Selected Context Projection 将 behavior、reflections、memories 设置为不可用，只保留 Selection 明确允许的 course / knowledge / evidence / state 边界。
6. Focused runtime test 验证 Provider payload 不包含 `behavior` source，也不包含 `behavior_adapter` evidence。

Evidence:

- `backend/src/services/agentLearningConversation/learningConversationRuntime.js:165`
- `backend/src/services/agentGateway/runtimeGateway.js:95`
- `backend/src/services/agentFirewall/contextFirewall.js:154`
- `backend/src/services/agentFirewall/contextFirewall.js:176`
- `backend/test/agentLearningConversation.test.js:73`
- `backend/test/agentLearningConversation.test.js:98`

## Provider Boundary

PASS

1. Provider 只能接收 `toProviderPayload()` 后的 bounded payload。
2. Provider adapter 缺失或失败不会将原始错误透出给用户。
3. Provider failure 返回 deterministic fallback。
4. Provider output 只被视为候选答案，不是 Source of Truth。
5. Runtime 无 tool calling、write action、memory write 或 autonomous retry。

Evidence:

- `backend/src/services/agentGateway/runtimeGateway.js:95`
- `backend/src/services/agentGateway/runtimeGateway.js:118`
- `backend/src/services/agentGateway/runtimeGateway.js:151`
- `backend/test/agentGateway.test.js:377`
- `backend/test/agentGateway.test.js:396`

## Output Validation

PASS

1. Provider reply 必须是 JSON。
2. `outputContract.validateOutputContract()` 校验候选输出。
3. `validateEvidenceBinding()` 校验 snapshot、owner 和 evidence reference。
4. `validateSemanticValidation()` 拒绝 unsupported claim、scope violation 和数值不一致。
5. 任一校验失败都会进入 deterministic fallback。

Evidence:

- `backend/src/services/agentGateway/runtimeGateway.js:159`
- `backend/src/services/agentGateway/runtimeGateway.js:162`
- `backend/src/services/agentGateway/runtimeGateway.js:167`
- `backend/src/services/agentGateway/runtimeGateway.js:177`

## Evidence Binding

PASS

1. Firewall Context snapshot id 在 Provider 前计算。
2. Candidate output 必须引用真实 insight evidence。
3. Owner mismatch 拒绝。
4. Ghost evidence、duplicate reference、snapshot mismatch 拒绝。
5. Fallback output 不绕过 Output Contract。

Evidence:

- `backend/src/services/agentGateway/runtimeGateway.js:56`
- `backend/src/services/agentGateway/runtimeGateway.js:96`
- `backend/src/services/agentGateway/runtimeGateway.js:167`
- `backend/test/agentEvidenceBinding.test.js:91`
- `backend/test/agentEvidenceBinding.test.js:127`

## Practice Boundary

PASS

1. Practice attempt 必须显式 `confirmed = true`。
2. Course ownership 通过 Sync 数据校验。
3. Knowledge Node ownership 通过 `findNode()` 校验。
4. Practice attempt 是 append-only user-owned log。
5. Practice 不直接改写 mastery 字段，而是通过既有 `recordEvidence()` 聚合。
6. Score、duration、mode、payload 均有边界校验。

Evidence:

- `backend/src/services/studentPracticeService.js:67`
- `backend/src/services/studentPracticeService.js:75`
- `backend/src/services/studentPracticeService.js:78`
- `backend/src/services/studentPracticeService.js:85`
- `backend/src/services/studentPracticeService.js:90`
- `backend/src/services/studentPracticeService.js:100`

## Mastery Promotion Gate

PASS

1. Gate 只读派生自 Student Knowledge State。
2. 通过条件为 mastery >= 0.75、evidence >= 2、存在 assessment evidence。
3. Gate 不自动写入用户数据。
4. 未达标节点保持 `not_ready`。

Evidence:

- `backend/src/services/learningReviewService.js:7`
- `backend/src/services/learningReviewService.js:19`
- `backend/src/services/learningReviewService.js:20`
- `backend/src/services/learningReviewService.js:21`
- `backend/src/services/learningReviewService.js:34`

## Review Queue

PASS

1. Review Queue 只读派生自 Student Knowledge State。
2. 不创建持久化队列。
3. `weak` 优先级高于 `learning`。
4. 同级按 mastery 升序与标题排序。
5. Queue 有 50 项上限。

Evidence:

- `backend/src/services/learningReviewService.js:44`
- `backend/src/services/learningReviewService.js:52`
- `backend/src/services/learningReviewService.js:66`

## Context Transparency

PASS

1. Learning Conversation response 返回 `queryUnderstanding` 与 `contextSelection`。
2. UI 显示 selection status、intent、learning mode。
3. UI 使用 `textContent` 渲染，不将不可信内容拼入 HTML。
4. Provider 与 internal error 不透出。

Evidence:

- `backend/src/services/agentLearningConversation/learningConversationRuntime.js:282`
- `js/agentHomeView.js:222`
- `js/agentHomeView.js:228`
- `tests/agentHomeUI.test.js:272`
- `tests/agentHomeUI.test.js:319`

## Learning Mode

PASS

Learning Mode hint 只作为解释方式提示，不改变权限，不触发 action：

- factual → `fact_review`
- conceptual → `concept_explanation`
- procedural → `procedure_walkthrough`
- comparison → `comparison`
- performance → `performance_review`
- course navigation → `course_navigation`
- reflection → `reflection`

## Failure / Fallback

PASS

覆盖并验证：

1. Provider 未配置 → deterministic fallback。
2. Provider timeout / unavailable → deterministic fallback。
3. Provider malformed JSON → deterministic fallback。
4. Output schema invalid → deterministic fallback。
5. Evidence mismatch → deterministic fallback。
6. Semantic violation → deterministic fallback。
7. High ambiguity / unsupported intent / empty selection → clarification，且不调用 Provider。

## E2E Scenarios

PASS

| Scenario | Verification |
| --- | --- |
| A. `解释 Promise` | Runtime focused test PASS；selection selected；fallback PASS |
| B. Explicit course / knowledge scope | Context Selection focused tests PASS |
| C. Comparison query | Query Understanding focused test PASS |
| D. Ambiguous pronoun | Runtime clarification test PASS |
| E. Unsupported planner request | Runtime rejected before Provider test PASS |
| Prompt injection | Context Selection DATA / authority test PASS |
| Cross-user isolation | Runtime and Selection tests PASS |
| Provider unavailable | Runtime fallback test PASS |
| Invalid LLM output | Gateway validator tests PASS |
| Practice → Mastery Gate → Review Queue | Learning loop focused test PASS |

## Regression Tests

```yaml
Backend:
  289/289 PASS

Frontend:
  611/611 PASS

Build:
  PASS

git diff --check:
  PASS
```

Additional focused verification:

```yaml
Learning Conversation Runtime: 4/4 PASS
Context Selection: 23/23 PASS
Gateway: 25/25 PASS
```

## Findings

### F-001 Context Selection was not the post-selection data boundary

- Severity: High
- Status: FIXED
- Evidence: Insight、Reasoning 与 Gateway 曾接收完整 Agent Home Context。
- Remediation: Runtime 新增 `projectSelectedContext()`；后续 Insight、Reasoning、Gateway 只消费投影。
- Regression: `backend/test/agentLearningConversation.test.js:73`
- Commit: `56a3280 fix: enforce selected context projection boundary`

### F-002 Practice attempt and evidence write are not a single transaction

- Severity: Low
- Status: OPEN, NON-BLOCKER
- Evidence: `backend/src/services/studentPracticeService.js:90` 先写 attempt，`backend/src/services/studentPracticeService.js:100` 再写 evidence。
- Risk: 中间失败可能留下 orphan practice attempt。
- Recommendation: 后续单独 Phase 评估 SQLite transaction 边界。

### F-003 Mastery Gate assessment condition is currently inferred from mastered state

- Severity: Low
- Status: OPEN, NON-BLOCKER
- Evidence: `backend/src/services/learningReviewService.js:21`
- Risk: 如果 state aggregation future semantics change，gate 表达可能不够显式。
- Recommendation: 后续新增 state evidence type projection 后再收紧，不在冻结阶段扩功能。

## Remediation

已提交：

```text
56a3280 fix: enforce selected context projection boundary
```

修改范围：

- `backend/src/services/agentLearningConversation/learningConversationRuntime.js`
- `backend/test/agentLearningConversation.test.js`

未修改 Context Selection Engine、Context Firewall、Gateway、Validator、Evidence Binding、Practice、Mastery、Review、Store、Analytics、Sync、Goals、Today Plan。

## Final Verdict

```yaml
Critical: 0
High: 0
Medium: 0
Low: 2
Info: 0

Architecture: PASS
Security: PASS
Data Isolation: PASS
Provider Boundary: PASS
Output Validation: PASS
Regression: PASS

Final:
READY_TO_FREEZE
```

## Future Work

以下内容不属于 MVP+，禁止在当前 Phase 直接实现：

1. Autonomous planner。
2. Action executor。
3. Memory writer。
4. Multi-agent orchestration。
5. FSRS / BKT。
6. Embedding / Vector DB。
7. Unlimited retrieval。
8. AI-generated learning schedule。
9. 自动修改 Todo / Goal / Knowledge State。
