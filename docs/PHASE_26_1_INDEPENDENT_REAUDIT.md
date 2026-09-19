# Phase 26.1 Student Knowledge State Foundation Independent Re-Audit

## Audit Result

`READY_TO_FREEZE`

本次复审基于 commit `c6fd61d feat: add student knowledge state foundation`。未发现 Critical 或 High 问题；以下 Low 级发现不阻塞 Phase 26.1 冻结。

## Scope

复审覆盖：

- `backend/schema.sql`
- `backend/src/db/studentKnowledgeStateModel.js`
- `backend/src/services/studentKnowledgeStateService.js`
- `backend/src/routes/knowledgeState.js`
- `backend/src/routes/index.js`
- `backend/test/studentKnowledgeState.test.js`
- `js/apiClient.js`
- `js/courseSpaceService.js`
- `js/courseSpaceUI.js`
- `tests/courseSpaceUI.test.js`
- `docs/PHASE_26_1_STUDENT_KNOWLEDGE_STATE_FOUNDATION_FINAL.md`

commit 范围只包含上述 11 个文件，没有混入无关生产代码。

## Architecture Review

PASS。

- Student Knowledge State 是 Course Knowledge 之上的独立 additive projection layer。
- Course Space 仍然是课程、文档、知识节点、关系和 Evidence 的 Source of Truth。
- 没有 Agent、Planner、Tutor、Autonomous Action、RAG、向量数据库或 LLM Mastery 写入路径。
- `recordEvidence` 是服务层入口，当前没有公开 HTTP 写入端点；唯一新增 API 是只读 GET。
- 前端只增加 Course Space 的 Knowledge State Preview，没有编辑、AI 聊天或自动规划入口。

## Data Integrity Review

PASS。

`backend/schema.sql:150-181` 定义了：

- `student_knowledge_states.user_id` 引用 `users(id)`。
- `student_knowledge_states.knowledge_node_id` 引用 `course_space_nodes(id)`。
- `student_knowledge_evidence.user_id` 引用 `users(id)`。
- `student_knowledge_evidence.knowledge_state_id` 引用 `student_knowledge_states(id)`。
- `(user_id, course_id, knowledge_node_id)` 唯一索引。
- owner/course 与 owner/state 有界索引。

`backend/src/db/studentKnowledgeStateModel.js:49-72` 使用事务同时写入 Evidence 和更新 Knowledge State，避免部分写入。`backend/src/services/studentKnowledgeStateService.js:145-171` 先聚合全部历史 Evidence，再在事务中更新状态。

## Mastery Boundary Review

PASS。

- `backend/src/services/studentKnowledgeStateService.js:9-12` 只允许 `learning_activity`、`assessment`、`review`、`reflection`、`manual_feedback`。
- `ai_inference` 不是合法 source type，测试也验证其被拒绝。
- `backend/src/services/studentKnowledgeStateService.js:67-96` 通过确定性权重、数值边界和状态阈值计算 Mastery、Confidence 和 State。
- 客户端无法通过 API 提交 Mastery、Confidence 或 State。
- 没有调用 AI Provider 或 LLM。

## Security Review

PASS。

- `backend/src/routes/knowledgeState.js:9-20` 要求 `authRequired`。
- API 从 `req.userId` 取得用户身份，不信任客户端传入的用户标识。
- `backend/src/services/studentKnowledgeStateService.js:114-122` 校验课程属于当前用户。
- `backend/src/services/studentKnowledgeStateService.js:124-171` 校验 Knowledge Node 属于当前用户和当前课程。
- `backend/src/db/studentKnowledgeStateModel.js:5-47` 的状态、证据查询均携带 `user_id` 条件。
- 测试覆盖了 User A 不能读写 User B 的课程节点状态，且 foreign list 为空。

## API Review

PASS。

- 新增端点：`GET /api/knowledge-state/course/:courseId?limit=&offset=`。
- 需要 JWT 认证。
- `limit` 默认 `20`，最大 `50`；`offset` 必须是非负整数。
- 服务端先校验课程归属，再执行有界查询。
- 响应只返回状态投影和 evidence count，不返回 Evidence payload，响应规模受 `limit` 约束。
- 未认证请求测试返回 401，`limit=51` 返回 400。

## Regression Review

PASS。

`git diff 235e247..c6fd61d -- js/store.js js/analytics.js js/goals.js js/sync.js js/growthContext.js js/aiContext.js today.html pages/today.js` 无输出。

以下冻结模块未被 Phase 26.1 修改：

- CGStore
- Analytics
- Goals
- Sync
- Reflection
- GrowthMemory
- CoachMemory
- MPA Shell / Today Plan
- Course Space 既有 schema

## Test Verification

| 验证 | 结果 |
| --- | --- |
| Backend tests | `100/100 PASS` |
| Frontend tests | `590/590 PASS` |
| Build | `PASS` |
| `git diff --check` | `PASS` |

新增后端测试覆盖 schema、唯一约束、外键、用户隔离、Mastery/Confidence 校验、认证和分页边界。前端测试覆盖 API service、渲染、空状态和友好错误状态。

## Findings

### F-001: Course ownership check loads the full sync envelope

Severity: Low

Evidence: `backend/src/services/studentKnowledgeStateService.js:114-122`

Recommendation: 后续 Phase 可将课程归属校验收敛为更轻量的 bounded course index/projection。当前 Foundation 阶段不阻塞。

### F-002: Database CHECK constraints are not used

Severity: Low

Evidence: `backend/schema.sql:150-172`

Recommendation: 后续 additive migration 可为 `mastery_level`、`confidence`、`state` 和 `source_type` 增加 SQLite CHECK 约束。当前服务层已经完成等效校验，且没有公开写 API。

### F-003: Offset has no practical upper bound

Severity: Low

Evidence: `backend/src/services/studentKnowledgeStateService.js:43-52`

Recommendation: 后续如暴露更大范围列表，可为 offset 增加上限或改为 cursor pagination。当前 limit 已有界，响应规模受控。

## Final Recommendation

Phase 26.1 可以冻结。上述 Low 级发现应留给后续 hardening 或 Phase 26.2+ 处理，不应在本阶段继续修改。
