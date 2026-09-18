# Phase 27.5 Reasoning Independent Re-Audit

## Audit Result

READY_TO_FREEZE

## Baseline

- Implementation: `b2a5481 feat: add agent reasoning explanation layer`
- Plan/Contract: `1ff7e97 docs: plan phase 27.5 reasoning contract`
- Architecture: `c923cbd docs: architect phase 27.5 reasoning layer`
- Previous freeze: `b69c852 docs: freeze phase 27.4 deterministic insights`
- Audit hardening: `3740246 fix: harden reasoning confidence validation`

本次审计发现一个高优先级置信度校验问题，并在审计门禁内完成最小修复。该修复只影响 Reasoning 契约校验，不改变 Reasoning 架构边界。

## Scope

### 审计对象

- `backend/src/routes/agentHome.js`
- `backend/src/services/agentReasoning/reasoningContract.js`
- `backend/src/services/agentReasoning/reasoningEngine.js`
- `backend/src/services/agentReasoning/reasoningRules.js`
- `backend/src/services/agentReasoning/fallback.js`
- `js/agentHomeService.js`
- `js/agentHomeView.js`
- `agent-home.html`
- `backend/test/reasoningContract.test.js`
- `backend/test/reasoningEngine.test.js`
- `backend/test/reasoningBoundary.test.js`
- `tests/agentHomeUI.test.js`

### 审计边界

- 只验证 Phase 27.5 Reasoning Layer。
- 不进入 Planner、Autonomous Action、AI Tutor。
- 不修改 CGStore、Analytics、Goals、Sync、Reflection、GrowthMemory、CoachMemory。
- 不修改 Course Space 或 Student Knowledge State。
- 不引入 LLM、RAG、第二套数据源。

## Architecture Review

### 架构结果

PASS

Reasoning Layer 位于 Deterministic Insight Layer 之后：

```text
Agent Context API
↓
agent-insight-v1
↓
Reasoning Engine
↓
agent-reasoning-v1
↓
Agent Home UI
```

`backend/src/routes/agentHome.js:30-37` 在服务端重新构建 Context 和 Insights 后才调用 Reasoning Engine，避免客户端注入私有 Context。

`backend/src/services/agentReasoning/reasoningEngine.js:20-67` 只消费传入的 Context 与 Insight，不访问数据库，也不执行计划、任务或写操作。

### Reasoning Contract

PASS

- 契约版本：`agent-reasoning-v1`。
- Action Level：固定为 `insight_only`。
- `permissions.write`：固定为空数组。
- 输入必须为只读 Context 和只读 Insight。
- 输出经过有界归一化。

### Insight Boundary

PASS

Reasoning Rules 只根据已有 Insight 类型生成解释文案，不创建新 Insight、新事实或新建议。`backend/src/services/agentReasoning/reasoningRules.js:32-59` 要求 Insight 必须已有 id、type 和 evidence，否则返回 null。

### Determinism

PASS

解释内容来自固定规则映射和传入 Insight 的证据引用。除 envelope 的 `generatedAt` 之外，Reasoning 语义输出是确定性的。`generatedAt` 不参与解释语义，只标记响应生成时间。

### Read Only

PASS

- Engine 输出 `metadata.readOnly=true`。
- Engine 输出 `metadata.actionLevel=insight_only`。
- Engine 输出 `permissions.write=[]`。
- Agent Home UI 没有 AI 行动按钮、表单、聊天输入或执行入口。

## Data Truthfulness Review

PASS

### Evidence

PASS

每条解释必须绑定已有 Insight 的 Evidence Reference：

- `insightId`
- evidence index
- source
- metric
- period

`backend/src/services/agentReasoning/reasoningContract.js:78-97` 丢弃缺少 insightId、insightType、title、why 或 evidenceRefs 的解释。

### 置信度

PASS

审计前发现 `boundedUnit` 使用 `Number(value)` 强转，可能接受 `"1"` 或把 `null` 变成 `0`。这与“字符串不应被错误转换、缺失值不应变成有效值”的要求冲突。

已在 `backend/src/services/agentReasoning/reasoningContract.js:22-25` 改为严格校验：

```js
typeof value === 'number'
Number.isFinite(value)
value >= 0
value <= 1
```

同时：

- `validateReasoningInput` 拒绝非数字 Insight Confidence：`backend/src/services/agentReasoning/reasoningContract.js:59-65`。
- `normalizeExplanation` 丢弃非法 Explanation Confidence：`backend/src/services/agentReasoning/reasoningContract.js:78-97`。
- 新增 `NaN`、`Infinity`、`null`、`undefined`、`"1"`、`true`、`-0.1`、`1.1` 回归测试。

