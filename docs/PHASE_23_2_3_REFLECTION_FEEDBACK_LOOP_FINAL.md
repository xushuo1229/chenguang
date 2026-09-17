# Phase 23.2.3 Reflection Feedback Loop Final

## 1. Goals

- 为 AI Daily Reflection 增加最小可用的二值反馈闭环。
- 保持 Reflection 数据只读架构，不引入 AI 写操作。
- 只保存反馈归属与评价，不保存 Reflection 内容或用户行为快照。
- 保持前端 API 调用与 UI 渲染分离。

## 2. Files Changed

| File | Change |
| --- | --- |
| `backend/schema.sql` | Add `ai_reflections` and `ai_reflection_feedback` tables. |
| `backend/src/db/aiReflectionModel.js` | Add ownership and feedback persistence queries. |
| `backend/src/services/aiReflectionFeedbackService.js` | Add reflection ID creation and feedback validation. |
| `backend/src/routes/ai.js` | Return `reflectionId` and add `POST /api/ai/reflection/feedback`. |
| `backend/test/aiReflectionFeedback.test.js` | Cover ownership, validation, auth, and feedback API cases. |
| `js/apiClient.js` | Add the shared `ai.reflectionFeedback` client method. |
| `js/aiReflectionService.js` | Normalize the additive `reflectionId` response field. |
| `js/aiReflectionFeedbackService.js` | Add the frontend feedback service layer. |
| `js/aiReflectionUI.js` | Add feedback controls and idle/loading/success/error states. |
| `tests/aiReflectionFeedback.test.js` | Cover service validation and feedback UI behavior. |

Frozen files were not modified. No existing Reflection API response field was removed.

## 3. API Design

### Generation Response

The existing response remains compatible:

```json
{
  "data": {
    "reflection": {},
    "reflectionId": "rf_uuid"
  },
  "meta": {}
}
```

`reflectionId` is additive and generated only after an authenticated Reflection request succeeds at the route layer.

### Feedback Request

```http
POST /api/ai/reflection/feedback
Authorization: Bearer <JWT>
X-Requested-With: XMLHttpRequest

{
  "reflectionId": "rf_uuid",
  "rating": "helpful"
}
```

Allowed ratings are `helpful` and `not_helpful`. Success returns `{ "success": true }`. Invalid rating or ID returns `400`; missing auth returns `401`; another user's Reflection returns `403 REFLECTION_FORBIDDEN`.

## 4. Data Model

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

The model intentionally does not store Reflection full text, GrowthContext snapshots, behavior data, or free-form comments.

## 5. Frontend Changes

- `createAiReflectionUI` accepts an injectable `feedbackService`.
- Feedback controls are hidden until successful Reflection content has a valid `reflectionId`.
- The UI supports idle, loading, success, error, and empty Reflection states.
- Feedback failures display only `反馈提交失败，请稍后再试`.
- No provider error, stack trace, or internal API detail is rendered.

## 6. Security Review

- Feedback requires JWT authentication.
- `req.userId` is the only ownership source used by the backend.
- Reflection IDs are format-checked and lowercased before lookup.
- Client cannot submit behavior statistics or alter a user-owned rating payload.
- Duplicate feedback is idempotent for the same user and Reflection ID.
- The response contains no internal storage or provider implementation details.

## 7. Tests

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

The two frontend failures are pre-existing and isolated to `tests/workbenchDailyFeedback.test.js`. No new regression was introduced.

## 8. Known Limitations

- Analytics events are Future Integration. `reflection_viewed`, `reflection_feedback_helpful`, and `reflection_feedback_not_helpful` were not implemented because no existing Analytics event infrastructure was found.
- Reflection content is not persisted, so historical feedback cannot be joined to its original text.
- Feedback is binary only; comments and structured feedback are out of scope.
- AI Memory, Agent execution, auto-planning, and automatic prompt optimization remain out of scope.
