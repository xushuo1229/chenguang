# Architecture Review Required

---

# [2026-09-19] Phase 27.7 Personal Learning Agent MVP Architecture — ARCHITECTURE REVIEW REQUIRED

Status: ARCHITECTURE REVIEW RESOLVED（H-1 已整改并通过独立复审）

Phase: 27.7 Personal Learning Agent MVP Architecture（Architecture-only）

Blocking Finding: **H-1（High，架构级）—— ownerUserId 实际进入 Provider payload**

## 1. Review Trigger

Phase 27.7 总架构文档（docs/PHASE_27_7_MVP_ARCHITECTURE.md）第一轮独立审计结论为
ARCHITECTURE_REVIEW_REQUIRED。审计同时核实：架构设计本体（Source of Truth 九级层级、
权限矩阵、Context/LLM/Provider 边界、失败矩阵与 fail-closed 三分法、13 条不变量、
未来延伸）自洽且与前置冻结档无冲突；阻断项是**现有代码与冻结契约的冲突**被本阶段
架构审查暴露，属 Phase 27.7 §17 原则所述"现有代码与目标架构冲突——先记录 Gap，
不擅自修改"情形。完整审计：docs/PHASE_27_7_MVP_ARCHITECTURE_AUDIT.md。

## 2. Evidence（H-1 完整证据链，已由实现者独立复核）

1. `backend/src/services/agentFirewall/contextFirewall.js:160` —— buildLlmContext 产物
   含 `ownerUserId: context.userId`；
2. `backend/src/services/agentGateway/runtimeGateway.js:134` —— 网关把**完整
   firewallContext** 传给 `provider.generateExplanation({ context, task })`；
   `toProviderPayload` 全仓仅定义（contextFirewall.js:177）、导出（:200）、注释
   （providerContract.js:67）三处引用，**运行链路零调用**；
3. `backend/src/services/agentProvider/openaiCompatibleProvider.js:79,102` ——
   validateProviderInput 只校验并 return true；`buildProviderMessages(context)` 直接
   使用完整 context；
4. `backend/src/services/agentPrompt/promptTemplates.js:44` —— user 消息 =
   `JSON.stringify(payload)` = 含 ownerUserId/constraints/metadata 的完整内部上下文，
   随每次调用发送给外部 LLM Provider；
5. 与冻结契约直接冲突：PHASE_27_6_1_CONTEXT_FIREWALL_CONTRACT.md §4.1 明文
   「ownerUserId 只存在于内部 Firewall Context……不会进入 Provider Payload」、§4.2；
   27.6.1→27.6.5 各轮审计与 golden 锁定未覆盖此接线缺口（测试只锁了 toProviderPayload
   函数输出本身，未锁链路）。

影响：每次 LLM 调用把内部用户标识与内部元数据结构发送给第三方 Provider——违背冻结
27.6.1 契约与本阶段架构文档自身的 Context Boundary / Provider 隔离声明。当前链路尚无
路由消费方（27.6.4 基础设施先行），故该路径尚未在生产请求中触达；但 27.7.1 装配前
必须解决。

## 3. Required Architecture Decision（须人工决策，二选一）

- **方案 (a)（文档侧，不动冻结代码）**：修订 27.7 档 §6/§13/§4.1 如实描述现状，
  把「toProviderPayload 未接线」登记为 Gap（27.7.1 前置整改项）；接线工作以独立
  additive Phase 承接。
- **方案 (b)（代码侧，契约级变更）**：在 Provider/网关链路接线 toProviderPayload——
  触及 27.6.3/27.6.5 冻结面与 golden 字节锁（payload 变化 → user 消息字节变化），
  须走契约级变更 + 独立 Re-Audit，并补「链路级无 ownerUserId 泄漏」回归测试。

推荐方向：**方案 (b)**（真正修复契约违背；实现量小——Provider 侧单点接线 + 测试 +
Re-Audit），理由：ownerUserId 越界是防火墙契约的核心违背，不应以文档降级方式固化；
且当前无路由消费方，恰是零生产影响的修复窗口。决策权在人。

## 4. 同批记录的非阻断修正项（决策后随修订一并完成）

- M-1：§9/§15 验收表码表修正——快照错配/超大输出实际收敛 llm_evidence_mismatch /
  llm_schema_invalid（runtimeGateway.js:161-173）；llm_context_mismatch /
  llm_output_too_large 运行链路不可达。
