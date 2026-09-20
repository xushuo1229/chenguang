# Phase 27.7.2 Context Selection Architecture Audit

Date: 2026-09-20

Role: Independent Architect / Security Reviewer

Reviewed Architecture:

```text
docs/PHASE_27_7_2_CONTEXT_SELECTION_ARCHITECTURE.md
```

Architecture Commit:

```text
4022473 docs: architect phase 27.7.2 context selection
```

Final Verdict: **READY_TO_FREEZE**

---

## 1. Audit Scope

本审计只检查 Phase 27.7.2 Architecture-only 文档，不实现 Context Selector，不修改生产代码，不启动 Phase 27.7.3。

审计范围：

1. Completeness。
2. Consistency with Phase 27.7。
3. Consistency with Phase 27.7.1。
4. Context Firewall compatibility。
5. Provider compatibility。
6. Identity boundary。
7. User isolation。
8. Authority preservation。
9. Provenance。
10. Evidence integrity。
11. Boundedness。
12. Determinism。
13. Privacy。
14. Prompt injection resistance。
15. Failure behavior。
16. Backward compatibility。
17. Future extensibility。

---

## 2. Completeness

| Required Area | Result | Evidence |
|---|---|---|
| Purpose / Scope / Non-goals | PASS | §1–§3 |
| Architecture overview | PASS | §4 |
| Responsibilities / Non-responsibilities | PASS | §5–§6 |
| Source Allowlist | PASS | §7 |
| Context Item Contract | PASS | §8 |
| Selection Result Contract | PASS | §9 |
| Query / Scope Interaction | PASS | §10 |
| Course / Cross-course policy | PASS | §11–§12 |
| Evidence / Insight / Reasoning / State / User Input / History | PASS | §13–§18 |
| Relevance / Authority / Provenance | PASS | §19–§21 |
| Budget / Determinism / Isolation | PASS | §22–§24 |
| Control Plane / Data Plane | PASS | §25 |
| Prompt injection boundary | PASS | §26 |
| Conflict / Empty / Insufficient Evidence | PASS | §27–§29 |
| Failure Matrix | PASS | §30 |
| Observability / Privacy / Security | PASS | §31–§33 |
| Future Semantic Retrieval | PASS | §34 |
| Testing Strategy | PASS | §35 |
| Invariants | PASS | §36 |
| Freeze Criteria | PASS | §37 |

Result: **PASS**

---

## 3. Consistency with Phase 27.7

Phase 27.7 冻结了：

```text
learning-context-v1
→ agent-insight-v1
→ agent-reasoning-v1
→ agent-llm-context-v1
→ Provider
→ Output Validator
→ Evidence Binding
→ Semantic Validator
```

Phase 27.7.2 的兼容性检查：

| Check | Result |
|---|---|
| 不重定义 Source of Truth hierarchy | PASS |
| 不重定义 Insight / Reasoning generation | PASS |
| 不绕过 Context Firewall | PASS |
| 不绕过 Validator chain | PASS |
| 不改变 8192 bytes firewall budget | PASS |
| 不改变 `actionLevel = insight_only` | PASS |
| 不改变 `permissions.write = []` | PASS |
| 不把 Provider 变成 Selector 依赖 | PASS |
| 不引入 autonomous / planner / action | PASS |

Result: **PASS**

---

## 4. Consistency with Phase 27.7.1

Phase 27.7.1 定义了初步的：

```text
context-selection-v1
```

Phase 27.7.2 将其细化为完整的：

```text
context-source-allowlist-v1
context-item-v1
context-selection-result-v1
```

兼容性检查：

| Check | Result |
|---|---|
| 继续保持 Learning Conversation 前置契约位置 | PASS |
| 继续消费 `query-understanding-v1` | PASS |
| 继续收敛到 `agent-llm-context-v1` | PASS |
| 继续禁止 `ownerUserId` 进入 LLM data plane | PASS |
| 将 Control Plane / Data Plane 拆分得更严格 | PASS |
| 继续保留 User Input authority = `user_provided` | PASS |
| 继续保留 bounded history policy | PASS |
| 继续禁止 Memory Writer | PASS |
| 继续禁止 LLM relevance judge | PASS |

Result: **PASS**

27.7.1 中初步 contract 将内部 selection record 描述为可包含 `ownerUserId`；27.7.2 明确要求 Selection Engine 返回外层 `controlPlane` 与 `dataPlane`，且 `dataPlane` 不携带身份。这是更严格的 additive refinement，不构成边界破坏。

---

## 5. Context Firewall Compatibility

| Check | Result |
|---|---|
| Selector 输出不直接成为 Provider payload | PASS |
| 最终 LLM context 仍为 `agent-llm-context-v1` | PASS |
| Selector serialized budget 6144 bytes ≤ Firewall 8192 bytes | PASS |
| Firewall 继续执行最终 allowlist projection | PASS |
| Provider 继续执行二次投影 | PASS |
| Selector 不临时扩大 Firewall budget | PASS |
| Selector 不通过 generic serializer 混合 object | PASS |

