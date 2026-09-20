# Phase 27.7.3 Query Understanding Contract Audit

Date: 2026-09-20

Role: Independent Architect / Security Reviewer

Reviewed Architecture:

```text
docs/PHASE_27_7_3_QUERY_UNDERSTANDING_CONTRACT.md
```

Architecture Commit:

```text
512c45c docs: architect phase 27.7.3 query understanding contract
```

Final Verdict: **READY_TO_FREEZE**

---

## 1. Audit Scope

本审计只检查 Phase 27.7.3 Architecture-only 文档，不实现 Query Understanding，不修改生产代码，不启动 Phase 27.7.4。

审计范围：

1. Contract completeness。
2. Closed schema。
3. Determinism。
4. Boundedness。
5. User input boundary。
6. Authority boundary。
7. Provenance。
8. Scope correctness。
9. Course isolation。
10. Cross-user isolation。
11. Prompt injection resistance。
12. Control / Data plane separation。
13. Context Selection compatibility。
14. Context Firewall compatibility。
15. Provider isolation。
16. Privacy。
17. Observability。
18. Failure behavior。
19. Backward compatibility。
20. Future extensibility。

---

## 2. Contract Completeness

| Required Area | Result | Evidence |
|---|---|---|
| Purpose / Scope / Non-goals | PASS | §1–§3 |
| Architecture overview | PASS | §4 |
| Responsibilities / Non-responsibilities | PASS | §5–§6 |
| Root contract | PASS | §7 |
| Query model | PASS | §8 |
| Intent taxonomy | PASS | §9 |
| Query type taxonomy | PASS | §10 |
| Scope model | PASS | §11 |
| Course references | PASS | §12 |
| Knowledge references | PASS | §13 |
| Requested explanation | PASS | §14 |
| User-provided context | PASS | §15 |
| Ambiguity | PASS | §16 |
| Clarification | PASS | §17 |
| Selection hints | PASS | §18 |
| Confidence | PASS | §19 |
| Time scope | PASS | §20 |
| Security boundary | PASS | §21 |
| Control / Data plane | PASS | §22 |
| Authority | PASS | §23 |
| Provenance | PASS | §24 |
| Determinism | PASS | §25 |
| Boundedness | PASS | §26 |
| Unsupported requests | PASS | §27 |
| Failure matrix | PASS | §28 |
| Observability | PASS | §29 |
| Privacy | PASS | §30 |
| Examples | PASS | §31 |
| Testing strategy | PASS | §32 |
| Invariants | PASS | §33 |
| Future extension | PASS | §34 |
| Freeze criteria | PASS | §35 |

Result: **PASS**

---

## 3. Closed Schema

| Check | Result |
|---|---|
| Root fields explicit | PASS |
| Nested subcontracts explicit | PASS |
| Unknown fields reject | PASS |
| No object spread | PASS |
| No JSON passthrough | PASS |
| No generic deep clone | PASS |
| No unknown-field propagation | PASS |
| Enums closed | PASS |
| Limits testable | PASS |

Result: **PASS**

---

## 4. Determinism

| Check | Result |
|---|---|
| Same query + same bounded metadata + same policy → same output | PASS |
| Parser policy version required | PASS |
| Deterministic fingerprint required | PASS |
| Random classification forbidden | PASS |
| Provider-dependent classification forbidden | PASS |
| LLM-dependent classification forbidden | PASS |
| Hidden external API forbidden | PASS |
| Trusted time metadata separated from user text | PASS |

Result: **PASS**

---

## 5. Boundedness

| Boundary | Verdict |
|---|---|
| query ≤1000 chars | PASS |
| normalized query ≤1000 chars | PASS |
| course refs ≤3 | PASS |
| knowledge refs ≤5 | PASS |
| user context ≤3 items / 400 chars each / 1200 total | PASS |
| clarification ≤1 round / 2 questions / 200 chars | PASS |
| selection source types ≤6 | PASS |
| user constraints ≤3 / 120 chars | PASS |
| conversation ≤3 turns / 1200 chars | PASS |
| time range ≤366 days | PASS |
| metadata ≤8 fields | PASS |
| serialized data plane ≤4096 bytes | PASS |

Result: **PASS**

---

## 6. User Input Boundary

| Check | Result |
|---|---|
| Raw query preserved | PASS |
| Raw query treated as untrusted DATA | PASS |
| Raw query not treated as system instruction | PASS |
| Raw query not treated as course knowledge | PASS |
| Raw query not treated as evidence | PASS |
| Raw query not treated as insight / reasoning | PASS |
| Normalized query separated from raw query | PASS |
| Normalization does not change semantic content | PASS |
| User context remains `user_provided` | PASS |
| User context not persisted | PASS |

Result: **PASS**

---

## 7. Authority Boundary

