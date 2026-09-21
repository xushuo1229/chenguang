# Phase 27.7.4 GitHub Import Decision

Status: **ARCHITECTURE REVIEW ONLY — NO PRODUCTION CHANGE**

## 1. Baseline

当前仓库已经包含 Phase 27.7.4 Context Selection Engine 实现和冻结审计：

```text
4e4e4f6 feat: implement phase 27.7.4 context selection engine
cb5210a docs: freeze phase 27.7.4 context selection engine
```

因此，本文件是在 Phase 27.7.4 冻结后的外部架构 Benchmark 决策记录。

本文件只新增文档，不修改 27.7.4 实现，不修改生产代码，不重新开放冻结边界。

## 2. Decision Summary

Phase 27.7.4 不吸收任何外部 runtime。

外部项目只作为 architecture pattern reference。可兼容的 pattern 必须由未来独立 Phase 实现；不兼容的 pattern 直接拒绝。

最终决策：

```text
External patterns considered
        ↓
Compatible patterns selected
        ↓
Patterns intentionally not imported
        ↓
Final implementation constraints
```

## 3. 27.7.4 Current Boundary

当前 Context Selection Engine 必须保持：

```text
Learning Conversation Request
 ↓
Query Understanding
 ↓
Context Selection Engine
 ↓
Selected Context
 ↓
Context Firewall
 ↓
Deterministic Reasoning
 ↓
Provider
 ↓
Validators
 ↓
User
```

当前 source allowlist 仍然只允许 8 类：

```text
deterministic_fact
approved_insight
approved_reasoning
course_knowledge
student_knowledge_state
evidence
permitted_user_input
bounded_conversation_history
```

GrowthMemory、Reflection、CoachMemory 在 27.7.4 v1 不可选择。

任何未来扩展都必须先修改架构合同，不得在 implementation patch 中静默加入。

## 4. External Patterns Considered

| Source Project | Pattern | Compatibility | Decision |
|---|---|---|---|
| Inno Agent | 三层 learner context | Partially compatible | Adopt concept after current phase |
| Inno Agent | Evidence-linked learner state | Compatible | Adopt as future contract |
| Inno Agent | Context pack | Already represented by Context Selection | No change |
| Inno Agent | Agent tool writes to memory | Incompatible | Reject |
| Inno Agent | Proactive scheduler | Future-only | Requires separate architecture |
| DeepTutor | Shared context across learning modes | Compatible | Adopt concept in future mode registry |
| DeepTutor | Capability registry | Compatible | Future Architecture |
| DeepTutor | Memory graph / claim trace | Compatible | Already stricter in Chenguang Evidence Binding |
| DeepTutor | Unified agent loop | Incompatible | Reject |
| DeepTutor | MCP / partner / external CLI integration | Incompatible | Reject |
| OpenTutor | Course material as long-term grounding | Compatible | Course Space already covers foundation |
| OpenTutor | Intent-aware source priority | Compatible | Future Context Selection extension |
| OpenTutor | Context budgets | Compatible | Already implemented |
| OpenTutor | BKT / FSRS | Compatible only with existing evidence/state | Future Architecture |
| OpenTutor | Local owner auto-binding | Incompatible | Reject |
| LLMTutor | Structured tutor config | Partially compatible | Future Prompt Contract reference |
| LLMTutor | Structured learner feedback | Partially compatible | Future Feedback Loop reference |
| LLMTutor | Pseudonym-only identity | Incompatible for SaaS | Reject |
| Learn Anything | Mastery evidence / promotion gate | Compatible | Future Practice / Mastery contract |
| Learn Anything | Review queue / delayed review | Compatible | Future Review contract |
| Learn Anything | Assessment freeze / ungradable state | Compatible | Future Practice contract |
| Learn Anything | Agent file writes | Incompatible | Reject |
| TuTor | Read-only verification gate | Compatible | Future Practice / tool gate principle |
| TuTor | Learner executes, AI verifies | Compatible | Future Practice product principle |
| TuTor | Prose-only tool gate | Not sufficient | Reject as sole enforcement |

## 5. Selective Import Candidates

### 5.1 A — Adopt Now

当前没有生产代码变更。

以下只能作为已经存在的 27.7.4 架构原则确认，不需要改动实现：

1. **Bounded shared learner context**
   - Context Selection 已经是共享入口。
   - 不允许 mode 自建 prompt 数据链。

2. **Source allowlist / deny-by-default**
   - 任何新学习模式不得直接把新 source 注入 Context。

3. **Owner fail-closed isolation**
   - 任何 source 的 owner mismatch 必须使整个 selection rejected。

4. **Budgeted selection**
   - source、item、chars、bytes、estimated tokens 必须保持硬上限。

5. **Evidence integrity**
   - fact-like context 必须有 selected evidence。
   - 无 evidence 不进入可用 context。

### 5.2 B — Adopt After Current Phase

这些 pattern 可进入最近的下一小步，但必须另建 Phase：

1. **Context Usage Transparency Contract**
   - 只暴露 bounded metadata。
   - 不暴露 raw context、owner、internal query、Provider payload。

