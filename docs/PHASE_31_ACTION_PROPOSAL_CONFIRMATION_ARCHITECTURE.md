# Phase 31 Action Proposal + User Confirmation Architecture

Status: IMPLEMENTATION_CONTRACT

Baseline: Phase 30 Learning Planner.

## 1. Goal

把 Planner block 转换为用户可控 action：

```text
Plan block
  → Action Proposal
  → User Confirmation
  → Bounded Action Executor
  → Assessment / Review
  → Feedback
```

Agent 永远不能代替用户确认。

## 2. Data Model

新增 append/reconcile 表：

```text
learning_action_proposals
```

字段：

- `id`
- `user_id`
- `course_id`
- `knowledge_node_id`
- `kind`: `assessment | review | consolidate`
- `status`: `proposed | confirmed | completed | dismissed`
- `plan_id`
- `block_id`
- `fingerprint`
- `payload_json`
- timestamps

约束：

1. `(user_id, fingerprint)` 唯一。
2. Knowledge Node / Course / User 必须一致。
3. Proposal 不修改 Student Mastery。
4. Assessment evidence 仍是唯一掌握反馈。

## 3. Proposal Identity

```text
fingerprint = sha256(planId:blockId:kind:knowledgeNodeId:dayKey)
```

同一 plan block 重复确认复用同一 proposal。

## 4. Permission Model

1. Planner 仍是 read-only。
2. Confirm action 需要 JWT + writeLimiter + explicit user request。
3. Confirm 后：
   - assessment block → 返回 assessment item payload；
   - review / consolidate block → 返回 client-side review instruction。
4. Confirm 不写 mastery。
5. Assessment attempt 通过既同事务写入 attempt + evidence；成功后才将 proposal 标记为 completed。
6. Review / consolidate 可以由用户显式标记 completed，但不伪造 mastery evidence。

## 5. API

```text
POST /api/learning/actions/confirm
POST /api/learning/actions/:id/complete
GET  /api/learning/actions
```

Confirm input：

```json
{
  "courseId": "string",
  "planId": "string",
  "blockId": "string",
  "availableMinutes": 60
}
```

## 6. Security

1. Proposal owner 隔离。
2. Plan / block 必须能被服务端重建并匹配。
3. Action kind allowlist。
4. User answer 不改变 proposal kind 或 authority。
5. Response 不暴露内部堆栈。
6. 不执行 Todo / Goal / Analytics write。

## 7. Tests

1. proposal confirmation。
2. completed proposal 幂等。
3. foreign proposal / course 拒绝。
4. assessment action 返回 item。
5. assessment attempt 更新 proposal 状态。
6. review action 不伪造 mastery evidence。