| Rule | Result |
|---|---|
| Query Understanding does not create truth | PASS |
| Query Understanding does not create Evidence | PASS |
| Query Understanding does not create Insight | PASS |
| Query Understanding does not create Reasoning | PASS |
| User input remains user input | PASS |
| Inferred scope remains inferred | PASS |
| Reference does not prove existence | PASS |
| Confidence is interpretation confidence | PASS |
| Confidence does not increase authority | PASS |
| Selection hint does not increase authority | PASS |

Result: **PASS**

---

## 8. Provenance

| Check | Result |
|---|---|
| `user_explicit` preserved | PASS |
| `system_context` preserved | PASS |
| `system_inferred` preserved | PASS |
| `derived` preserved | PASS |
| Inferred cannot be disguised as explicit | PASS |
| User context cannot be disguised as system fact | PASS |
| Reference provenance bounded | PASS |
| Parser output provenance explicit | PASS |

Result: **PASS**

---

## 9. Scope Correctness

| Check | Result |
|---|---|
| All required scope kinds represented | PASS |
| Explicit / contextual / inferred separated | PASS |
| Explicit scope precedence defined | PASS |
| Scope inference does not create facts | PASS |
| Mixed scope supported | PASS |
| Ambiguous scope supported | PASS |
| Invalid time range rejected | PASS |
| Reference time comes only from trusted server context | PASS |

Result: **PASS**

---

## 10. Course Isolation

| Check | Result |
|---|---|
| Course refs bounded | PASS |
| Explicit course ref separated from contextual course scope | PASS |
| Query Understanding does not verify course existence | PASS |
| Query Understanding does not verify course ownership | PASS |
| Existence and owner checks delegated to Context Selection | PASS |
| Ambiguous course triggers clarification | PASS |
| Contradictory explicit/contextual scope preserved | PASS |

Result: **PASS**

---

## 11. Cross-user Isolation

| Check | Result |
|---|---|
| `ownerUserId` only in Control Plane | PASS |
| `ownerUserId` absent from `query-understanding-v1` data payload | PASS |
| `userId` absent from Data Plane | PASS |
| Authorization state absent from Data Plane | PASS |
| Session metadata absent from Data Plane | PASS |
| Cross-user reference cannot enter downstream context | PASS |
| Context Selection must enforce owner access | PASS |
| Context Firewall remains final LLM boundary | PASS |

Result: **PASS**

---

## 12. Prompt Injection Resistance

| Injection Vector | Expected Boundary | Result |
|---|---|---|
| User query says “ignore rules” | remains DATA | PASS |
| Fake system instruction | not accepted as system rule | PASS |
| Role impersonation | not accepted as role change | PASS |
| Fake evidence claim | does not create Evidence | PASS |
| Delimiter injection | text remains DATA | PASS |
| JSON-like payload injection | unknown schema rejected or query remains DATA | PASS |
| Instruction injection in user context | cannot alter selection / authority | PASS |
| Instruction-like course text | not applicable in v1；later must remain DATA | PASS |

Result: **PASS**

---

## 13. Control / Data Plane Separation

| Check | Result |
|---|---|
| Control Plane explicitly defined | PASS |
| Data Plane explicitly defined | PASS |
| Root envelope separates both | PASS |
| `ownerUserId` prohibited in data contract | PASS |
| Server-only identifiers prohibited in data contract | PASS |
| Object spread prohibited | PASS |
| Generic serializer prohibited | PASS |
| Unknown-field propagation prohibited | PASS |

Result: **PASS**

---

## 14. Context Selection Compatibility

| Check | Result |
|---|---|
| `query-understanding-v1` remains upstream of Context Selection | PASS |
| Selection hints are non-decisive | PASS |
| Selection hints bounded | PASS |
| Context Selection remains responsible for retrieval | PASS |
| Context Selection remains responsible for existence / owner validation | PASS |
| Ambiguity can pause downstream selection | PASS |
| Unresolved references can be safely handled | PASS |
| No direct data access introduced | PASS |

Result: **PASS**

---

## 15. Context Firewall Compatibility

| Check | Result |
|---|---|
| Query Understanding output is not directly a Provider payload | PASS |
| Context Firewall remains final LLM input boundary | PASS |
| No bypass of `agent-llm-context-v1` | PASS |
| No change to 8192 bytes firewall budget | PASS |
| No new LLM context schema introduced | PASS |
| User query / context may enter LLM only through downstream allowlist projection | PASS |

Result: **PASS**

---

## 16. Provider Isolation

| Check | Result |
|---|---|
| Query Understanding does not call Provider | PASS |
| Query Understanding does not call LLM | PASS |
| Provider cannot influence classification | PASS |
| Provider cannot control clarification | PASS |
| Provider failure is outside Query Understanding responsibility | PASS |
| No Provider configuration exposed to Data Plane | PASS |

Result: **PASS**

---

## 17. Privacy