## Security Review

### Authentication

PASS

`GET /api/agent-home/reasoning` 使用 `authRequired`：`backend/src/routes/agentHome.js:30`。

### User Isolation

PASS

- Context 由 `req.userId` 构建。
- Reasoning Engine 校验 `context.userId === insights.userId`。
- 输出的 `userId` 来自服务端 Context。
- 未认证请求返回 401。
- 不同用户只获得自己的 Reasoning envelope。

证据：`backend/test/reasoningBoundary.test.js:70-109`。

### Authorization

PASS

- 允许读取确定性洞察。
- 禁止写入业务数据。
- Reasoning 只返回解释，不返回 action token、mutation request 或执行计划。
- API 侧 POST 未被注册，测试确认写入尝试被拒绝。

### Prompt Security

PASS

Phase 27.5 是确定性解释层，不调用 LLM、不拼接 Prompt、不接收自由文本。上下文数据不会变成系统指令。

### Output Safety

PASS

- 文本经过长度截断和控制字符过滤。
- evidence refs 有数量和索引边界。
- explanations 有数量边界。
- UI 使用 DOM API 渲染文本，不拼接 HTML。

## Cost Review

PASS

- Insights 最多生成有界解释数量。
- 每条解释最多引用 10 个 Evidence。
- 文本长度有明确上限。
- UI 只渲染前 5 条解释。
- 无 LLM 调用，无外部 Provider 成本。

## Frontend Review

PASS

`js/agentHomeView.js:150-169` 渲染 Reasoning Explanation：

- title
- why
- confidence
- evidence metric、period、source

空状态显示“暂无推理解释。”。组件继续使用现有 MPA + Vanilla JS 架构，没有引入框架。

## Test Verification

### Backend

```text
npm test --prefix backend
Tests: 130/130 PASS
Failures: 0
```

### Frontend

```text
npm test
Tests: 598/598 PASS
Failures: 0
```

### Build

```text
npm run build
PASS
```

### Browser Smoke

```text
Desktop 1920x1080: PASS
Mobile 375x812: PASS
Sections: 6
Console errors: 0
Page errors: 0
HTTP >= 400: 0
Horizontal overflow: 0
Action controls: 0
```

浏览器验证到的六个模块：

```text
Learning Overview
Course Intelligence
Knowledge State
Growth Context
AI Insights
Reasoning Explanation
```

### Git Validation

```text
git diff --check: PASS
```

## Findings

### F-001 High — Confidence Numeric Coercion

- Severity: High
- Status: Remediated
- Evidence: 原 `boundedUnit` 使用 `Number(value)`，`"1"` 可能被接受，`null` 可能被归一化为 `0`。
- Recommendation: 已在 `backend/src/services/agentReasoning/reasoningContract.js:22-25`、`:59-65`、`:78-97` 使用严格数字和 0–1 边界校验。
- Verification: `backend/test/reasoningContract.test.js` 已覆盖非法 confidence 类型和越界值。

### F-002 Low — Unavailable Reasoning Envelope 可保留 Explanations

- Severity: Low
- Status: Open
- Evidence: `normalizeReasoning` 归一化后不会在 `available=false` 时强制清空 `explanations`。当前 Engine 只在 `available=true` 时生成 explanations，UI 也会忽略 unavailable 状态，因此不是当前链路 blocker。
- Recommendation: 后续契约强化阶段可在 `normalizeReasoning` 中对 `available=false` 强制 `explanations=[]`。

### F-003 Info — Envelope Timestamp Non-Deterministic

- Severity: Info
- Status: Open
- Evidence: `reasoningEngine.js:27` 和 `reasoningEngine.js:46` 使用 `new Date().toISOString()`。
- Recommendation: 可保留。`generatedAt` 只是响应时间戳，不影响 insight、evidence 或解释语义。若未来需要严格快照级确定性，应把 timestamp 放到 envelope metadata 并与核心 payload 分离。

## Freeze Gate

```text
Critical: 0
High: 0
Medium: 0
Low: 1
Info: 1

Architecture: PASS
Reasoning Contract: PASS
Insight Boundary: PASS
Evidence: PASS
User Isolation: PASS
Security: PASS
Determinism: PASS
Read Only: PASS
Backend: PASS
Frontend: PASS
Build: PASS
Browser: PASS
git diff --check: PASS
```

## Recommendation

Phase 27.5 可以冻结。剩余 Low/Info 不阻塞当前边界，应放到后续契约强化或快照稳定性阶段处理。

## Final Verdict

READY_TO_FREEZE
