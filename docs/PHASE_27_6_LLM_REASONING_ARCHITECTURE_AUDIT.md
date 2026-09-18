# Phase 27.6 LLM Reasoning Architecture Audit

Date: 2026-09-18

## Audit Result

READY_TO_FREEZE

## Scope

- `docs/PHASE_27_6_LLM_REASONING_ARCHITECTURE.md`
- `docs/PERSONAL_LEARNING_AGENT_ARCHITECTURE_V1_1.md`
- `docs/PHASE_27_1_CONTEXT_BOUNDARY_REMEDIATION.md`
- `docs/PHASE_27_2_2_PRODUCT_ADAPTER_ARCHITECTURE.md`
- `docs/PHASE_27_4_DETERMINISTIC_INSIGHT_ARCHITECTURE.md`
- `docs/PHASE_27_5_REASONING_CONTRACT.md`
- `backend/src/routes/agentHome.js`
- `backend/src/services/agentHomeService.js`
- `backend/src/services/agentAdapters/`
- `backend/src/services/agentInsights/`
- `backend/src/services/agentReasoning/`
- `js/agentHomeService.js`
- `js/agentHomeView.js`

本阶段为架构审计，未修改生产代码。

## Architecture Consistency

### Personal Learning Agent Architecture v1.1

PASS

- LLM 被定义为解释层，不是事实层。
- 所有写入和自动执行仍被禁止。
- Context 仍然 bounded、versioned、permission-filtered。
- 输出可以解释、总结、建议，但建议不是事实，也没有 action payload。

### Phase 27.1 Context Boundary

PASS

- 输入必须由服务端从 `req.userId` 重建。
- 不接受客户端 Context。
- Behavior Summary 不冒充 Reflection。
- Reflection 和 CoachMemory 保持 unavailable。
- GrowthMemory 仍为 derived_memory。

### Phase 27.2 Product Adapters

PASS

- LLM 只消费 Adapter / Insight / Reasoning 的下游投影。
- 不绕过 Adapter 访问 Course、Knowledge State、Behavior 或 Memory。
- 不复制业务统计逻辑。

### Phase 27.4 Deterministic Insight

PASS

- `agent-insight-v1` 仍是事实边界。
- LLM 事实解释必须引用 `factRefs.insightId` 和 `evidenceIndexes`。
- LLM 不能创建新的 Insight。

### Phase 27.5 Deterministic Reasoning

PASS

- `agent-reasoning-v1` 仍是确定性解释边界。
- LLM 可以引用 `reasoningRefs`，但不能覆盖它。
- LLM 不新增 action level，仍保持 `insight_only`。

## Boundary Review

### Source of Truth Hierarchy

PASS

```text
Source Data
→ Deterministic Projection
→ Deterministic Insight
→ Evidence
→ Deterministic Reasoning
→ LLM Explanation
```

LLM 不能反向生成 Evidence、Analytics、Mastery、Knowledge State 或 Memory。

### Context Boundary Bypass

PASS

架构要求 Context Firewall 在 Provider 调用前执行，只允许服务端构建输入，禁止 raw DB / CGStore / localStorage / user_data。

### Evidence Bypass

PASS

`basis=deterministic_fact` 必须绑定可解析的 Insight Evidence；无引用事实直接验证失败。

### Memory Bypass

PASS

- GrowthMemory 只能作为 derived context；
- CoachMemory 不进入 Prompt；
- Reflection unavailable 不参与解释；
- LLM 输出不写回任何 Memory。

### Action Bypass

PASS

- 无 tool call；
- 无 command；
- 无 planner；
- 无 action executor；
- 无 mutation payload；
- output `permissions.write=[]`。

## Security Review

PASS

- API 设计要求现有 JWT authentication。
- Context 只能由服务端从 `req.userId` 构建。
- 前端只能提交固定 task，不允许自由 prompt。
- Provider secret 不进入前端、Context、日志或错误响应。
- Provider 原始错误不返回给用户。
- 输出必须通过 schema 和引用验证。
- Prompt Injection 场景被纳入测试策略。
- 跨用户泄漏被定义为 hard security failure。

## Privacy Review

PASS

- 只发送当前用户最小投影。
- 禁止发送完整 Course Document、身份信息、凭证、跨用户数据。
- 禁止存储 LLM 输出为 Memory、Reflection 或 Evidence。
- 观测数据限定为无 prompt、无用户原文的计数与延迟指标。

## Evidence Review

PASS

架构冻结了三层追溯：

```text
deterministic_fact → factRefs + reasoningRefs
derived_memory_context → memoryRef + derived authority
suggestion / interpretation → 明确标记，不是事实
```

事实语句如果没有 Evidence Binding 会被验证拒绝。

## Determinism Boundary Review

PASS

- Deterministic Insight / Reasoning 不依赖 LLM。
- LLM unavailable 时 Agent Home 保留确定性结果。
- Context Firewall 排序确定、截断确定。
- Provider metadata 不参与事实语义。

## Fallback Review

PASS

Fallback 有 allowlist reason、空 explanations、空 suggestions、只读权限，并且不会阻断 Agent Home。跨用户 mismatch 不允许 fallback 展示，必须硬失败。

## Test Strategy Review

PASS

架构文档要求覆盖：

1. contract allowlist；
2. firewall bounds；
3. cross-user isolation；
4. prompt injection；
5. fake evidence；
6. output validation；
7. provider secret suppression；
8. LLM unavailable fallback；
9. deterministic regression；
10. desktop / mobile browser smoke。

## Findings

### Critical

None

### High

None

### Medium

None

### Low

#### L-001 Provider Ordering Variance

- Evidence: LLM Provider 可能对相同 context 产生不同措辞。
- Recommendation: 实现时必须确保语义输出确定性受 schema 和 evidence binding 控制；不需要强制逐字一致。可保存 response hash 用于观测，但不能作为事实。

#### L-002 Suggestion Misinterpretation

- Evidence: Suggestion 可能被用户误解为系统即将执行的任务。
- Recommendation: 前端必须显示“建议”标签；实现阶段禁止 action button 和执行入口。

## Freeze Gate

```text
Architecture: PASS
Boundary: PASS
Security: PASS
Privacy: PASS
Evidence: PASS
Determinism Boundary: PASS
Fallback: PASS

Critical: 0
High: 0
Medium: 0
Low: 2
```

## Final Verdict

READY_TO_FREEZE
