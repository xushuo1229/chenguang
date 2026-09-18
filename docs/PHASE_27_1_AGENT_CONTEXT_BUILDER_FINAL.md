# Phase 27.1 Agent Context Builder Foundation Final

## 1. Architecture

本阶段实现 Agent Home 的 Context Read Layer，不实现 Agent、Planner、Tutor、自主 Action 或 LLM 推理。

```text
Course Space / Student Knowledge State / User Data
        ↓
Agent Context Builder
        ↓
bounded LearningContext v1
        ↓
Read-only API
```

新增服务只负责读取、投影、有界聚合和权限标记：

```text
backend/src/services/agentHomeService.js
```

新增只读模型：

```text
backend/src/db/agentHomeContextModel.js
```

服务层没有任何写方法，也不调用 LLM。

## Context Boundary Remediation

独立复审发现早期实现把 `ReflectionContextSource` 的行为摘要放入 `reflections.todaySummary`，导致 Behavior Fact 和 User Reflection 混淆。

已完成修正：

| Context Group | Source | Authority | Type | Boundary |
| --- | --- | --- | --- | --- |
| `courses` | `cgstore.sync.courses` | `source` | `source_projection` | 只读用户课程投影 |
| `courseKnowledge` | `course_space.nodes` | `source` | `course_knowledge_projection` | 只读 Course Space 节点 |
| `knowledgeStates` | `student_knowledge_states` | `source` | `student_knowledge_state_projection` | 只读掌握状态 |
| `behavior` | `reflection_context_source` | `deterministic_projection` | `behavior_summary` | 任务、专注、连续性、目标等行为事实 |
| `reflections` | `reflection_storage` | `unavailable` | `user_reflection` | 当前无后端 Reflection Storage，必须显式不可用 |
| `memories.growth` | `cgstore.user.memory` | `derived_memory` | `growth_memory_projection` | 长期成长记忆投影，不升级为事实来源 |
| `memories.coach` | `coach_memory` | `unavailable` | `interaction_context` | CoachMemory 仍在浏览器 localStorage，后端不可读 |

最终边界：

```text
Behavior Summary = deterministic projection of observed activity
Reflection = user-authored feedback from Reflection Storage
GrowthMemory = derived long-term memory
CoachMemory = AI interaction context
```

当前后端没有 Reflection Storage 和 CoachMemory Backend。Agent Context 不创建这两类存储，也不允许 Behavior Summary 冒充 Reflection。

## 2. API

新增：

```text
GET /api/agent-home/context
```

行为：

- `authRequired` 保护。
- 用户身份来自 `req.userId`。
- 服务端按当前用户读取数据。
- 只支持 GET。
- 返回 `learning-context-v1` 快照。

响应中的权限边界：

```json
{
  "readOnly": true,
  "actionLevel": "insight_only",
  "permissions": {
    "read": [
      "course_knowledge",
      "student_knowledge_state",
      "behavior_summary",
      "growth_memory_projection"
    ],
    "write": []
  }
}
```

## 3. Learning Context Contract

当前输出包含：

| Field Group | Source | Boundary |
| --- | --- | --- |
| `courses.value` | CGStore / Sync payload `courses` | 最多 10 个课程 |
| `courseKnowledge.value.nodes` | Course Space nodes | 最多 10 个节点 |
| `knowledgeStates.value` | Student Knowledge State | 最多 20 个状态；弱项 / 强项各最多 10 个 |
| `behavior.value` | Reflection Context Source 的确定性摘要 | 今日任务、专注、连续性和目标摘要 |
| `reflections.value` | Reflection Storage | 当前不可用，不使用行为数据代替 |
| `memories.growth.value` | CGStore `user.memory` | 最多 10 条非 inactive 记忆 |
| `memories.coach.value` | 暂不可用 | 后端当前无法读取浏览器侧 CoachMemory |

上下文字段均经过 allowlist 投影和文本截断。API 不返回原始 `todos`、`focus`、`courses` 明细数组。

## 4. Bounded Read Rules

- Course Nodes 使用 SQL `LIMIT 10`。
- Knowledge States 使用 SQL `LIMIT 20`。
- 文本字段最多 160 字符；Growth Memory 内容最多 220 字符。
- 数值字段全部做 finite / non-negative / max 校验。
- 响应整体保持在 32KB 以下，并有测试覆盖。
- 不提供 offset、cursor 或无界集合输出。

## 5. Permission Boundary

Agent Context Builder 可以读取：

- 当前用户的 Course Space 节点。
- 当前用户的 Student Knowledge State。
- 当前用户 Behavior Summary。
- 当前用户 GrowthMemory。

Agent Context Builder 不写入：

- Mastery
- Student Knowledge State
- Course Data
- Evidence
- CGStore
- Goals
- Analytics
- Sync Payload

当前 Action Level 只有：

```text
Level 0 / insight_only
```

## 6. User Isolation

