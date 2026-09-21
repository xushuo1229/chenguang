# Phase 29 Adaptive Mastery & Review Intelligence Architecture

Status: IMPLEMENTATION_CONTRACT

Baseline: Phase 28 Assessment Engine.

## 1. Goal

把静态 Review Queue 升级为自适应复习智能：

```text
Student Knowledge State
  + Knowledge Evidence
  + Practice Attempts
  → Adaptive Review Intelligence
  → bounded review recommendations
```

Phase 29 是 read-only intelligence，不自动写用户数据，不执行复习。

## 2. Data Authority

1. `student_knowledge_states` 是掌握状态唯一来源。
2. `student_knowledge_evidence` 是证据唯一来源。
3. `student_practice_attempts` 是练习表现参考。
4. Adaptive score 是 projection，不持久化。
5. Adaptive score 不能覆盖 mastery、confidence 或 state。

## 3. Contract

```text
adaptive-review-v1
```

Item fields：

- `knowledgeNodeId`
- `nodeTitle`
- `state`
- `masteryLevel`
- `confidence`
- `evidenceCount`
- `lastEvidenceAt`
- `lastAssessmentAt`
- `assessmentAverage`
- `dueNow`
- `dueAt`
- `priority`
- `riskLevel`
- `recommendedMode`
- `reasons`

Response fields：

- `version`
- `courseId`
- `items`
- `limit`
- `metadata`

## 4. Deterministic Policy

| State | Base interval | Base priority |
| --- | --- | --- |
| no_state | 0d | 100 |
| weak | 1d | 90 |
| learning | 3d | 60 |
| mastered | 14d | 20 |

1. `dueNow = now >= state.updated_at + interval`。
2. `priority` 只由 state、mastery gap、evidence recency 和 assessment average 派生。
3. `riskLevel` 只允许 `none | watch | high`。
4. `recommendedMode` 只允许 `assessment | review | consolidate`。
5. 最多返回 50 items。
6. 同分按 mastery 升序、nodeTitle 排序。

## 5. Recommended Mode

1. 没有 assessment evidence → `assessment`。
2. assessment average < 0.5 → `assessment`。
3. dueNow 且 state 不是 weak → `review`。
4. 其他 → `consolidate`。

## 6. Boundaries

1. 不创建 review schedule table。
2. 不引入 FSRS、BKT、LLM inference 或 Vector DB。
3. 不自动写 Review Evidence。
4. 不自动修改 Knowledge State。
5. 不执行 action。
6. user / course / node 全链路 owner 隔离。

## 7. API

```text
GET /api/learning/adaptive-review/:courseId
Authorization: JWT
```

## 8. Tests

1. 无状态节点生成 `no_state` 推荐。
2. weak / learning / mastered 优先级有序。
3. assessment 表现影响 risk 与 mode。
4. due policy deterministic。
5. cross-user isolation。
6. route authentication。