2. **Learning Mode → Source Priority Mapping**
   - `review`、`practice`、`quiz`、`diagnose` 等模式只能调整 deterministic hints。
   - 不得改变 authority。

3. **Course Knowledge Grounding Note**
   - Course Knowledge 是 Learning Conversation / Practice / Review 的共同 grounding layer。
   - KnowledgeNode 不等于 generated explanation。

### 5.3 C — Future Architecture

这些属于学习闭环，不属于 27.7.4 Context Selection：

1. **Practice Mode Contract**
   - Learner action 与 AI explanation 分离。
   - Assessment 必须先冻结。
   - 无法判分时必须标记 `ungradable`，撤销旧分数。

2. **Mastery Promotion Contract**
   - 状态从 unknown → exposed → guided → independent → transferable → durable。
   - promotion 必须有 promotion evidence。
   - LLM 不能直接晋升。

3. **Review Queue Contract**
   - 只引用 Student Knowledge State / Evidence。
   - 不创建第二套 mastery 数据。
   - delayed review 可以后续接入。

4. **BKT / FSRS Learning Science Layer**
   - 只消费 practice / review evidence。
   - 只输出 Student Knowledge State projection。

### 5.4 D — Research Only

以下只作为参考，不建议近期实现：

1. Case-based tutor configuration。
2. Persona / tone layer。
3. Institutional pseudonym analytics。
4. Memory consolidation / decay。
5. Learning Planner。

### 5.5 E — Reject / Incompatible

以下不得导入：

1. Autonomous agent loop。
2. Agent direct memory write。
3. Agent direct Course Knowledge write。
4. LLM-as-Truth。
5. Retrieval-as-Truth。
6. Unbounded RAG。
7. MCP / unrestricted tool execution。
8. Provider-specific orchestration。
9. Local owner auto-binding。
10. Prose-only enforcement without system-level boundary。

## 6. Minimal Integration Plan

### 6.1 Current Phase

No change.

```text
Production code: no change
27.7.4 implementation: frozen
Context Selection contract: unchanged
Context Firewall: unchanged
Evidence Binding: unchanged
Output Validator: unchanged
Provider Gateway: unchanged
```

### 6.2 Next Candidate: Context Transparency

Goal:

```text
让用户理解 AI 用了哪类 context，而不是暴露内部数据。
```

Minimal change:

1. 新增 bounded context usage metadata contract。
2. 只允许 source type、selected count、evidence availability、policy version。
3. 不允许 raw context、owner、query、Provider payload。
4. UI 只显示可解释状态。

Expected files:

```text
backend/src/services/agentContextSelection/*
backend/test/agentContextSelection*.test.js
docs/PHASE_27_7_5_*.md
```

Forbidden:

1. 不修改 source data。
2. 不暴露 ownerUserId。
3. 不把 metadata 当作事实。

### 6.3 Next Candidate: Learning Mode Hints

Goal:

```text
多个学习模式共享 Context Selection，而不是各自拼 prompt。
```

Minimal change:

1. Query Understanding 增加 closed mode / intent contract。
2. Context Selection 只消费 bounded hints。
3. Hints 只影响 deterministic source priority。
4. Authority 不变。

Forbidden:

1. 不引入 autonomous mode router。
2. 不允许 mode 直接选择数据。
3. 不允许 mode 提升权限。

### 6.4 Later Candidate: Practice / Mastery / Review

Goal:

```text
从“AI 回答过”升级为“学习发生并有证据”。
```

Minimal chain:

```text
Course Knowledge
 ↓
Practice Task
 ↓
Learner Action
 ↓
Evidence
 ↓
Mastery State
 ↓
Review Queue
 ↓
New Evidence
```

Constraints:

1. Practice evidence 和 Course Knowledge 分开。
2. Student Knowledge State 是唯一 learner state projection。
3. Review Queue 不创建新 store。
4. AI 只能 propose，不能直接写。
5. Promotion gate 必须确定性执行。

## 7. Final Implementation Constraints

以下约束适用于 27.7.4 之后所有外部 pattern 吸收工作：

1. CGStore / Analytics 是业务事实 Source of Truth。
2. Analytics 是统计事实唯一来源。
3. GrowthMemory / CoachMemory / Reflection 不作为 27.7.4 v1 selectable source。
4. Course Knowledge 是 grounding layer，不是 LLM answer。
5. Evidence 是可回查依据，不是生成内容。
6. Retrieval 不是 Truth。
7. Context Selection 是唯一进入 Context Firewall 前的选择层。
8. Context Firewall 是 Provider payload 前的最后边界。
9. Evidence Binding 是 LLM output 引用的唯一校验来源。
10. Output Validator 是 LLM output 进入用户的最后校验层。
11. Agent 默认 READ ONLY。
12. 任何写操作必须 proposal → confirmation → authorized write。
13. Planner / Action / Memory mutation 必须独立 Phase。
14. 不引入 LangChain、LangGraph、Vector DB 或第三方 Agent framework，除非另有架构决策。

## 8. Review Result

```yaml
Critical conflicts: 0
High conflicts: 0
Medium conflicts: 0
Production changes: none
27.7.4 changes: none
Push: no
```

## Final Verdict

READY_TO_FREEZE
