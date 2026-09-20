# Phase 27.7.1 Learning Conversation Architecture Audit

Date: 2026-09-20

Role: Independent Architect / Security Reviewer

Reviewed Architecture:

```text
docs/PHASE_27_7_1_LEARNING_CONVERSATION_ARCHITECTURE.md
```

Architecture Commit:

```text
4e0c8c1 docs: architect phase 27.7.1 learning conversation
```

Final Verdict: **READY_TO_FREEZE**

---

## 1. Audit Scope

本审计只检查 Phase 27.7.1 Architecture-only 文档，不实现功能，不修改生产代码，不启动 Phase 27.7.2。

审计范围：

1. Architecture completeness。
2. Contract consistency。
3. Context boundary。
4. Identity boundary。
5. User isolation。
6. Evidence integrity。
7. LLM authority boundary。
8. Provider isolation。
9. Prompt injection boundary。
10. Failure behavior。
11. Boundedness。
12. Privacy。
13. Backward compatibility。
14. Future extensibility。

---

## 2. Architecture Completeness

| Check | Result | Evidence |
|---|---|---|
| 目标链路定义完整 | PASS | §1 / §3 |
| Request contract 完整 | PASS | §4 |
| Query Understanding contract 完整 | PASS | §5 |
| Context Selection contract 完整 | PASS | §6 |
| Context Firewall boundary 明确 | PASS | §7 |
| Reasoning boundary 明确 | PASS | §8 |
| Provider boundary 明确 | PASS | §9 |
| LLM explanation boundary 明确 | PASS | §10 |
| Validation chain 明确 | PASS | §11 |
| Evidence binding 明确 | PASS | §12 |
| User input authority 明确 | PASS | §13 |
| Course / document DATA boundary 明确 | PASS | §14 |
| User isolation 明确 | PASS | §15 |
| Bounded context policy 明确 | PASS | §16 |
| Failure matrix 完整 | PASS | §17 |
| Security / privacy / observability 明确 | PASS | §18–§20 |
| Testing strategy 完整 | PASS | §21 |
| Future extension boundary 明确 | PASS | §22 |
| Invariants 完整 | PASS | §23 |
| Freeze criteria 明确 | PASS | §24 |

Result: **PASS**

---

## 3. Contract Consistency

| Contract | Verdict | Notes |
|---|---|---|
| `learning-conversation-request-v1` | PASS | 内部 request 保留 control-plane 身份，data-plane 只包含有界用户问题、scope、conversation metadata |
| `query-understanding-v1` | PASS | deterministic / bounded；无 LLM understanding；无法识别时明确 ambiguous |
| `context-selection-v1` | PASS | allowlist-first、deterministic、bounded、source-aware |
| `agent-llm-context-v1` | PASS | 不新增第二套 LLM context，继续复用冻结 Context Firewall |
| Provider payload | PASS | 继续复用 identity-free allowlist |
| `validated-learning-answer-v1` | PASS | raw LLM output 必须通过 Validator 链后才可用户可见 |

Result: **PASS**

未发现合同之间互相矛盾的定义。

---

## 4. Context Boundary

| Boundary Check | Result |
|---|---|
| 不创建第二套 LLM Context | PASS |
| 不创建第二套 Validator Chain | PASS |
| 不创建第二套 Provider | PASS |
| 不创建第二套 Prompt Registry | PASS |
| Request / Understanding / Selection 不得整体 spread | PASS |
| 未知字段 fail closed | PASS |
| 最终 context 保持 8192 bytes | PASS |
| `permissions.write` 为空 | PASS |
| `actionLevel = insight_only` | PASS |
| Agent Home adapters 是唯一来源边界 | PASS |

Result: **PASS**

---

## 5. Identity Boundary

| Rule | Result |
|---|---|
| `ownerUserId` 可存在于 internal request / Gateway control plane | PASS |
| `ownerUserId` 不得进入 `agent-llm-context-v1` | PASS |
| `ownerUserId` 不得进入 Provider payload | PASS |
| `ownerUserId` 不得进入 Prompt | PASS |
| `ownerUserId` 不得进入 LLM output | PASS |
| `ownerUserId` 不得进入 user-visible answer | PASS |
| Context Selection 内部记录不得进入 LLM Data Plane | PASS |
| Evidence Binding ownership validation 保留在控制面 | PASS |
| 未认证请求 fail closed | PASS |
| cross-user reference fail closed | PASS |

Result: **PASS**

---

