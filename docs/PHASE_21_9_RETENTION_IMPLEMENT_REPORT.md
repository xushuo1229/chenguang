# Phase 21.9 留存闭环激活实施报告

# 摘要

Workbench Growth Brief 新增三个留存触点：

1. **欢迎回来上下文**：当存在昨日记录时，显示“欢迎回来”及昨日关键记录摘要。
2. **连续记录保护提醒**：当存在连续记录且今日未打卡时，显示温和提醒。
3. **候选激活**：显示最多 1 条待处理的记忆候选，支持确认/拒绝。

All content is runtime projection UI rendering, without modifying any persistent data.

# 修改文件

| 文件 | 修改内容 |
|---|---|
| `js/retentionContext.js` | Added pure function modules: buildWelcomeBack / buildStreakReminder / getRetentionCandidate |
| `workbench.html` | Added three UI areas (welcome/streak/candidate) and corresponding CSS |
| `pages/workbench.js` | Imported RetentionContext / GrowthMemory, added renderRetention() and handleRetentionCandidate() |
| `tests/retentionContext.test.js` | 新增 13 条测试覆盖全部 P0 场景 |

# 架构影响

| 系统 | 是否修改 |
|---|---|
| CGStore | ❌ 未修改 |
| 同步 | ❌ 未修改 |
| 后端 | ❌ 未修改 |
| 内存架构 | ❌ 未修改 |
| AI 上下文 | ❌ 未修改 |

数据流：`已有 snapshot → RetentionContext（纯计算）→ Workbench UI（textContent）`

# UX 行为

## P0-1 欢迎回来
- 昨天有记录：展示"欢迎回来"标题 + 昨日关键记录列表（最多 4 条）+ "继续保持今天的成长节奏。"
- 昨天无记录：隐藏整个区域，不显示空洞欢迎语。

## P0-2 连胜提醒
- streak > 0 且 todayDone = false：展示温和提醒，如"你的连续成长记录已经保持 12 天。今天记录一点点，就能继续保持这个节奏。"
- streak = 0 或 todayDone = true：隐藏。

## P0-3 候选人激活
- 待处理候选人存在：展示内容   证据   确认/先不确认按钮。
- 确认：调用 `GrowthMemory.confirmCandidate(Store, id, {today})`，刷新 UI。
- 拒绝：调用 `GrowthMemory.rejectCandidate(Store, id, {today})`，刷新 UI。
- 无候选人：隐藏。

# 测试

| 项目 | 结果 |
|---|---|
| 前端 | 通过 476/476（45 个文件） |
| 后端 | 通过 68/68（20 个套件） |
| 构建 | 通过（vite 构建 977ms） |
| git diff --check | 通过 |

## 新增测试覆盖

- Welcome Back：有昨日数据 / 无昨日数据 / 边界日期 / 记录上限 / 无活动
- Streak：有 streak 今日无记录 / 今日已有记录 / 无 streak / 文案安全
- Candidate：有 candidate / 无 candidate / 非 pending / 空内容
- Security：textContent 渲染验证

# 安全审查

- 所有动态内容通过 `textContent` 或 `document.createElement` 渲染。
- 新增代码无 `innerHTML` 调用。
- 无新增 `localStorage` 读写。
- 无 Store schema / Memory schema / Sync 修改。
- 无用户隐私信息泄露。
- AI 权限保持只读。

# 性能

- RetentionContext 三函数合并基准：`0.2286ms/次`（365 天数据，1000 次迭代）。
- 低于 `<5ms` 目标。
- 不新增 Analytics 或 GrowthIntelligence 调用。
- 不扫描原始历史数据（只使用已有 snapshot 派生）。

# 剩余风险

- “Welcome Back”的“昨日记录”依赖用户在前一天有活动；如果用户隔天使用，可能看不到“Welcome Back”。
- 候选项只展示 1 条；如果有多条待处理，用户需要到“统计”管理其余候选项。
- 连胜提醒只基于打卡记录；如果用户用其他方式记录（专注/运动等），连胜不会增长。
- 无主动回访触发机制（P2 范围：Service Worker 推送）。
