# Phase 32 Personal Learning Agent 2.0 Architecture

Status: IMPLEMENTATION_CONTRACT

Baseline: Phase 31 Action Proposal + User Confirmation.

## 1. Goal

将 Phase 28–31 的能力编排为 Personal Learning Agent 2.0：

```text
Perception
  → Adaptive Review Intelligence
  → Learning Planner
  → User-confirmed Action
  → Assessment / Review
  → Feedback / Student State
  → Next Perception
```

这不是 autonomous agent，也不是 tool-calling agent。

## 2. Runtime Responsibilities

1. `buildOverview()`：
   - 汇总 adaptive review、learning plan 和 action proposal；
   - 只输出 perception 与推荐；
   - 不执行 action。
2. `confirmNextAction()`：
   - 必须收到显式 `confirmed = true`；
   - 只确认 plan 的第一个可执行 block；
   - 复用 Phase 31 action executor。
3. Assessment attempt：
   - 继续写入 Practice Attempt + Knowledge Evidence；
   - 更新 Student Knowledge State；
   - 完成 confirmed proposal。

## 3. Contract

```text
personal-learning-agent-v2
```

Overview：

- `perception.stateCounts`
- `perception.riskCounts`
- `perception.nextBestRecommendation`
- `plan`
- `actions`
- `permissions`
- `metadata`

Confirm result：

- `proposal`
- `action`
- `planContext`

## 4. Authority

1. System Facts > Deterministic Analytics > Course Knowledge > Student State > Evidence > Insight > Reasoning > User Input > LLM。
2. LLM 只解释，不选择 action，不执行 action。
3. Adaptive score 不改写 mastery。
4. Planner block 不是 fact。
5. Proposal 不改写 mastery。
6. User input 不改写 Evidence。

## 5. Safety

1. Agent 默认 read-only。
2. 所有 action 需要 explicit user confirmation。
3. Assessment attempt 仍要求用户确认。
4. 一次只 confirm 一个 next action。
5. 不自动连续执行。
6. 不写 Todo、Goal、Analytics、Sync、Memory。
7. 不调用 external system。
8. 不执行 tool-calling。

## 6. API

```text
GET  /api/learning/agent/:courseId/overview
POST /api/learning/agent/:courseId/next-action
```

Confirm body：

```json
{ "confirmed": true }
```

## 7. Tests

1. overview 汇总 state/risk counts。
2. overview 保持 recommendation-only。
3. next action 需要 explicit confirmation。
4. confirmed action 返回 assessment。
5. assessment feedback 完成 proposal。
6. foreign course fail closed。
