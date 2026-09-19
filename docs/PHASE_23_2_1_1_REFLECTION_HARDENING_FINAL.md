# 阶段 23.2.1.1 反射硬化最终

日期：2026-09-17
基线：`227665a feat: add AI daily reflection backend capability`
状态：准备就绪

# 1. 实施总结

This phase only addresses the Reflection security issues raised by Phase 23.2.1 Audit Gate, without adding new product features or modifying the frontend pages.

主要变更：

- Added Reflection Context Sanitizer, only allowing GrowthContext data fields to enter the Prompt.
- Removed client-controllable non-data fields such as `version` / `instruction` / `meta` / `system` / `history` / `performance`.
- Fixed Reflection Prompt's context and task version to `1.0`, blocking version injection.
- Applied type, length, array count, and value range restrictions to task, focus, streak, goal, signal, and suggestion fields.
- Recalculated task completion rate to prevent clients from submitting contradictory completion rates.
- Reflection Provider requests must explicitly set `max_tokens: 1200`.
- Locally limit AI reply to a maximum of 8,000 characters.
- Apply type, count, and length restrictions to AI output fields `summary` / `insights` / `suggestions`.
- `POST /api/ai/reflection` is bound to `req.userId`, and `contextSource` is marked in the response meta.

# 2. 安全风险关闭

|审计发现 |结果 |注释 |
| --- | --- | --- |
|F-001 提示注入 |关闭 |`buildReflectionPrompt()` 不再使用客户端 version;Reflection task version 固定为 `1.0`。 |
|F-002 Context Ownership |部分关闭 |API 绑定认证用户并标记 `authenticated-client-submitted`;因后端尚未实现 Analytics 的服务端重建，行为数据仍来自客户端提交的 GrowthContext。
|F-003 输出令牌限制 |已关闭 |提供者请求包含 `max_tokens: 1200`;服务层另有 8,000 字符 回复 上限和字段长度限制。
|F-004 现场许可名单 |已关闭 |提示 前只保留白名单内的 GrowthContext 数据字段。
|F-006 安全回归测试 |关闭 |新增 Reflection 安全回归测试覆盖 允许列表、提示注入、假性能、输出限制、owner marker。|

# 3. 已修改的文件

| 文件 | 说明 |
| --- | --- |
| `backend/src/services/reflectionContext.js` | Added Reflection Context Sanitizer and fixed context version |
| `backend/src/services/aiService.js` | Integrated sanitizer, output constraints, owner/source handling |
| `backend/src/services/promptBuilder.js` | Fixed Reflection task/context version to block version injection |
| `backend/src/services/providers/openaiCompatible.js` | Support optional `maxTokens` and convert to Provider `max_tokens` |
| `backend/src/routes/ai.js` | Pass `req.userId` and return `contextSource` |
| `backend/test/aiReflectionSecurity.test.js` | 新增安全回归测试 |
| `docs/PHASE_23_2_1_1_REFLECTION_HARDENING_FINAL.md` | This report |

冻结文件均未修改：

```text
js/store.js
js/analytics.js
js/goals.js
js/sync.js
js/growthContext.js
js/aiContext.js
today.html
pages/today.js
```

# 4. 数据流

```text
Authenticated request + req.userId
      ↓
Client-submitted GrowthContext
      ↓
sanitizeReflectionContext()
      ↓
allowlisted data only
      ↓
buildReflectionPrompt(version=1.0)
      ↓
Provider request(max_tokens=1200)
      ↓
reply size limit + AI output normalization
      ↓
backend-generated performance
      ↓
Reflection response
```

# 5. 测试

```yaml
Reflection Security:
  command: npm test --prefix backend -- test/aiReflectionSecurity.test.js
  result: 5/5 PASS

Existing Reflection:
  command: npm test --prefix backend -- test/aiReflection.test.js
  result: 6/6 PASS

Backend:
  command: npm test
  result: 79/79 PASS

Frontend:
  command: npm test
  result: 565/567 PASS
  known_failures:
    - tests/workbenchDailyFeedback.test.js
    - note: Existing Failure，不属于本 Phase

Build:
  command: npm run build
  result: PASS

git diff --check:
  result: PASS
```

# 6. 剩余风险

## R-001：客户提交的增长背景

当前后端还没有可在 Node 环境直接复用的 Analytics / GoalEngine 执行层，无法在不复制统计逻辑的情况下完全从服务端原始数据重建 GrowthContext。

Therefore, the behavioral statistics of Reflection still come from the GrowthContext submitted by authenticated users. The API now binds request attribution through `req.userId` and explicitly exposes the trust boundary using `contextSource: authenticated-client-submitted`.

If you need to completely shut it down later, you should add a server-side Canonical GrowthContext Builder, reuse or compile Analytics / GoalEngine, instead of repeating statistics in the routing.

## R-002：仅靠模式无法完全消除提示注入

消毒剂、固定版本、系统提示优先级和输出规范化已降低风险，但大型语言模型仍可能受到上下文中自然语言的影响。前端展示时必须继续区分：

- `performance`：后端数字事实
- `summary` / `insights` / `suggestions`：AI 解释和建议

# 7. 最终状态

准备好了
