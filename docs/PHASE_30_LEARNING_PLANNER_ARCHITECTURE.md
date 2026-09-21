# Phase 30 Learning Planner Architecture

Status: IMPLEMENTATION_CONTRACT

Baseline: Phase 29 Adaptive Review Intelligence.

## 1. Goal

生成只读当日学习计划：

```text
Adaptive Review Intelligence
  → Deterministic Learning Planner
  → bounded plan blocks
```

Planner 不执行计划、不写 Todo、不写 Knowledge State、不调用 LLM。

## 2. Contract

```text
learning-plan-v1
```

Plan：

```json
{
  "version": "learning-plan-v1",
  "planId": "deterministic-id",
  "courseId": "string",
  "dayKey": "YYYY-MM-DD",
  "availableMinutes": 60,
  "blocks": [],
  "metadata": {}
}
```

Block：

- `blockId`
- `kind`: `assessment | review | consolidate`
- `knowledgeNodeId`
- `nodeTitle`
- `minutes`
- `priority`
- `riskLevel`
- `reason`
- `sourceRefs`

## 3. Deterministic Policy

1. 最多 4 blocks。
2. `availableMinutes` 默认 60，范围 15–240。
3. block duration 只允许 10、15、20、25。
4. 只消费 Adaptive Review top recommendations。
5. 同一天同 course + adaptive source fingerprint 得到相同 `planId`。
6. `generatedAt` 不参与 `planId`。
7. 超出 availableMinutes 的 block 丢弃。

## 4. Source Selection

1. `no_state` / 缺 assessment evidence → `assessment`。
2. `dueNow` → `review`。
3. 其他 → `consolidate`。
4. 高 priority 优先。
5. 每个 knowledge node 最多一个 block。

## 5. Boundaries

1. Plan 是 recommendation，不是 fact，不是 action。
2. 无 action authority。
3. 无 write authority。
4. 不修改 Todo、Goal、Analytics、Course Knowledge 或 Student State。
5. 不创建 planner persistence table。
6. course / owner fail closed。

## 6. API

```text
GET /api/learning/planner/:courseId?availableMinutes=60
Authorization: JWT
```

## 7. Tests

1. plan deterministic。
2. plan bounded by available minutes。
3. no-state 节点生成 assessment block。
4. due 节点生成 review block。
5. foreign course 拒绝。
6. response 不包含 action execution permission。
