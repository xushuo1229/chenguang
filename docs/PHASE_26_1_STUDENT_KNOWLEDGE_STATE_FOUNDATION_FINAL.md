# Phase 26.1 Student Knowledge State Foundation Final

## 1. Architecture

本阶段以增量方式建立 Student Knowledge State 数据层，Course Space 仍然是课程知识结构的 Source of Truth。本阶段只回答“学生对某个知识节点掌握到什么程度”，不引入 Agent、Planner、Tutor、RAG、向量数据库或 LLM Mastery 推断。

```text
Course Space / Knowledge Node
    ↓
Evidence
    ↓
Deterministic Aggregation
    ↓
Student Knowledge State
    ↓
Read-only Preview API / UI
```

服务层为 `backend/src/services/studentKnowledgeStateService.js`，只做状态查询、确定性更新和 Evidence 聚合，不调用 LLM。

## 2. Data Model

新增两张 additive 表：

| 表 | 职责 |
| --- | --- |
| `student_knowledge_states` | 用户对课程知识节点的掌握投影 |
| `student_knowledge_evidence` | 支撑掌握判断的证据 |

关键字段：

- `mastery_level`：`0-1`，由证据确定性聚合产生。
- `confidence`：`0-1`，表达系统对当前判断的可信程度。
- `state`：只允许 `weak`、`learning`、`mastered`。
- `user_id`：强用户隔离字段。
- `course_id` 与 `knowledge_node_id`：引用现有 Course Space 结构，不修改其 schema。

唯一约束：

- `(user_id, course_id, knowledge_node_id)` 唯一，避免同一用户、同一课程、同一节点出现重复状态。

索引：

- `(user_id, course_id, updated_at DESC)` 支持有界课程状态查询。
- `(user_id, knowledge_state_id, created_at DESC)` 支持有界证据查询。

## 3. API

新增：

```text
GET /api/knowledge-state/course/:courseId?limit=&offset=
```

行为：

- 需要认证。
- 服务端校验课程归属。
- `limit` 默认 `20`，最大 `50`。
- `offset` 必须为非负整数。
- 只读返回当前用户在指定课程下的知识状态，不提供写入 Mastery 的客户端入口。

Evidence 写入只通过后端服务层完成，Mastery 与 Confidence 一律由服务端重新聚合。

## 4. Security

- 所有查询都携带 `user_id` 条件。
- Evidence 查询同时校验 `user_id` 与 `knowledge_state_id`。
- Course 与 Knowledge Node 均校验当前用户归属。
- 客户端无法直接提交 Mastery、Confidence 或 State。
- LLM 推断不是允许的 Evidence source type，Mastery 不接受 AI 直接写入。
- Evidence payload 有最大长度限制。

## 5. Frontend

Course Space 增加只读的 Knowledge State Preview：

- 展示节点标题、Mastery、Confidence、状态和证据数量。
- 支持加载中、空状态和友好错误状态。
- 错误信息不暴露数据库、内部路径或 Provider 细节。
- 不提供编辑、AI 聊天、自动规划或目标调整入口。

## 6. Tests

新增后端测试覆盖：

- schema、唯一约束、索引与外键。
- 用户、课程和知识节点隔离。
- Mastery 与 Confidence 输入校验。
- 认证与分页边界。

新增/扩展前端测试覆盖：

- API service 调用。
- 只读组件渲染。
- 空状态。
- 友好错误状态。

验证结果：

```yaml
Backend: 100/100 PASS
Frontend: 590/590 PASS
Build: PASS
git diff --check: PASS
```

## 7. Limitations

- 当前 Evidence 由服务层显式写入，还没有跨模块自动 Evidence 聚合。
- Mastery 聚合规则是基础确定性框架，不是长期学习分析模型。
- Knowledge State Preview 目前只读，不提供历史对比。
- 本阶段不包含 Learning Context API，也不允许 Agent 消费该层。
