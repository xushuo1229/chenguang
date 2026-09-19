# 第23.0阶段 架构审计
# AI教练增长循环 —— 实施前架构审计

日期：2026-09-17
基线：`863e163 feat: add dedicated today plan workspace`
状态：只读审计

- --

# 1. 当前架构

## 1.1 模块清单

```
Frontend (browser)
├── js/aiContext.js         — AI Context Builder (结构化上下文，版本化 JSON)
├── js/aiDataRetrieval.js   — 用户问题意图识别 → 计划 Tool 检索
├── js/aiToolRunner.js      — 受控 Tool 执行引擎（只读，限调用数）
├── js/aiCoach.js           — Coach Context 派生层（把 GrowthState → 教练叙述）
├── js/aiActions.js         — AI 建议行动映射（navigate only）
├── js/growthIntelligence.js — Growth State 计算（10 域状态 + 趋势 + 风险）
├── js/growthMemory.js      — Coach Memory（候选→确认生命周期）
├── js/growthSignals.js     — 信号归一化（trends/risks/strengths → 统一格式）
├── js/dailyFeedback.js     — 每日反馈构建（今日摘要/亮点/变化/下一步）
├── js/habitFormation.js    — 习惯形成度评估
├── js/growthTimeline.js    — 时间线构建
├── js/retentionContext.js  — 留存上下文（欢迎回来/连续提醒）
├── js/growthReport.js      — 周报/月报构建
├── js/analytics.js         — 唯一统计事实来源
├── js/goals.js             — Goal Engine（目标进度/分类/状态）
├── js/store.js             — CGStore（数据持久化 + 同步）
└── pages/ai.js             — AI 页面 UI（聊天、建议卡片、快捷操作）

Backend (Node.js + Express)
├── routes/ai.js            — POST /api/ai/chat（authRequired + 15/min rate limit）
├── controllers/aiController.js — 提取参数 → aiService.coachChat()
├── services/aiService.js   — 校验 → promptBuilder → provider → actions 派生
├── services/promptBuilder.js   — System Prompt（教练人设+安全边界+只读铁律）
└── services/providers/openaiCompatible.js — OpenAI 兼容 Provider Adapter
```

## 1.2 当前数据流

```
用户输入 (pages/ai.js)
    ↓ message + history + context
Frontend (js/aiContext.js)
    ↓ buildQueryContext(data, message)
    ↓ CGAnalytics 7d/30d 聚合 + GoalEngine + GrowthIntelligence
    ↓ GrowthMemory + DailyFeedback + RetentionContext
    ↓ AI Tool Runner（受控只读检索）
    ↓ trimContextToBudget (6000 tokens)
API Client (js/apiClient.js)
    ↓ POST /api/ai/chat
Backend (routes/ai.js → controllers/aiController.js)
    ↓ { message, history, context, contextVersion }
AI Service (services/aiService.js)
    ↓ validateHistory + sanitizeContext
    ↓ promptBuilder.buildSystemPrompt() + buildContextBlock()
    ↓ provider.chat(messages)
OpenAI Compatible Provider
    ↓ model response
Response
    ↓ { reply, mode:'coach', suggestions, actions, model }
Frontend (pages/ai.js)
    ↓ 渲染回复 + 建议卡片 + 行动按钮
```

- --

# 2. AI 数据流

## 2.1 AI请求入口点

- **前端**：`pages/ai.js` → `CGAPI.ai.chat({ message, history, context, contextVersion })`
- **API 路由**：`POST /api/ai/chat`（`backend/src/routes/ai.js`）
- **认证**：`authRequired`（JWT）  `aiLimiter`（15/分钟）

## 2.2 上下文生成

`js/aiContext.js` 的 `buildContext(data, opts)` 生成版本化 `v1.0` 结构化 JSON：