Result: **PASS**

---

## 6. Provider Compatibility

| Check | Result |
|---|---|
| Provider 不参与 selection | PASS |
| Provider 不参与 relevance | PASS |
| Provider 不决定 truncation | PASS |
| Provider 不访问 DB / CGStore / Analytics | PASS |
| Provider 不获得 token / secret / session internals | PASS |
| Provider failure 不属于 Selector responsibility | PASS |

Result: **PASS**

---

## 7. Identity Boundary

| Rule | Result |
|---|---|
| `ownerUserId` 只在 Control Plane | PASS |
| `context-selection-result-v1` data plane 不含 `ownerUserId` | PASS |
| `context-item-v1` 不含 `ownerUserId` / `userId` | PASS |
| provenance 只保留 `ownershipVerified` | PASS |
| authorization state 不进入 Data Plane | PASS |
| session metadata 不进入 Data Plane | PASS |
| provider configuration 不进入 Data Plane | PASS |

Result: **PASS**

---

## 8. User Isolation

| Source Type | Cross-user Behavior | Result |
|---|---|---|
| Course | fail closed | PASS |
| Knowledge Node | fail closed | PASS |
| Evidence | fail closed | PASS |
| Insight | fail closed | PASS |
| Reasoning | fail closed | PASS |
| Student Knowledge State | fail closed | PASS |
| Conversation History | fail closed | PASS |
| Context Item / Snapshot | fail closed | PASS |

Result: **PASS**

架构明确禁止 `filter and continue silently`，任何 cross-user candidate 都必须使 selection 进入：

```text
rejected / CROSS_USER_SOURCE
```

---

## 9. Authority Preservation

| Authority Rule | Result |
|---|---|
| Relevance score 不改变 authority | PASS |
| User Input 不能成为 Evidence | PASS |
| Student Knowledge State 不能成为 Course Fact | PASS |
| Insight 不能成为 System Fact | PASS |
| Reasoning 不能成为 Source Truth | PASS |
| LLM Explanation 不能成为 Evidence | PASS |
| Conflict 不使用 last-write-wins | PASS |
| Authority enum closed | PASS |

Result: **PASS**

---

## 10. Provenance

| Check | Result |
|---|---|
| 每个 item 保留 sourceType / sourceId | PASS |
| 每个 item 保留 adapter / recordId | PASS |
| 每个 item 保留 snapshotId | PASS |
| 每个 item 保留 ownershipVerified | PASS |
| Evidence 保留 source linkage | PASS |
| Result 保留 allowlist / policy / budget version | PASS |
| Result 保留 selection fingerprint | PASS |
| malformed provenance fail closed | PASS |

Result: **PASS**

---

## 11. Evidence Integrity

| Check | Result |
|---|---|
| Selector 不创建 Evidence | PASS |
| Selector 不改写 Evidence | PASS |
| Selector 不合并 Evidence | PASS |
| 只选择已有 Evidence | PASS |
| Evidence owner / scope 校验 | PASS |
| Evidence maximum = 12 | PASS |
| fact / interpretation / numeric / temporal claim 必须有 Evidence | PASS |
| insufficient evidence 显式暴露 | PASS |
| evidenceAvailable 不得伪造 | PASS |

Result: **PASS**

---

## 12. Boundedness

| Limit | Verdict |
|---|---|
| max source count = 8 | PASS |
| max items per source = 6 | PASS |
| max total items = 24 | PASS |
| max evidence = 12 | PASS |
| max reasoning = 6 | PASS |
| max insight = 6 | PASS |
| max course items = 12 | PASS |
| max state items = 5 | PASS |
| max history = 3 turns / 1200 chars | PASS |
| max query = 1000 chars | PASS |
| max selected content = 4800 chars | PASS |
| max serialized selection = 6144 bytes | PASS |
| max estimated tokens = 1536 | PASS |
| final firewall = 8192 bytes | PASS |

Result: **PASS**

---

## 13. Determinism

| Check | Result |
|---|---|
| 相同 input + snapshot + policy 输出相同 | PASS |
| selection fingerprint 稳定 | PASS |
| 无 random selection | PASS |
| 无 time-based ranking | PASS |
| 无 Provider-dependent ranking | PASS |
| 无 LLM-dependent selection | PASS |
| tie-break 规则确定 | PASS |

Result: **PASS**

---

## 14. Privacy

| Check | Result |
|---|---|
| data minimization | PASS |
| least context | PASS |
| bounded retention | PASS |
| provenance preserved | PASS |
| user isolation | PASS |
| no raw dumps | PASS |
| no unrelated data | PASS |
| User Input / History 默认 ephemeral | PASS |
| Operational metadata 与 Learning Content 分离 | PASS |

Result: **PASS**

---

## 15. Prompt Injection Resistance