- M-2：§7 规则名改为 HEAD 实际六类 insight type（focus_increase/focus_decline/
  consistency_stable/consistency_drop/knowledge_gap_detected/course_progress_status，
  agentInsights/rules/*）；删除「动作仅 review/navigate」（insights 无 action 字段，
  实际更严格）。
- L-1：§12 GrowthMemory"LLM 有界可见"改为实际不投影（contextFirewall.js:58-68）。
- L-2/L-3/L-4/L-5：docs 文件数措辞、阶段 29 命名取舍注记、contextBytes/reasoningVersion
  采集责任、providerContract.js:67-68 注释一致性。

## 5. Constraints

- 不修改 CGStore / Analytics / Goals / Sync / Course System / Student Knowledge State /
  GrowthMemory / CoachMemory / Reflection。
- 不绕过 Context Firewall / Output Validator。
- 不实现 Chat / Planner / Action / Memory Writer。
- 方案 (b) 实施时必须走独立 Phase + 契约级 Re-Audit + golden 测试同步更新。

## 6. Gate Impact

Phase 27.7 MVP Architecture：

```text
NOT_READY_TO_FREEZE
```

Freeze commit 暂停；27.7.1 不得启动，直至本 review 的方案决策落地并完成相应修订/复审。

---

# [2026-09-18] Phase 27.1 Agent Context Builder — 历史记录（已经 PHASE_27_1_CONTEXT_BOUNDARY_REMEDIATION 解决）

Date: 2026-09-18

Phase: 27.1 Agent Context Builder

Status: ARCHITECTURE REVIEW REQUIRED

## 1. Review Trigger

Phase 27.1 implementation is functionally read-only, bounded and user-isolated. Backend, frontend, build and browser smoke checks passed. However, the independent audit found that the LearningContext memory boundary does not fully match the frozen Agent Home architecture.

This document is a review request. It is not approval to start Phase 27.2, modify production code, migrate data or perform a repair in this audit gate.

## 2. Evidence

### 2.1 Reflection Summary Boundary

The frozen architecture defines Reflection as user-owned feedback and Reflection Summary as recent reflection topics and feedback:

```text
docs/PERSONAL_LEARNING_AGENT_HOME_ARCHITECTURE_V1_0.md:52
docs/PERSONAL_LEARNING_AGENT_HOME_ARCHITECTURE_V1_0.md:192
docs/PERSONAL_LEARNING_AGENT_HOME_ARCHITECTURE_V1_0.md:255
```

The current implementation builds `reflections.todaySummary` from `reflectionContextSource` behavior helpers:

```text
backend/src/services/agentHomeService.js:131-140
backend/src/services/agentHomeService.js:183-190
```

Therefore the field is a deterministic behavior snapshot, not Reflection history or user-owned Reflection Summary.

### 2.2 Data Duplication

The same task, focus and streak summaries are placed under both `learningHistory` and `reflections.todaySummary`:

```text
backend/src/services/agentHomeService.js:175-190
```

This creates two consumers of the same derived projection without a single named ownership boundary.

### 2.3 GrowthMemory Source

GrowthMemory is currently projected from CGStore `user.memory`:

```text
backend/src/services/agentHomeService.js:108-128
backend/src/services/agentHomeService.js:197-203
```

The architecture describes GrowthMemory as long-term confirmed memory, while CGStore user memory is a browser-originated derived memory structure. The current implementation exposes it without an explicit authority marker distinguishing fact, confirmed memory and derived projection.

### 2.4 CoachMemory Availability

CoachMemory remains browser-side data and is unavailable to the backend:

```text
backend/src/services/agentHomeService.js:197-203
docs/PERSONAL_LEARNING_AGENT_HOME_ARCHITECTURE_V1_0.md:258
docs/PERSONAL_LEARNING_AGENT_HOME_ARCHITECTURE_V1_0.md:328
```

The response honestly marks it unavailable, but the contract still reserves a field that currently has no backend Source of Truth.

## 3. Required Architecture Decisions

1. Define whether `reflections.todaySummary` should represent:
   - true Reflection history;
   - a deterministic behavior snapshot; or
   - a separate behavior context field in LearningContext.

2. Define the canonical owner of the daily task/focus/streak summary and whether `learningHistory` may reuse it as a read-only projection.

3. Define GrowthMemory authority semantics:
   - Source Data;
   - Derived Memory;
   - Confirmed Memory; or
   - a versioned projection with explicit authority metadata.

4. Define whether CoachMemory should remain in LearningContext v1 as `available:false`, be removed from the v1 contract, or wait for a server-side CoachMemory adapter.

5. Define the migration-safe contract rule for future LearningContext versions without breaking `learning-context-v1`.

## 4. Constraints

- Do not modify CGStore.
- Do not modify Analytics.
- Do not modify Goals.
- Do not modify Sync.
- Do not modify Reflection.
- Do not create a second memory system.
- Do not mutate Knowledge State.
- Do not introduce Agent, Planner, Tutor or Autonomous Action.
- Maintain user isolation and bounded reads.

## 5. Recommended Resolution Direction

The smallest architecture-preserving direction is likely to keep `learning-context-v1` stable, add explicit source/authority metadata, and clarify that today's Reflection field is a behavior snapshot until a true Reflection adapter exists. A separate bounded adapter can later expose true Reflection history without duplicating statistics.

This direction must be approved before implementation because it affects the LearningContext contract.

## 6. Gate Impact

Phase 27.1 remains:

```text
NOT_READY_TO_FREEZE
```

Phase 27.2 must not start until this review is resolved.

---

# Resolution — 2026-09-20

H-1 已按方案 (b) 完成代码级整改并通过独立复审：

- `agent-llm-context-v1` 本体不再包含 `ownerUserId`。
- Gateway 只向 Provider 传递 `toProviderPayload()` 投影。
- Provider 在构造 Prompt 前再次执行投影，形成纵深防御。
- Evidence Binding 的所有权校验改为控制面显式传入 `ownerUserId`。
- 新增链路级 Provider Boundary 回归测试。

复审报告：`docs/PHASE_27_7_H1_REMEDIATION_INDEPENDENT_REAUDIT.md`。

最终结论：`READY_TO_FREEZE`。