| 字段 | 数据来源 | 说明 |
|------|---------|------|
| `overview` | Analytics 7天聚合 | activeDays, completionRate, currentStreak, longestStreak, totalFocusMinutes, studyMinutes |
| `trends` | Analytics 环比 | 7天/30天 各指标 当前 vs 上一周期 |
| `daily` | Analytics today 聚合 | 今日 活动/学习分钟数/专注分钟数/锻炼分钟数/已完成待办事项数/待办事项总数 |
| `study` | 分析 | 分钟数/趋势/活跃天数/课程数/平均进度 |
| `exercise` | 分析 | 分钟/天数/卡路里/趋势/类型分布 |
| `english` | 分析 | 分钟/单词数/活跃天数/趋势 |
| `focus` | 分析 | 分钟/活跃天数/日均/趋势 |
| `todos` | Analytics   Store | 总/完成/完成率/逾期/优先级分布（原文仅在显式开启时传入≤10 条） |
| `courses` | Store（通过 pickCourses 筛选） | 最多 20 门，按风险/进度排序 |
| `goals` | GoalEngine | 活跃(≤10)/已完成(≤5)/已过期(≤5)，含进度/状态/剩余时间 |
| `growth.score` | GrowthIntelligence | 综合成长分数 |
| `growth.trends` | GrowthIntelligence | 7天/30天/90天 域级趋势 |
| `growth.risks` | GrowthIntelligence | 风险信号 |
|[[代码0]] |成长智能 |正向信号 |
| `growthState` | GrowthIntelligence 完整状态 | 10 域状态   推荐关注   行动提案   数据充分性 |
| `dailyFeedback` | dailyFeedback.js | 今日摘要/亮点/变化/下一步 |
| `memory` | growthMemory.js | 已确认的候选者 |
| `retention` | retentionContext.js | Welcome back / Consecutive reminders |
| `insights` | aiContext.js 确定性规则 | 目标风险/趋势下滑/强习惯/机会/异常 |

## 2.3 提示组织

* *Backend** (`promptBuilder.js`) Assembly:
1. `buildSystemPrompt()` — 教练人设 + 事实边界 + 注入防护 + 只读铁律 + 回复格式
2. `buildContextBlock(context, version)` — `<context>` 边界包裹结构化数据
3. `messages = [system, ...history, user]` → 提供者

## 2.4 数据注入点

Data is injected at the **frontend**: `js/aiContext.js` constructs the complete Context JSON and passes it to the backend through the `context` field of `POST /api/ai/chat`. The backend only performs validation and secure extraction, without adding any data.

## 2.5 响应流程

```
Provider → aiService（actions 派生，仅 navigate）→ controller → res.success(result) → 前端渲染
```

Response 包含：`reply`（文本）、`suggestions`（快捷追问）、`actions`（navigate 按钮列表）、`model`（模型名）。

- --

# 3. 分析能力

## 3.1 可用指标

| 数据域 | 指标 | 分析 API | 是否使用 AI |
|--------|------|--------------|------------|
| **打卡** | 累计打卡天数 | getStreaks() | ✅ overview.currentStreak |
| **Todos** | 总数/完成/完成率/逾期 | getTodoSummary() | ✅ overview.completionRate, todos.* |
| **专注** | 分钟数/次数/活跃天 | getFocusSummary() | ✅ focus.minutes, overview.totalFocusMinutes |
| **学习** | 学习分钟/课程进度 | getStudySummary(), getCourseSummary() | ✅ study.* |
| **英文** | 分钟/单词数 | getStudySummary() | ✅ english.* |
| **锻炼** | 分钟/次数/卡路里/类型 | getExerciseSummary() | ✅ exercise.* |
| **阅读量** | 页数/分钟/本数 | getDateRangeSummary() | ⚠️ 仅通过 day7 间接可用 |
| **课程** | 数量/平均进度/风险 | getCourseSummary() | ✅ courses[], study.courseCount |
| **目标** | 进度/状态/剩余时间 | GoalEngine.computeGoalsProgress() | ✅ goals.active/completed/expired |
|**趋势** |7d/30d 环比 |getTrend（）， buildTrend（） |✅ trends.days7/days30 |
| **连续记录** | 当前/最长连续 | getStreaks() | ✅ overview.currentStreak |
| **活动** | 活跃天数 | getDateRangeSummary() | ✅ overview.activeDays |

## 3.2 衍生智能（超越原始分析）