| Check | Result |
|---|---|
| Raw query not logged by default | PASS |
| Normalized query not logged by default | PASS |
| User context not logged by default | PASS |
| Conversation context not logged by default | PASS |
| No persistence introduced | PASS |
| No Memory write | PASS |
| No cross-user analysis | PASS |
| No secrets / tokens / auth data in telemetry | PASS |

Result: **PASS**

---

## 18. Observability

| Check | Result |
|---|---|
| Allowed telemetry fields bounded | PASS |
| Contract / policy versions included | PASS |
| Failure reason included | PASS |
| Counts and duration bucket included | PASS |
| Raw user content excluded | PASS |
| Internal objects excluded | PASS |
| Cross-user data excluded | PASS |

Result: **PASS**

---

## 19. Failure Behavior

| Failure Class | Result |
|---|---|
| empty query | PASS |
| oversized query | PASS |
| malformed input | PASS |
| unknown field | PASS |
| unsupported intent | PASS |
| ambiguous query | PASS |
| ambiguous course | PASS |
| ambiguous knowledge | PASS |
| invalid reference | PASS |
| contradictory scope | PASS |
| invalid time range | PASS |
| excessive references | PASS |
| prompt injection | PASS |
| control-plane field in data input | PASS |
| parser failure | PASS |
| action request | PASS |
| memory mutation request | PASS |
| provider failure | PASS |
| LLM call attempt | PASS |

Result: **PASS**

`reject`、`clarification`、`unsupported`、`safe unknown` 的边界没有混淆。

---

## 20. Backward Compatibility

| Check | Result |
|---|---|
| 不修改 CGStore | PASS |
| 不修改 Analytics | PASS |
| 不修改 Goals | PASS |
| 不修改 Sync | PASS |
| 不修改 Course schema | PASS |
| 不修改 Knowledge schema | PASS |
| 不修改 Student Knowledge State schema | PASS |
| 不修改 Context Firewall | PASS |
| 不修改 Runtime Gateway | PASS |
| 不修改 Provider | PASS |
| 不修改 Prompt Registry | PASS |
| 不修改 Output / Evidence / Semantic Validator | PASS |
| 不实现 Query Understanding Engine | PASS |
| 不修改生产代码 | PASS |

Result: **PASS**

Phase 27.7.1 中的初步 `query-understanding-v1` 没有生产实现；27.7.3 是更完整的 closed contract refinement，不改变既有生产行为。

---

## 21. Future Extensibility

| Future Area | Verdict |
|---|---|
| Semantic parsing | PASS，另建 version / Phase |
| Multilingual understanding | PASS，另建 version / Phase |
| LLM-assisted interpretation | PASS，另建 version / Phase |
| Richer intent taxonomy | PASS，另建 version / Phase |
| Planner | PASS，本阶段 unsupported |
| Action | PASS，本阶段 unsupported |
| Autonomous agent | PASS，本阶段 unsupported |
| Memory mutation | PASS，本阶段 unsupported |
| Tutor | PASS，本阶段 unsupported |

Result: **PASS**

---

## 22. Findings

### Info-001 — Implementation Mapping Still Required

Severity: Info

Evidence: Architecture §7、§18、§34。

Recommendation: 后续实现阶段必须将 bounded query understanding fields 映射到 Context Selection hints，且不得将中间 contract 直接作为 Provider payload。

Blocker: No.

### Info-002 — Parser Policy Implementation Deferred

Severity: Info

Evidence: Architecture §25。

Recommendation: 后续实现必须提供 `query-understanding-policy-v1`、稳定 fingerprint 与 contract tests；本阶段不实现。

Blocker: No.

---

## 23. Severity Summary

```text
Critical: 0
High: 0
Medium: 0
Low: 0
Info: 2
```

---

## 24. Verification

本阶段是 Architecture-only / documentation-only，不要求运行前后端业务测试。

Verification performed:

```text
git diff --check: PASS
git status: clean after freeze commit
Production code changes: none
```

---

## 25. Freeze Gate

| Gate | Result |
|---|---|
| Contract completeness | PASS |
| Closed schema | PASS |
| Determinism | PASS |
| Boundedness | PASS |
| User input boundary | PASS |
| Authority boundary | PASS |
| Provenance | PASS |
| Scope correctness | PASS |
| Course isolation | PASS |
| Cross-user isolation | PASS |
| Prompt injection resistance | PASS |
| Control / Data plane separation | PASS |
| Context Selection compatibility | PASS |
| Context Firewall compatibility | PASS |
| Provider isolation | PASS |
| Privacy | PASS |
| Observability | PASS |
| Failure behavior | PASS |
| Backward compatibility | PASS |
| Future extensibility | PASS |
| Critical / High / Medium | 0 |

---

## 26. Final Recommendation

Phase 27.7.3 Query Understanding Contract 可以冻结：

```text
READY_TO_FREEZE
```

冻结后不得实现 Query Understanding Engine、Context Selection Engine、LLM classifier、Chat UI 或进入 Phase 27.7.4。后续工作必须另建 Phase。
