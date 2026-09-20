# Phase 27.7.4 Context Selection Engine Audit

## Audit Result

**READY_TO_FREEZE**

本次为独立实现审计。审计过程中发现 3 个问题，均已在本阶段完成最小修复，并通过 focused tests 与完整回归。最终 Critical = 0、High = 0、Medium = 0。

## Scope

审查范围：

```text
backend/src/services/agentContextSelection/contextSelectionContract.js
backend/src/services/agentContextSelection/contextSelectionEngine.js
backend/test/agentContextSelection.test.js
docs/PHASE_27_7_4_CONTEXT_SELECTION_ENGINE_IMPLEMENTATION.md
```

对照架构：

```text
Phase 27.7 MVP Architecture
Phase 27.7.1 Learning Conversation Architecture
Phase 27.7.2 Context Selection Engine Architecture
Phase 27.7.3 Query Understanding Contract
Phase 27.6.1 Context Firewall
```

## Architecture Review

### Boundary

PASS。

- Engine 是纯服务模块，没有 HTTP API。
- 没有直接访问数据库、CGStore、Sync、Provider、LLM 或 RAG。
- 没有引入 Memory Writer、Planner、Action Executor、Chat UI 或 autonomous agent。
- 输出仍是 internal contract，没有绕过 Context Firewall。

### Source Allowlist

PASS。

只允许 8 类 v1 source：

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

GrowthMemory、Reflection、CoachMemory、raw database row、full CGStore/Sync dump 不可选择。

### Authority / Provenance

PASS。

- source type 与 authority 保持固定映射。
- relevance score 不提升 authority。
- provenance 只保留 adapter、recordId、snapshotId 与 ownership result。
- `ownerUserId` 只存在于 Control Plane，不进入 Data Plane。

### Determinism / Budget

PASS。

- 同一输入与快照产生相同 selection fingerprint。
- 排序不依赖随机、时间、Provider、LLM 或数据库顺序。
- item、source、history、content、serialized bytes 与 estimated tokens 均有上限。
- 超预算 deterministic omit，不隐藏截断。

### Backward Compatibility

PASS。

- 本阶段只新增独立服务模块与测试。
- 没有修改既有 API、Context Firewall、Provider、CGStore、Analytics、Goals、Sync 或 Today Plan。

## Data Truthfulness Review

PASS。

- Selector 不生成事实、Evidence、Insight 或 Reasoning。
- 只选择既有 candidate projection。
- deterministic fact、approved insight、approved reasoning 必须引用最终已选中的 Evidence。
- 无 Evidence 的 fact-like context 会被 omit，并显式标记 `missing_evidence_for_fact_claim`。
- 当存在 context 但 fact-like claim 缺少 Evidence 时，状态为 `insufficient_context`，不会伪装为完整可用答案。

## Prompt Security Review

PASS。

- source text 仍为 DATA。
- 注入文本不能改变 scope、authority、permissions、source allowlist 或 Control Plane。
- selector 不执行任何 instruction。
- 后续仍必须由 Context Firewall 与 Provider allowlist 做最终边界控制。

## Isolation Review

PASS。

- Control Plane 必须包含 authenticated owner，且 `read=true`、`write=false`。
- 任何 candidate `ownerUserId` mismatch 都使整个 selection `rejected / CROSS_USER_SOURCE`。
- explicit course / multiple courses / explicit knowledge 只匹配 Query Understanding 给出的显式合法引用。
- 未请求的 course、knowledge 或 source 不进入 selection。

## Cost Review

PASS。

当前输出由硬上限约束：

```yaml
max_total_items: 24
max_selected_content_chars: 4800
max_serialized_selection_bytes: 6144
max_estimated_tokens: 1536
```

用户数据增长不会直接导致 selection result token 无限增长。Provider 调用仍属后续集成阶段，必须继续经过 Context Firewall。

## Findings

### F-001 Query Understanding detail validation short-circuited

Severity: High

Evidence: `backend/src/services/agentContextSelection/contextSelectionContract.js:297`

Recommendation: 修复用户上下文 item 的布尔校验逻辑，确保 kind、authority、retention、totalChars 全部验证。

Status: FIXED

### F-002 Candidate metadata unknown-field propagation

Severity: Medium

Evidence: `backend/src/services/agentContextSelection/contextSelectionEngine.js:257`

Recommendation: 移除 candidate metadata spread，只输出 selector 自己生成的 relevance metadata。

Status: FIXED

### F-003 Fact-like context evidence integrity incomplete

Severity: High

Evidence: `backend/src/services/agentContextSelection/contextSelectionEngine.js:425`

Recommendation: deterministic fact、approved insight、approved reasoning 必须有 selected evidence；缺失时 fail closed 并显式 `insufficient_context`。

Status: FIXED

## Test Verification

```yaml
Context Selection focused tests: 26/26 PASS
Backend full regression: 259/259 PASS
Frontend full regression: 609/609 PASS
Build: PASS
```

无新增 regression，无既有失败。

## Final Verdict

READY_TO_FREEZE