## 6. User Isolation

| Check | Result |
|---|---|
| Agent Home adapters 按 authenticated owner 查询 | PASS |
| 客户端传入其他 userId 不被信任 | PASS |
| history 不跨 owner 读取 | PASS |
| LLM output 中出现 cross-user identity 时 fail closed | PASS |
| unrelated users 不可选择 | PASS |
| secrets / session internals 不可选择 | PASS |

Result: **PASS**

---

## 7. Evidence Integrity

| Check | Result |
|---|---|
| Evidence 只能来自确定性数据 / approved projection | PASS |
| LLM 不能创建 Evidence | PASS |
| LLM 不能创建 Insight | PASS |
| LLM 不能创建 Reasoning | PASS |
| LLM 只能引用 snapshot 内 Evidence | PASS |
| fake / missing evidence fail closed | PASS |
| cross-user evidence fail closed | PASS |
| fact / interpretation 必须绑定引用 | PASS |
| suggestion 不得伪造证据 | PASS |
| 新 evidence id / metric / source 不可进入输出 | PASS |

Result: **PASS**

---

## 8. LLM Authority Boundary

| Authority Check | Result |
|---|---|
| LLM 只解释 / 总结 / 澄清 / 连接既有证据 | PASS |
| LLM 不创建事实 | PASS |
| LLM 不修改 Knowledge State | PASS |
| LLM 不写 Memory | PASS |
| LLM 不修改 Course | PASS |
| LLM 不执行 Action | PASS |
| LLM 不提升 authority | PASS |
| LLM 不调用 tool | PASS |
| LLM 不访问其他用户 | PASS |
| raw LLM output 不能直接进入 frontend | PASS |

Result: **PASS**

---

## 9. Provider Isolation

| Check | Result |
|---|---|
| Provider 不访问 DB | PASS |
| Provider 不访问 CGStore | PASS |
| Provider 不访问 Analytics | PASS |
| Provider 不访问 Sync | PASS |
| Provider 不访问 Course Store | PASS |
| Provider 不访问 Knowledge State Store | PASS |
| Provider 不访问 Memory Store | PASS |
| Provider 不获得 token / secret | PASS |
| Provider adapter 不得绕过 Context Firewall | PASS |
| Provider failure 收敛到既有失败词汇 | PASS |

Result: **PASS**

---

## 10. Prompt Injection Boundary

| Injection Vector | Boundary | Result |
|---|---|---|
| 用户 query 中的 “ignore previous rules” | query 是 DATA，只能进入 bounded data plane | PASS |
| course / document text 注入 | 当前阶段不进入 Prompt；未来 excerpt 必须使用 DATA wrapper | PASS |
| evidence text 注入 | 输出必须通过 Evidence Binding / Semantic Validation | PASS |
| LLM 输出试图改写规则 | Output Contract / Evidence Binding / Semantic Validator fail closed | PASS |
| LLM 输出伪造身份 | ownership validation fail closed | PASS |
| LLM 输出执行 action | action boundary 禁止；无 tool contract | PASS |

Result: **PASS**

---

## 11. Failure Behavior

| Failure Class | Expected Behavior | Result |
|---|---|---|
| invalid request | fail closed | PASS |
| unauthorized | fail closed | PASS |
| ambiguous query | fail closed before LLM | PASS |
| no relevant context | fail closed before LLM | PASS |
| insufficient evidence | deterministic no-answer | PASS |
| context overflow | bounded truncation / fallback | PASS |
| provider unavailable / timeout / rate limit | deterministic fallback | PASS |
| malformed output | fail closed | PASS |
| unsupported claim | fail closed | PASS |
| invalid evidence reference | fail closed | PASS |
| cross-user reference | fail closed | PASS |
| semantic mismatch | fail closed | PASS |
| numerical mismatch | fail closed | PASS |
| temporal mismatch | fail closed | PASS |
| prompt injection | data stays DATA；output validation remains | PASS |
| generic validation failure | deterministic fallback | PASS |

Result: **PASS**

无答案状态完整覆盖：

```text
INSUFFICIENT_EVIDENCE
UNSUPPORTED
OUTSIDE_SCOPE
AMBIGUOUS_QUERY
NO_RELEVANT_CONTEXT
UNAVAILABLE
```

---

## 12. Boundedness

