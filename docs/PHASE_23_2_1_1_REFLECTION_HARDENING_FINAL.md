# Phase 23.2.1.1 Reflection Hardening Final

Date: 2026-09-17
Baseline: `227665a feat: add AI daily reflection backend capability`
Status: READY

## 1. Implementation Summary

本阶段只处理 Phase 23.2.1 Audit Gate 提出的 Reflection 安全问题，不新增产品功能，不修改前端页面。

主要变更：

- 新增 Reflection Context Sanitizer，只允许 GrowthContext 数据字段进入 Prompt。
- 移除客户端可控制的 `version` / `instruction` / `meta` / `system` / `history` / `performance` 等非数据字段。
- 固定 Reflection Prompt 的 context 与 task version 为 `1.0`，阻断 version 注入。
- 对 task、focus、streak、goal、signal、suggestion 字段做类型、长度、数组数量和数值范围限制。
- 重新计算任务完成率，避免客户端提交自相矛盾的 completion rate。
- Reflection Provider 请求显式设置 `max_tokens: 1200`。
- 本地限制 AI reply 最大 8,000 字符。
- 对 AI 输出的 `summary` / `insights` / `suggestions` 做字段类型、数量和长度限制。
- `POST /api/ai/reflection` 绑定 `req.userId`，并在响应 meta 中标记 `contextSource`。

## 2. Security Risk Closure

| Audit Finding | Result | Notes |
| --- | --- | --- |
| F-001 Prompt Injection | CLOSED | `buildReflectionPrompt()` 不再使用客户端 version；Reflection task version 固定为 `1.0`。 |
| F-002 Context Ownership | PARTIALLY CLOSED | API 绑定认证用户并标记 `authenticated-client-submitted`；因后端尚未实现 Analytics 的服务端重建，行为数据仍来自客户端提交的 GrowthContext。 |
| F-003 Output Token Limit | CLOSED | Provider 请求包含 `max_tokens: 1200`；服务层另有 8,000 字符 reply 上限和字段长度限制。 |
| F-004 Field Allowlist | CLOSED | Prompt 前只保留白名单内的 GrowthContext 数据字段。 |
| F-006 Security Regression Tests | CLOSED | 新增 Reflection 安全回归测试覆盖 allowlist、prompt injection、fake performance、output limit、owner marker。 |

## 3. Modified Files

| 文件 | 说明 |
| --- | --- |
| `backend/src/services/reflectionContext.js` | 新增 Reflection Context Sanitizer 和固定 context version |
| `backend/src/services/aiService.js` | 接入 sanitizer、输出限制、owner/source 处理 |
| `backend/src/services/promptBuilder.js` | 固定 Reflection task/context version，阻断 version 注入 |
| `backend/src/services/providers/openaiCompatible.js` | 支持 optional `maxTokens` 并转换为 Provider `max_tokens` |
| `backend/src/routes/ai.js` | 传递 `req.userId`，返回 `contextSource` |
| `backend/test/aiReflectionSecurity.test.js` | 新增安全回归测试 |
| `docs/PHASE_23_2_1_1_REFLECTION_HARDENING_FINAL.md` | 本报告 |

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

## 4. Data Flow

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

## 5. Tests

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

## 6. Remaining Risks

### R-001: Client-submitted GrowthContext

当前后端还没有可在 Node 环境直接复用的 Analytics / GoalEngine 执行层，无法在不复制统计逻辑的情况下完全从服务端原始数据重建 GrowthContext。

因此 Reflection 的行为统计仍来自认证用户提交的 GrowthContext。API 现在通过 `req.userId` 绑定请求归属，并使用 `contextSource: authenticated-client-submitted` 明确暴露信任边界。

后续如需完全关闭，应新增服务端 Canonical GrowthContext Builder，复用或编译 Analytics / GoalEngine，而不是在路由里重复统计。

### R-002: Prompt injection cannot be fully eliminated by schema alone

Sanitizer、固定 version、System Prompt 优先级和输出 normalization 已降低风险，但 LLM 仍可能受到 context 中自然语言的影响。前端展示时必须继续区分：

- `performance`：后端数字事实
- `summary` / `insights` / `suggestions`：AI 解释和建议

## 7. Final Status

READY