| 层 | 文件 | 能力 |
|----|------|------|
| 成长智能 | `growthIntelligence.js` | 10 个领域状态（学习/执行/专注/英语/阅读/锻炼/课程/目标/工作量/持续性）  成长分数   风险信号   行动建议 |
| 教练记忆 | `growthMemory.js` | 候选→确认生命周期（待定→已确认→老化→过期）|
| 每日反馈 | `dailyFeedback.js` | 今日摘要/亮点/变化/下一步 |
| 习惯养成 | `habitFormation.js` | 习惯形成度/阶段评估 |
| 成长时间线 | `growthTimeline.js` | 时间线事件 |
| 留存上下文 | `retentionContext.js` | 欢迎回来/连续提醒/留存候选 |
| 成长报告 | `growthReport.js` | 周报/月报 |

## 3.3 尚未提供给人工智能

| 数据 | 说明 |
|------|------|
| 今日任务原文 | 默认不传（仅 `includeTodoText` 显式开启，≤10 条） |
| 用户笔记/反思全文 | 不在上下文中 |
| 课程章节明细 | 仅传名称+进度，不传章节列表 |
| 阅读书目详情 | 仅传页数/分钟，不传书名 |
| 历史 AI 对话摘要 | 仅传最近 history（无长期对话摘要） |

- --

# 4. 今日计划整合

## 4.1 数据流

```
CGStore.chenguangData.todos[]
    ↓ Store.getTodosByDate(todayStr())
today.html / pages/today.js
```

## 4.2 人工智能可视化

`js/aiContext.js` 通过 `Analytics.getTodoSummary(today, today, snap)` 获取今日待办事项统计：

```json
{
  "daily": {
    "todosCompleted": 3,
    "todosTotal": 8
  },
  "todos": {
    "total": 8,
    "completed": 3,
    "completionRate": 37.5,
    "overdueOrIncomplete": 5,
    "priorityDistribution": { "normal": 6, "high": 2 }
  }
}
```

## 4.3 当前空白

| 项目 | 状态 |
|------|------|
| 今日任务总数/完成/率 | ✅ 已提供 |
| 今日任务原文 | ⚠️ 仅 `includeTodoText` 显式开启 |
| 今日任务时间（time 字段） | ❌ 未提供（Analytics 不解析 time） |
| 未完成任务优先级排序 | ❌ 未提供（仅有 priorityDistribution 汇总） |
| 延迟任务（昨日未完成） | ❌ 未提供 |
| 今日计划页面操作事件 | ❌ 未接入（切换/添加/编辑/删除 不触发 AI 更新） |

- --

# 5. 目标整合

## 5.1 当前数据流

```
CGStore.chenguangData.goals[]
    ↓ GoalEngine.computeGoalsProgress(goals, data, { today })
    ↓ classifyGoals → { active, completed, expired }
    ↓ aiContext.buildContext() → ctx.goals
```

## 5.2 人工智能可见性

AI Context 中每个目标包含：

```json
{
  "title": "学习 JavaScript",
  "type": "study",
  "period": "monthly",
  "target": 100,
  "current": 45,
  "progress": 45,
  "status": "active",
  "daysLeft": 14,
  "unit": "%"
}
```

## 5.3 评估

| 项目 | 状态 |
|------|------|
| 用户目标列表 | ✅ active ≤10 条 |
| 当前进度 | ✅ progress 百分比 |
| 差距 | ✅ target - current 可推算 |
| 剩余时间 | ✅ daysLeft |
| 目标→行动映射 | ✅ growthState.actionProposals |
| 目标风险（即将到期/进度落后） | ✅ insights 中确定性规则 |

- --

# 6. 架构差距

## 6.1 数据缺口

| 缺口 | 影响 | 严重度 |
|------|------|--------|
| 今日任务原文（未完成） | AI 无法给出具体"接下来做 X"建议 | MEDIUM |
| 任务时间（time 字段） | AI 无法做时间线规划建议 | 低 |
| 昨日未完成任务列表 | AI 无法提醒"昨天未完成的事" | MEDIUM |
| 用户笔记/反思 | AI 无法回顾用户手动记录 | LOW |
| 长期对话摘要 | 多轮会话后 AI 遗忘早期讨论 | MEDIUM |