| Injection Vector | Expected Boundary | Result |
|---|---|---|
| User Query | DATA，不改变 System Rules | PASS |
| Course Knowledge | DATA，不改变 allowlist / authority | PASS |
| Document text | 本阶段不进入；未来必须 DATA wrapper | PASS |
| Evidence text | DATA，输出仍需 Validator chain | PASS |
| Conversation History | DATA，bounded，不持久化 | PASS |
| LLM output | 不提升 authority，不执行 action | PASS |

Result: **PASS**

---

## 16. Failure Behavior

| Failure Class | Result |
|---|---|
| invalid query / scope | PASS |
| unauthorized / unknown source | PASS |
| cross-user source | PASS |
| unknown field / malformed provenance | PASS |
| budget exceeded | PASS |
| no relevant context | PASS |
| insufficient evidence | PASS |
| conflicting context | PASS |
| malformed source | PASS |
| provider failure | PASS |
| firewall failure | PASS |
| selection timeout | PASS |
| snapshot unavailable | PASS |

Result: **PASS**

Selector、Gateway、Provider、Validator 的责任边界没有混淆。

---

## 17. Backward Compatibility

| Check | Result |
|---|---|
| 不修改 CGStore | PASS |
| 不修改 Sync | PASS |
| 不修改 Analytics | PASS |
| 不修改 Goals | PASS |
| 不修改 Course schema | PASS |
| 不修改 Knowledge schema | PASS |
| 不修改 Student Knowledge State schema | PASS |
| 不修改 Context Firewall | PASS |
| 不修改 Runtime Gateway | PASS |
| 不修改 Provider | PASS |
| 不修改 Prompt Registry | PASS |
| 不修改 Output Validator | PASS |
| 不修改 Evidence Binding | PASS |
| 不修改 Semantic Validator | PASS |
| 不实现 Context Selector | PASS |
| 不修改生产代码 | PASS |

Result: **PASS**

---

## 18. Future Extensibility

| Future Area | Verdict |
|---|---|
| Embedding | PASS，另建 Phase |
| Vector Index | PASS，定义为 derived data |
| Semantic retrieval | PASS，另建 Phase |
| Hybrid retrieval | PASS，另建 Phase |
| LLM relevance judge | PASS，本阶段禁止 |
| Course / Document excerpt | PASS，另建 Phase |
| Memory Writer | PASS，禁止 |
| Planner | PASS，禁止 |
| Action Executor | PASS，禁止 |

Result: **PASS**

---

## 19. Findings

### Info-001 — Implementation Mapping Required

Severity: Info

Evidence: Architecture §4、§8、§9。

Recommendation: 后续实现阶段必须将 `context-item-v1` / `context-selection-result-v1` 映射到既有 `learning-context-v1`、`agent-insight-v1`、`agent-reasoning-v1`，再进入 `agent-llm-context-v1`。不得让中间 contract 直接成为 Provider payload。

Blocker: No.

### Info-002 — Preliminary 27.7.1 Selection Contract Refined

Severity: Info

Evidence: Phase 27.7.1 初步定义了 `context-selection-v1`；27.7.2 进一步定义 Control Plane / Data Plane separation。

Recommendation: 实现阶段应以 27.7.2 的更严格边界为准，并保留 27.7.1 的请求与理解契约。

Blocker: No.

### Info-003 — Conflict Detection Needs Deterministic Rules at Implementation Time

Severity: Info

Evidence: Architecture §27 定义冲突保留与 no-last-write-wins 原则。

Recommendation: 实现阶段必须为同实体不同数值、同概念不同课程定义、时间周期差异定义 deterministic conflict rules；不得使用 LLM 判断冲突。

Blocker: No.

---

## 20. Severity Summary

```text
Critical: 0
High: 0
Medium: 0
Low: 0
Info: 3
```

---

## 21. Verification

本阶段是 Architecture-only / documentation-only，不要求运行前后端业务测试。

Verification performed:

```text
git diff --check: PASS
git status: clean after commit
Production code changes: none
```

---

## 22. Freeze Gate

| Gate | Result |
|---|---|
| Completeness | PASS |
| Consistency with 27.7 | PASS |
| Consistency with 27.7.1 | PASS |
| Context Firewall compatibility | PASS |
| Provider compatibility | PASS |
| Identity boundary | PASS |
| User isolation | PASS |
| Authority preservation | PASS |
| Provenance | PASS |
| Evidence integrity | PASS |
| Boundedness | PASS |
| Determinism | PASS |
| Privacy | PASS |
| Prompt injection resistance | PASS |
| Failure behavior | PASS |
| Backward compatibility | PASS |
| Future extensibility | PASS |
| Critical / High / Medium | 0 |

---

## 23. Final Recommendation

Phase 27.7.2 Context Selection Engine Architecture 可以冻结：

```text
READY_TO_FREEZE
```

冻结后不得实现 Context Selector、Vector Index、Embedding、RAG、Chat UI、Memory Writer、Planner、Action Executor 或 Multi-agent。后续工作必须另建 Phase。
