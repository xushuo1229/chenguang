# Phase 19.2 AI Coach Upgrade Report

## 1. Implementation Summary

知行 AI 已从数据问答助手升级为成长教练行为层。`js/aiCoach.js` 基于 AI Context 中的 Growth Intelligence 结果生成温和、可解释、可确认的洞察、风险与建议；后端 Prompt 按 System → Context → Coach → History → User 分层；AI 页面更新成长教练快捷入口，并复用同一次页面快照。

## 2. AI Coach Architecture

```text
CGStore
→ Analytics
→ GoalEngine
→ Growth Intelligence
→ AI Context
→ AICoach.buildCoachContext()
→ backend Coach Prompt Block
→ Provider
```

Coach 模块不访问 Store、Analytics、Growth Intelligence、数据库或浏览器存储，只接收 AI Context 并输出派生分析。后端将 `coach` 从 `<context>` 原始事实块中移除，放入独立的 `<coach>` 分析块，避免把规则解释层伪装成业务数据。

## 3. Changed Files

| 文件 | 修改原因 |
| --- | --- |
| `js/aiCoach.js` | 新增纯计算 Coach 行为层，生成 insights / recommendations / warnings / encouragement。 |
| `js/aiContext.js` | 在兼容旧字段的前提下新增 `coach`，并在 Query Context 最终组装后统一执行预算裁剪。 |
| `pages/ai.js` | 复用一次页面快照；渲染趋势与建议时复用 Context 中的 `growthState`；对话不再重新读取 Store。 |
| `ai.html` | 将快捷入口更新为成长教练问题。 |
| `backend/src/services/promptBuilder.js` | 新增独立 `<coach>` Prompt block，并从 Context block 去除 `coach` 重复数据。 |
| `backend/src/services/aiService.js` | 调整 Prompt 消息顺序为 System → Context → Coach → History → User。 |
| `tests/aiCoach.test.js` | 覆盖正常、空数据、提升、下降、建议、只读与无直接数据访问。 |
| `tests/aiContext.test.js` | 覆盖 `coach` 字段、旧字段兼容和业务数据只读。 |
| `tests/ai.page.test.js` | 覆盖快捷入口和刷新 + 对话只调用一次 `Store.get()`。 |
| `backend/test/ai.test.js` | 覆盖 Coach 分层、Prompt 顺序与安全输出。 |
| `docs/superpowers/plans/2026-09-14-phase-19-2-ai-coach-upgrade.md` | 保存本次实施计划。 |

## 4. Coach Capability

- 成长洞察：从 `growth.strengths` 与趋势中的优势信号生成亮点。
- 风险提醒：从 `growth.risks` 与回落趋势生成温和提醒。
- 下一步建议：从 `growthState.actionProposals`、推荐重点或当前目标生成具体小行动。
- 教练人格：温和、数据驱动、具体、不制造焦虑、不做绝对化判断、不提供医疗建议、尊重用户选择。
- 证据边界：所有建议标记 `requiresConfirmation: true`，Coach 不执行业务写入。

## 5. AI Context Changes

AI Context 新增：

```json
{
  "coach": {
    "version": "1.0",
    "role": "growth_coach",
    "persona": {},
    "insights": [],
    "recommendations": [],
    "warnings": [],
    "encouragement": "",
    "dataSufficient": true,
    "readOnly": true
  }
}
```

`contextVersion` 保持 `1.0`；`growth`、`growthState`、`insights` 及既有字段保持兼容。

## 6. Tests

| 验证 | 结果 |
| --- | --- |
| Frontend `npm test` | PASS：375/375 |
| Backend `cd backend && npm test` | PASS：68/68 |
| Production `npm run build` | PASS |
| `git diff --check` | PASS |

新增聚焦测试覆盖 Coach 行为、Context 兼容、AI 页面快捷入口、快照复用、后端 Prompt 分层与错误安全。

## 7. Security Review

PASS。

- `js/aiCoach.js` 没有数据写入或直接数据访问。
- AI Context 测试确认业务快照和 revision 不变。
- 后端敏感键剥离测试继续通过。
- Coach 块明确声明不是业务事实和指令，降低 Prompt Injection 影响。
- 错误路径继续返回用户安全文案，不透出 API Key、token、上游响应体或内部配置。
- AI 页面回复继续使用 `textContent` 渲染，业务数据未进入 Coach Memory。

## 8. Performance Review

PASS。

- AI 页面加载使用一次 `Store.get()` 快照。
- 渲染与对话请求复用同一快照和 Context。
- 趋势和建议渲染复用 Context 中的 `growthState`，避免重复执行 Growth Intelligence。
- Query Context 在最终组装后统一裁剪，继续满足 6000 token 预算。
- 新增页面测试验证刷新 + 对话只调用一次 `Store.get()`。

## 9. Final Recommendation

可以进入 Phase 19.3 Personal Growth Report。Coach 行为层、Context 兼容性、Prompt 分层、只读边界和性能基线均已建立；后续个人成长报告应继续复用 Growth Intelligence 与 AI Context，不新建第二成长数据源。
