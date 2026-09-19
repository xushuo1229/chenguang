# 第19.2阶段 AI教练升级报告

# 实施总结

知行 AI 已从数据问答助手升级为成长教练行为层。 `js/aiCoach.js` 基于 AI Context 中的 Growth Intelligence 结果生成温和、可解释、可确认的洞察、风险与建议； 后端 Prompt 按 System → Context → Coach → History → User 分层； AI 页面更新成长教练快捷入口，并复用同一次页面快照。

## 2. AI教练架构

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

Coach模块不访问 商店、分析、增长智只接收能、数据库或浏览器存储， AI上下文并输出派生分析。后端将`coach` 从 `<context>` 原始事实块中移除，放入独立的 `<coach>` 分析块，避免把规则解释层伪装成业务数据。

# 已更改的文件

| 文件 | 修改原因 |
| --- | --- |
| `js/aiCoach.js` |新增纯计算教练行为层，生成见解/建议/警告/鼓励。|
| `js/aiContext.js` | 在兼容旧字段的前提下新增 `coach` ，并在查询上下文最终组装后统一执行预算裁剪。|
| `pages/ai.js` | 复用一次页面快照；渲染趋势与建议时复用上下文中的`growthState` ；对话不再重新读取商店。|
| `ai.html` | 将快捷入口更新为成长教练问题。 |
|`backend/src/services/promptBuilder.js` |新增独立 `<coach>`提示块，并从上下文块去除`coach` 重复数据。
| `backend/src/services/aiService.js` |调整提示消息顺序为系统→上下文→教练→历史记录→用户。|
| `tests/aiCoach.test.js` | 覆盖正常、空数据、提升、下降、建议、只读与无直接数据访问。 |
| `tests/aiContext.test.js` | 覆盖 `coach` 字段、旧字段兼容和业务数据只读。 |
| `tests/ai.page.test.js` | 覆盖快捷入口和刷新 + 对话只调用一次 `Store.get()`。 |
| `backend/test/ai.test.js` |覆盖教练分层、提示顺序与安全输出。|
| `docs/superpowers/plans/2026-09-14-phase-19-2-ai-coach-upgrade.md` | 保存本次实施计划。 |

## 4.培训讲师能力

- 成长洞察：从 `growth.strengths` 与趋势中的优势信号生成亮点。
- 风险提醒：从 `growth.risks` 与回落趋势生成温和提醒。
- 下一步建议：从 `growthState.actionProposals`、推荐重点或当前目标生成具体小行动。
- 教练人格：温和、数据驱动、具体、不制造焦虑、不做绝对化判断、不提供医疗建议、尊重用户选择。
- 证据边界：所有建议标记 `requiresConfirmation: true`，Coach 不执行业务写入。

## 5.人工智能环境变化

人工智能背景新增：

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

`contextVersion` 保持 `1.0` ； `growth`、 `growthState`、 `insights` 及既有字段保持兼容。

## 6.测试

| 验证 | 结果 |
| --- | --- |
|前端`npm test` |通行证： 375/375 |
|后端`cd backend && npm test` |通行证： 68/68 |
|生产`npm run build` |通行证|
| `git diff --check` | 通过 |

新增聚焦测试覆盖 辅导者行为、上下文兼容、AI页面快捷入口、快照复用、后端提示 分层与错误安全。

## 7.安全审查

通过

- `js/aiCoach.js` 没有数据写入或直接数据访问。
- AI上下文测试确认业务快照和修订 不变。
- 后端敏感键剥离测试继续通过。
- -教练块明确声明不是业务事实和指令，降低提示注射 影响。
- 错误路径继续返回用户安全文案，不透出 API Key、token、上游响应体或内部配置。
- AI 页面回复继续使用 `textContent` 渲染，业务数据未进入教练记忆。

# 績效評估

通过

- AI 页面加载使用一次 `Store.get()` 快照。
- 渲染与对话请求复用同一快照和 Context。
- 趋势和建议渲染复用 Context 中的 `growthState` ，避免重复执行成长智能。
- -查询上下文在最终组装后统一裁剪，继续满足 6000令牌 预算。
- 新增页面测试验证刷新 + 对话只调用一次 `Store.get()`。

# 最后建议

You can enter Phase 19.3 Personal Growth Report. Coach behavior layer, Context compatibility, Prompt layering, read-only boundaries, and performance baseline have all been established; subsequent personal growth reports should continue to reuse Growth Intelligence and AI Context, and should not create a second growth data source.
