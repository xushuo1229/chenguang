# Phase 21.9 留存闭环激活实施报告

## 摘要

Workbench Growth Brief 新增三个留存触点：

1. **Welcome Back Context**：有昨日记录时展示"欢迎回来"与昨日关键记录摘要。
2. **Streak Protection Reminder**：存在连续记录且今日未打卡时展示温和提醒。
3. **Candidate Activation**：展示最多 1 条 pending Memory Candidate，支持确认/拒绝。

所有内容均为 runtime projection + UI rendering，不修改任何持久化数据。

## 修改文件

| 文件 | 修改内容 |
|---|---|
| `js/retentionContext.js` | 新增纯函数模块：buildWelcomeBack / buildStreakReminder / getRetentionCandidate |
| `workbench.html` | 新增三个 UI 区域（welcome/streak/candidate）及对应 CSS |
| `pages/workbench.js` | 导入 RetentionContext / GrowthMemory，新增 renderRetention() 和 handleRetentionCandidate() |
| `tests/retentionContext.test.js` | 新增 13 条测试覆盖全部 P0 场景 |

## 架构影响

| 系统 | 是否修改 |
|---|---|
| CGStore | ❌ 未修改 |
| Sync | ❌ 未修改 |
| Backend | ❌ 未修改 |
| Memory schema | ❌ 未修改 |
| AI Context | ❌ 未修改 |

数据流：`已有 snapshot → RetentionContext（纯计算）→ Workbench UI（textContent）`

## UX 行为

### P0-1 Welcome Back
- 昨天有记录：展示"欢迎回来"标题 + 昨日关键记录列表（最多 4 条）+ "继续保持今天的成长节奏。"
- 昨天无记录：隐藏整个区域，不显示空洞欢迎语。

### P0-2 Streak Reminder
- streak > 0 且 todayDone = false：展示温和提醒，如"你的连续成长记录已经保持 12 天。今天记录一点点，就能继续保持这个节奏。"
- streak = 0 或 todayDone = true：隐藏。

### P0-3 Candidate Activation
- pending candidate 存在：展示内容 + evidence + 确认/先不确认按钮。
- 确认：调用 `GrowthMemory.confirmCandidate(Store, id, {today})`，刷新 UI。
- 拒绝：调用 `GrowthMemory.rejectCandidate(Store, id, {today})`，刷新 UI。
- 无 candidate：隐藏。

## 测试

| 项目 | 结果 |
|---|---|
| Frontend | PASS 476/476（45 files） |
| Backend | PASS 68/68（20 suites） |
| Build | PASS（vite build 977ms） |
| git diff --check | PASS |

### 新增测试覆盖

- Welcome Back：有昨日数据 / 无昨日数据 / 边界日期 / 记录上限 / 无活动
- Streak：有 streak + 今日无记录 / 今日已有记录 / 无 streak / 文案安全
- Candidate：有 candidate / 无 candidate / 非 pending / 空内容
- Security：textContent 渲染验证

## 安全审查

- 所有动态内容通过 `textContent` 或 `document.createElement` 渲染。
- 新增代码无 `innerHTML` 调用。
- 无新增 `localStorage` 读写。
- 无 Store schema / Memory schema / Sync 修改。
- 无用户隐私信息泄露。
- AI 权限保持只读。

## 性能

- RetentionContext 三函数合并基准：`0.2286ms/次`（365 天数据，1000 次迭代）。
- 低于 `<5ms` 目标。
- 不新增 Analytics 或 GrowthIntelligence 调用。
- 不扫描原始历史数据（只使用已有 snapshot 派生）。

## 剩余风险

- Welcome Back 的"昨日记录"依赖用户在前一天有活动；如果用户隔天使用，可能看不到 Welcome Back。
- Candidate 只展示 1 条；如果有多条 pending，用户需要到 Stats 管理其余候选。
- Streak 提醒只基于 checkin 打卡；如果用户用其他方式记录（专注/运动等），streak 不会增长。
- 无主动回访触发机制（P2 范围：Service Worker Push）。