## 6.2 架构差距

| 缺口 | 说明 | 严重度 |
|------|------|--------|
| **成长上下文层** | 缺少一个统一“今天我该怎么过”的上下文构建层，将 dailyFeedback、todayPlan、goals、streaks 汇聚为面向行动的 Context | 高 |
| **行动反馈循环** | AI 建议执行后（如用户去 today.html 完成任务），结果不回流到 AI Context | 高 |
| **教练会话连续性** | coachMemory 依赖 growthMemory，但对话上下文与成长记忆未统一 | 中 |
| **实时数据同步** | today.html 完成任务后 AI 页面如果已打开不会自动刷新 Context | 低 |

## 6.3 产品差距

| 缺口 | 说明 |
|------|------|
| 每日反思 | 缺少每日结束时 AI 主动发起的“今日复盘” |
| AI 建议卡片 | AI 建议缺少“一键执行”（如“添加到今日计划”按钮） |
| 每周回顾 | growthReport.js 已有 buildWeeklyReview 但未在 AI 页面展示 |
| 主动提醒 | AI 不会在关键时机（连续中断/目标到期）主动提醒 |

- --

# 7. 推荐的第23阶段计划

## 最小变动策略

```
Additive First / Minimal Change / Backward Compatible
```

## 23.1 — 增长上下文层

* *目标**: 创建统一"今天"行动上下文

* *新增文件**: `js/growthContext.js`

* *职责**:
- Aggregate dailyFeedback, todayPlan, goals, streaks into an action-oriented Context
- Output `actionContext`: { nextAction, todayPriorities, atRiskGoals, streakStatus }
- Inject into the `ctx.growthContext` field of `aiContext.buildContext()`

* *不负责**: 存储数据 / 修改用户数据 / 同步

* *风险**: LOW — 纯新增，不修改现有模块

* *Involved Documents**: `js/growthContext.js`(新增), `js/aiContext.js`(添加 1 行 import 1 行赋值), `backend/services/aiService.js`(context 校验版本号更新)

- --

## 23.2 — 今日计划 → AI 上下文桥

* *目标**: 让 AI 看到今日具体任务和完成状态

* *修改文件**: `js/aiContext.js`

* *变更**:
- 在 `buildContext()` 中默认包含今日未完成任务（≤5 条，标记 `__untrustedUserContent`）
- 包含昨日未完成任务（≤3 条）
- 利用 `Store.getTodosByDate(date)` `dateOffset(today, -1)`

* *风险**: MEDIUM — 需确认 token 预算不超限；任务原文是用户内容，需要安全标记

- --

## 23.3 — 行动反馈循环

* *目标**: AI 建议 → 用户执行 → 结果回流

* *新增**: `js/aiActionTracker.js`

* *职责**:
- Record the intent when the user navigates from AI suggestions to today.html/goals.html
- 下次 AI 对话时在 Context 中附带"上次建议 + 是否已执行"
- Store in `CGStore._meta.aiActionFeedback` (do not create a new key)

* *风险**: LOW — 纯新增，不影响现有数据

- --

## 23.4 — 每日反思界面

* *目标**: AI 主动发起每日复盘

* *修改文件**: `pages/ai.js`（添加"今日复盘"入口卡片）

* *依赖**: 23.1 的 growthContext

* *风险**: 低 — UI 层变更，不改架构

- --

# 8. 数据流设计（目标状态）

```
CGStore (数据持久化 + 同步)
    |
    ↓ get() snapshot
Analytics (统计计算唯一事实来源)
    |
    ↓ getTodoSummary, getStreaks, getDateRangeSummary...
GrowthIntelligence (域状态/分数/风险/建议)
    |
    ↓ computeGrowthState()
GrowthContext (Phase 23.1 新增：面向行动的今日上下文)
    |
    ↓ actionContext: nextAction, todayPriorities, atRiskGoals
AIContext (结构化 Context + Tool Runner + Memory)
    |
    ↓ buildQueryContext() → POST /api/ai/chat
Backend AI Service (Prompt + Provider)
    |
    ↓ reply + suggestions + actions
User (阅读/执行/反馈)
    |
    ↓ CGStore 写入（用户操作，非 AI 直接写入）
Loop 完成（下次对话时 AI 看到更新后的数据）
```

