# Phase 27.6.2 LLM Output Validator Architecture Audit

Date: 2026-09-18

## Audit Result

READY_TO_FREEZE

## Scope

- `docs/PHASE_27_6_2_LLM_OUTPUT_VALIDATOR_ARCHITECTURE.md`
- `docs/PHASE_27_6_1_CONTEXT_FIREWALL_CONTRACT.md`
- `docs/PHASE_27_6_1_CONTEXT_FIREWALL_INDEPENDENT_REAUDIT.md`
- `docs/PHASE_27_6_LLM_REASONING_ARCHITECTURE.md`
- `docs/PHASE_27_5_REASONING_CONTRACT.md`
- `docs/PHASE_27_4_DETERMINISTIC_INSIGHT_ARCHITECTURE.md`
- `backend/src/services/agentFirewall/*`
- `backend/src/services/agentReasoning/*`
- `backend/src/services/agentInsights/*`
- `backend/src/routes/agentHome.js`

本阶段是 architecture-only audit，没有实现 Provider、Validator、API、UI 或任何生产代码。

## Architecture

PASS

- Validator 位于 Raw LLM Output 和 User 之间。
- Raw output 不允许直接进入 frontend。
- 验证顺序固定：Parse → Schema → Semantic → Evidence → Reasoning → Authority → Safety → Bounds。
- 输出契约版本化为 `agent-llm-output-v1`。
- Fallback 来自 Phase 27.5 Deterministic Reasoning。

## Fact Boundary

PASS

- `fact` 必须绑定当前 Firewall Context 中的 Evidence 和 Reasoning。
- LLM 不能创建 Evidence、Insight 或 Reasoning。
- Authority hierarchy 不会因 LLM 输出提升。
- Unsupported factual claim 必须 reject；部分 interpretation 可以降级为 uncertainty，但前提是不含事实数字。
- `generationConfidence` 与事实置信度分离，不能表示 truth score。

## Evidence

PASS

- Evidence 引用必须匹配 `insightId:index` 形式的 `evidenceId`。
- `metric` / `period` / authority 必须与 Firewall Evidence 匹配。
- fake evidence、cross-user evidence、新 evidence 均被拒绝。
- 每条 fact claim 的 evidence refs 有上限。

## Security

PASS

- Prompt Injection 不只依赖 Prompt，Validator 会拒绝 fake provenance、unsupported fact、PII、credential、action 和 tool request。
- Cross-user reference 是 hard failure。
- Raw output、provider metadata、validation diagnostics、provider request id 不进入用户可见 projection。
- Context expansion / tool calling / action execution 被禁止。
- 输出包含 secret / credential 时 reject。

## Privacy

PASS

- Context 中没有的 email、phone、address、identifier、credential 等输出必须拒绝。
- 不允许 LLM 猜测用户身份信息。
- 不允许记录 raw prompt、raw context、raw output 或 PII。

## Determinism

PASS

- Validator 使用确定性规则，不依赖 Provider trust。
- 输入相同则 validation status、accepted / rejected item、fallback result 一致。
- Numerical 和 temporal validation 都要求与 deterministic Evidence 精确匹配。
- Fallback 稳定、有界、user-isolated、provider-independent。

## Bounds

PASS

- total output：8,192 bytes。
- explanations：5。
- suggestions：3。
- uncertainties：2。
- claims per explanation：3。
- evidence refs per claim：3。
- reasoning refs per claim：1。
- 文本长度明确限制。
- generationConfidence 必须为 finite number 且 `[0,1]`，禁止 coercion。

## Fallback

PASS

- 所有 Validator 失败路径都可进入 deterministic fallback。
- Fallback 来源是 `agent-reasoning-v1`。
- 不展示 raw LLM output。
- LLM unavailable、malformed、unsafe、unsupported、evidence mismatch、context mismatch 均有 fallback reason。
- LLM 失败不破坏 Agent Home 的确定性结果。

## Provider Independence

PASS

- Validator 只接收 generic `rawOutput` 和 optional `providerMetadata`。
- 不依赖 OpenAI / Anthropic / Gemini / DeepSeek / SDK / message format。
- Provider-specific normalization 被隔离在未来 Provider Adapter。

## Memory

PASS

LLM Output 不能写入 GrowthMemory、CoachMemory、Reflection、Student Knowledge State、Course Knowledge、Evidence、Analytics 或 Goals。未来 Memory 必须走独立 Candidate / Policy / Confirmation / Writer 设计。

## Action

PASS

- `actionLevel` 固定为 `insight_only`。
- 禁止 create / update / delete / navigate / execute / tool_call / function_call。
- 未来 Action 必须独立经过 Proposal → Validation → User Confirmation → Executor。

## Compatibility

PASS

- 与 Phase 27.4 Insight Contract 兼容：事实只能引用已有 Insight / Evidence。
- 与 Phase 27.5 Reasoning Contract 兼容：fallback 和 reasoning binding 均指向已有 deterministic reasoning。
- 与 Phase 27.6.1 Context Firewall 兼容：引用解析使用 `agent-llm-context-v1`，不重新定义边界。
- 与 Personal Learning Agent Architecture v1.1 兼容：LLM 仍不是 Source of Truth。

## Findings

### Critical

None

### High

None

### Medium

None

### Low

#### L-001 Natural Language Entailment Is Not Fully Solvable

- Evidence: Validator 使用 deterministic numeric / temporal / provenance rules，不能证明任意自然语言语句被 Evidence 完全蕴含。
- Recommendation: 保留当前策略：无法确定性验证的事实 claim 必须 reject 或 fallback。未来不得为了通过更多输出而引入不可解释的黑盒 NLI 评分。

#### L-002 Partial Acceptance Requires Careful Tests

- Evidence: 架构允许保留合法 item，但含非法 factual claim 的 explanation item 必须整体 reject。
- Recommendation: 实现阶段必须测试非法 item 不会污染合法 item，也不会通过 valid envelope 隐藏 invalid claim。

## Freeze Gate

```text
Architecture: PASS
Fact Boundary: PASS
Evidence: PASS
Security: PASS
Privacy: PASS
Determinism: PASS
Bounds: PASS
Fallback: PASS
Provider Independence: PASS

Critical: 0
High: 0
Medium: 0
Low: 2
```

## Final Verdict

READY_TO_FREEZE