| Boundary | Verdict |
|---|---|
| query ≤1000 chars | PASS |
| history turn ≤400 chars | PASS |
| history total ≤1200 chars | PASS |
| previous turns ≤3 | PASS |
| selected insights ≤6 | PASS |
| selected reasoning ≤6 | PASS |
| selected course knowledge nodes ≤5 | PASS |
| selected knowledge states ≤5 | PASS |
| selected evidence references ≤12 | PASS |
| final LLM context ≤8192 bytes | PASS |
| output bound inherited from Output Contract | PASS |
| no unbounded serialization | PASS |

Result: **PASS**

---

## 13. Privacy

| Check | Result |
|---|---|
| 不记录 raw query | PASS |
| 不记录 raw prompt | PASS |
| 不记录 raw LLM reply | PASS |
| 不记录 token / secret / authorization header | PASS |
| 不记录 internal stack trace | PASS |
| v1 不持久化 conversation | PASS |
| 不写 GrowthMemory / CoachMemory | PASS |
| 未来持久化 conversation 必须另建 retention / privacy phase | PASS |

Result: **PASS**

---

## 14. Backward Compatibility

| Check | Result |
|---|---|
| 不修改 CGStore | PASS |
| 不修改 Analytics | PASS |
| 不修改 Goals | PASS |
| 不修改 Sync | PASS |
| 不修改 Course schema | PASS |
| 不修改 Knowledge State schema | PASS |
| 不替换 Context Firewall | PASS |
| 不替换 Provider | PASS |
| 不替换 Prompt Registry | PASS |
| 不替换 Validator chain | PASS |
| 不破坏既有 Agent Home GET 链路 | PASS |
| 不破坏既有 explain task | PASS |
| 不修改生产代码 | PASS |

Result: **PASS**

---

## 15. Future Extensibility

| Future Area | Verdict |
|---|---|
| Context Selection implementation | PASS |
| Query Understanding implementation | PASS |
| Course / Document evidence | PASS，另建 Phase |
| Conversation persistence | PASS，另建 Phase |
| Tutor mode | PASS，另建 Phase |
| Adaptive Planning | PASS，另建 Phase |
| Memory Writer | PASS，另建 Phase |
| Tool Calling | PASS，另建 Phase |
| Multi-agent | PASS，本阶段禁止 |

Result: **PASS**

架构没有把 Tutor、Planner、Memory Writer 或 Action Executor 提前塞进 Learning Conversation。

---

## 16. Findings

### Info-001 — Implementation Contract Work Remains

Severity: Info

Evidence: architecture §7.4、§21、§22。

Recommendation: 后续实现阶段需要 additive 新增 `answer_learning_question` task、Prompt 版本、contract tests 与 routing，但本架构阶段不执行。

Blocker: No.

### Info-002 — Conversation Persistence Deferred

Severity: Info

Evidence: architecture §4.6、§16.3、§19。

Recommendation: 当前保持 ephemeral / 默认单轮。若未来持久化，必须另建 retention、privacy、deletion、owner isolation Phase。

Blocker: No.

### Info-003 — Provider Token Usage Observability Gap Remains Historical

Severity: Info

Evidence: 该 gap 已在 Phase 27.7 架构中记录，不属于 27.7.1 blocker。

Recommendation: 后续若需要成本观测，可在 additive envelope change 中引入 token usage，不得改变 Provider payload 数据边界。

Blocker: No.

---

## 17. Severity Summary

```text
Critical: 0
High: 0
Medium: 0
Low: 0
Info: 3
```

---

## 18. Verification

本阶段是 Architecture-only / documentation-only，不要求运行前后端业务测试。

Verification performed:

```text
git diff --check: PASS
git status: clean after commit
Production code changes: none
```

---

## 19. Freeze Gate

| Gate | Result |
|---|---|
| Architecture completeness | PASS |
| Contract consistency | PASS |
| Context boundary | PASS |
| Identity boundary | PASS |
| User isolation | PASS |
| Evidence integrity | PASS |
| LLM authority boundary | PASS |
| Provider isolation | PASS |
| Prompt injection boundary | PASS |
| Failure behavior | PASS |
| Boundedness | PASS |
| Privacy | PASS |
| Backward compatibility | PASS |
| Future extensibility | PASS |
| Critical / High / Medium | 0 |

---

## 20. Final Recommendation

Phase 27.7.1 Learning Conversation Architecture 可以进入冻结：

```text
READY_TO_FREEZE
```

冻结后不得继续实现 Chat UI、Streaming、Planner、Memory Writer、Tool Calling、Tutor 或 Multi-agent。后续工作必须另建 Phase。