* *每层职责**:

| 层 | 职责 | 禁止 |
|----|------|------|
| CGStore | Storage/Sync/Events | No Statistics |
| Analytics | Calculated Metrics/Trends/Summaries | No AI Inference |
| GrowthIntelligence | Domain Status/Score/Risk | No Data Writing |
| GrowthContext | Aggregate 'Today' Action Context | No Storage/No Sync |
| AIContext | Assemble Structured Context/Budget Pruning | No Modification of Business Data |
| Backend | Prompt/Security/Rate Limiting/Forwarding | No User Data |
| AI Model | 理解/建议/总结 | 不声称已修改数据 |
| 用户 | 执行/确认/控制 | — |

- --

# 9. 安全边界审计

## 允许（AI 角色）

- ✅ **分析**: 基于真实数据解释趋势/风险/机会
- ✅ **总结**: 生成成长摘要/周报/日反馈
- ✅ **建议**: 给出可执行的下一步（文本形式）

## 禁止（AI 铁律）

- ❌ **自动修改 Todo**：AI 不能直接调用 `Store.addTodo/updateTodo/removeTodo`
- ❌ **自动修改 Goal**：AI 不能直接调用 `Store.addGoal/updateGoal`
- ❌ **自动写入用户数据**: AI 不能绕过用户确认写入任何业务数据

* *原因**:
1. 产品定位：AI 是教练不是自动化工具，用户必须保持控制权
2. 安全：AI 输出不可信（可能被注入），不能直接驱动写操作
3. 现有架构：`aiService.js` 的 `actions` 派生只允许 `{ type: 'navigate' }`，从后端层面阻止写操作
4. System Prompt 明确声明“只读教练”人设 前端 `aiActions.js` 只映射到页面跳转

- --

# 10. 第23阶段开发顺序

| Step | 目标 | 修改范围 | 风险 |
|------|------|---------|------|
| **23.1** | 成长情境层 | `js/growthContext.js`(新增), `js/aiContext.js`(2 行), `backend/aiService.js`(版本号) | 低 |
| **23.2** | 今日计划 → AI 桥 | `js/aiContext.js`(默认包含今日任务) | 中 |
| **23.3** | 行动反馈循环 | `js/aiActionTracker.js`(新增), `js/store.js`(仅 _meta 扩展) | 低 |
| **23.4** | 每日复盘界面 | `pages/ai.js`(复盘入口) | 低 |

- --

# 风险评估

| 风险 | 概率 | 影响 | 缓解 |
|------|------|------|------|
|Context token 超预算 |MEDIUM |AI 回复质量下降 |trimContextToBudget 已有 5 级降级 |
|用户内容注入 |LOW |AI控 |System Prompt 边界声明 __untrustedUserContent 标记 |
|数据泄露（AI 返回敏感信息） |低 |隐私风险 |后端已剥离 apiKey/token 等字段 |
|架构膨胀 |中等 |维护难度增加 |严格 Additive，不重构现有模块 |

- --

# 最终建议

* *审计完成 — 可以进入第 23.1 阶段**

## 推荐第一步

创建 `js/growthContext.js`（Growth Context Layer），将 dailyFeedback、todayPlan、goals 汇聚为面向行动的 Context，注入 `aiContext.buildContext()`。

## 需要修改的文件

| 文件 | 变更类型 |
|------|---------|
| `js/growthContext.js` | Added |
| `js/aiContext.js` | Added import assignment (about 2 lines) |
| `backend/src/services/aiService.js` | Context version check update |
| `tests/growthContext.test.js` | Added test |

## 必须保持冻结的文件

- `js/store.js` — 不修改数据模型
- `js/analytics.js` — 不修改统计口径
- `js/goals.js` — 不修改 Goal Engine
- `js/sync.js` — 不修改同步协议
- `backend/src/controllers/aiController.js` — 不修改 API 契约
- `today.html` / `pages/today.js` — 不修改今日计划功能
