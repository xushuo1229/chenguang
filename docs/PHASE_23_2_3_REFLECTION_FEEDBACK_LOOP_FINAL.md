# 阶段 23.2.3 反思反馈循环最终

# 1. 目标

- Add a minimally viable binary feedback loop for AI Daily Reflection.
- Keep Reflection data in read-only schema, do not introduce AI write operations.
- 只保存反馈归属与评价，不保存 Reflection 内容或用户行为快照。
- 保持前端 API 调用与 UI 渲染分离。

# 2. 已更改的文件

| 文件 | 变更 |
| --- | --- |
| `backend/schema.sql` | 添加 `ai_reflections` 和 `ai_reflection_feedback` 表。 |
| `backend/src/db/aiReflectionModel.js` | 添加所有权和反馈持久化查询。 |
| `backend/src/services/aiReflectionFeedbackService.js` | 添加反思 ID 创建和反馈验证。 |
| `backend/src/routes/ai.js` | 返回 `reflectionId` 并添加 `POST /api/ai/reflection/feedback`。 |
| `backend/test/aiReflectionFeedback.test.js` | 覆盖所有权、验证、认证和反馈 API 用例。 |
| `js/apiClient.js` | 添加共享的 `ai.reflectionFeedback` 客户端方法。 |
| `js/aiReflectionService.js` | 规范化附加的 `reflectionId` 响应字段。 |
| `js/aiReflectionFeedbackService.js` | 添加前端反馈服务层。 |
| `js/aiReflectionUI.js` | 添加反馈控件以及空闲/加载/成功/错误 状态。 |
| `tests/aiReflectionFeedback.test.js` | 覆盖服务验证和反馈 UI 行为。 |

冻结的文件未被修改。未移除现有的 Reflection API 响应字段。

# 3. API设计

## 生成响应

现有的响应保持兼容：

```json
{
  "data": {
    "reflection": {},
    "reflectionId": "rf_uuid"
  },
  "meta": {}
}
```

`reflectionId` 是附加的，并且仅在经过身份验证的 Reflection 请求在路由层成功后生成。

## 反馈请求

```http
POST /api/ai/reflection/feedback
Authorization: Bearer <JWT>
X-Requested-With: XMLHttpRequest

{
  "reflectionId": "rf_uuid",
  "rating": "helpful"
}
```

允许的评分是`helpful`和`not_helpful`。成功返回`{ "success": true }`。无效的评分或ID返回`400`；缺少授权返回`401`；访问他人的反思返回`403 REFLECTION_FORBIDDEN`。

# 4. 数据模型

```sql
ai_reflections (
  reflection_id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL
)

ai_reflection_feedback (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  reflection_id TEXT NOT NULL,
  rating TEXT NOT NULL CHECK (rating IN ('helpful', 'not_helpful')),
  created_at TEXT NOT NULL,
  UNIQUE(user_id, reflection_id)
)
```

该模型有意不存储反思全文、成长环境快照、行为数据或自由形式评论。

# 5. 前端更改

- `createAiReflectionUI` 接受可注入的 `feedbackService`。
- 反馈控件在成功的反思内容具有有效的 `reflectionId` 之前是隐藏的。
- 该用户界面支持空闲、加载、成功、错误和空的反思状态。
- 反馈失败仅显示 `反馈提交失败，请稍后再试`。
- 不呈现提供者错误、堆栈跟踪或内部 API 详细信息。

# 6. 安全审查

- 反馈需要 JWT 认证。
- `req.userId` 是后端使用的唯一所有权来源。
- 反思 ID 在查找之前会进行格式检查并转换为小写。
- 客户端无法提交行为统计或更改用户拥有的评分负载。
- 对相同用户和反思 ID 的重复反馈是幂等的。
- 响应不包含任何内部存储或提供者实现的详细信息。

# 7. 测试

```yaml
Backend:
  command: npm test
  result: 84/84 PASS
Frontend:
  command: npm test
  result: 578/580 PASS
  known_failures:
    - tests/workbenchDailyFeedback.test.js > adding focus updates Daily Feedback without replacing the existing toast copy
    - tests/workbenchDailyFeedback.test.js > Growth Brief shows one bounded current growth stage
Build:
  command: npm run build
  result: PASS
git_diff_check:
  scope: Phase 23.2.3 files
  result: PASS
```

这两个前端故障是预先存在的，仅限于`tests/workbenchDailyFeedback.test.js`。没有引入新的回归。

# 8. 已知的限制

- 分析事件属于未来集成。`reflection_viewed`、`reflection_feedback_helpful` 和 `reflection_feedback_not_helpful` 未被实现，因为没有找到现有的分析事件基础设施。
- 反思内容不会被保存，因此历史反馈无法与其原始文本关联。
- 反馈仅为二进制；评论和结构化反馈不在范围内。
- AI 内存、智能体执行、自动规划和自动提示优化仍不在范围内。