- 所有 SQL 查询都包含 `user_id = $1`。
- Course Space 节点只从 `course_space_nodes.user_id` 读取。
- Knowledge State 通过 `student_knowledge_states.user_id` 和 `course_space_nodes.user_id` 双重绑定。
- GrowthMemory 来自当前用户同步 payload 的 `user.memory`。
- API 用户身份来自 JWT，不信任客户端 `userId`。

测试覆盖：

- User A 的 Knowledge State 不会出现在 User B 的 Context。
- User B 只能看到自己的课程。
- `userId <= 0` 的服务调用被拒绝。

## 7. Data Sources

### Course Knowledge

来自现有 Course Space 表，只投影：

```text
courseId / knowledgeNodeId / title / kind / status / confidence
```

不返回 document content、course evidence quote 或 locator。

### Student Knowledge State

来自现有 Student Knowledge State 表，只读展示：

```text
masteryLevel / confidence / state / evidenceCount
```

不重新计算 Mastery，不写入 Evidence。

### Behavior Summary

复用现有 Reflection Context Source 的确定性 helpers：

```text
buildTaskSummary
buildFocusSummary
buildStreaks
buildGoals
```

这避免了在 Agent Context Builder 中创建第二套统计引擎。输出只允许作为 `behavior_summary`，不允许作为 Reflection。

### Reflection Summary

当前后端没有 Reflection Storage。Agent Context 显式返回：

```json
{
  "available": false,
  "reason": "reflection_storage_adapter_not_available"
}
```

不会用任务、专注、连续性或目标统计冒充 Reflection。

### GrowthMemory

读取 CGStore 用户对象中的 `user.memory`，只投影非 inactive 的 patterns、milestones、preferences 和 insights。

### CoachMemory

当前 CoachMemory 存在于浏览器 localStorage，后端 Context Builder 无法读取。响应中标记：

```json
{
  "available": false,
  "reason": "client_side_memory_not_available_to_backend"
}
```

## 8. Security

- JWT required。
- 不接受客户端提交的用户身份。
- 所有查询按用户隔离。
- 只读 API，不注册 POST / PUT / DELETE handler。
- 不调用 AI Provider。
- 不读取敏感凭证。
- 输出使用 allowlist 字段。
- 不返回原始业务集合。
- 文本与数值边界化。

## 9. Files Changed

| File | Change |
| --- | --- |
| `backend/src/db/agentHomeContextModel.js` | 新增只读 Course Node / Knowledge State 查询 |
| `backend/src/services/agentHomeService.js` | 新增 Learning Context Builder |
| `backend/src/routes/agentHome.js` | 新增只读 Agent Home API |
| `backend/src/routes/index.js` | 挂载 `/api/agent-home` |
| `backend/test/agentHomeContext.test.js` | 新增 context、隔离、边界和安全测试 |
| `docs/PHASE_27_1_CONTEXT_BOUNDARY_REMEDIATION.md` | Reflection / Behavior / GrowthMemory / CoachMemory 边界定义 |
| `docs/PHASE_27_1_AGENT_CONTEXT_BUILDER_FINAL.md` | 本文档 |

未修改：

- CGStore
- Analytics
- Goals
- Sync
- Course Space schema
- Student Knowledge State schema
- Reflection
- GrowthMemory
- CoachMemory
- Frontend UI

## 10. Tests

新增后端测试覆盖：

1. LearningContext v1 构建。
2. 弱项 / 强项分组。
3. Behavior Summary。
4. Reflection unavailable。
5. GrowthMemory `derived_memory` 投影。
6. CoachMemory unavailable。
7. 用户隔离。
8. Course Knowledge 输出边界。
9. 未认证请求拒绝。
10. 只读 API 行为。
11. Context payload 小于 32KB。
12. 原始 `todos` 集合不泄露。

验证结果：

```yaml
Backend: 104/104 PASS
Frontend: 590/590 PASS
Build: PASS
git diff --check: PASS
```

Browser smoke:

```yaml
Desktop 1920x1080: PASS
Mobile 375x812: PASS
Pages: workbench / today / stats / goals / ai
Console errors: 0
Page errors: 0
HTTP >= 400: 0
Horizontal overflow: 0
Context: learning-context-v1 / readOnly=true / insight_only
Behavior type: behavior_summary
Reflection available: false
GrowthMemory authority: derived_memory
CoachMemory available: false
Write permissions: []
```

## 11. Limitations

- `behavior.value.trend` 当前为空数组，长期趋势将在后续 Analytics Context Adapter 中补充。
- Reflection 当前不可用，等待独立的 Reflection Storage adapter。
- CoachMemory 仍为浏览器侧数据，未进入后端 LearningContext。
- 本阶段没有 Agent Home UI。
- 本阶段没有 LLM 推理。
- 本阶段没有 Action 执行或 Suggestion 持久化。

## 12. Final Status

`READY_FOR_INDEPENDENT_REAUDIT`
