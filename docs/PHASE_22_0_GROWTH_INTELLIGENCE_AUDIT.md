# Phase 22.0 成长智能演进审计报告

# 摘要

Currently, Growth Intelligence has basic trend detection (7/30/90 day week-on-week), growth scoring, domain status, and signal generation. The Timeline/Narrative/Retention layer of Phase 21 has covered "how users perceive growth".

核心缺口：系统无法区分**一次提升**、**短期波动**、**稳定趋势**和**长期能力形成**四个不同层级。`buildTrend()` 将所有 "rising" 视为相同信号，不区分置信度和持续性。

判定：**准备实施**（阶段 22.1 应先建立统一的 Growth Signal 结构，再扩展深度理解）。

- --

# 当前架构

```
CGStore
↓
Analytics（getTrend / getDateRangeSummary / getStreaks）
↓
GrowthIntelligence（computeGrowthState）
├── buildTrend()（7 个指标 × 4 个窗口 = 28 个 trend 对象）
├── buildGrowthScore()（完成 45% + 连续性 30% + 趋势 25%）
├── buildGrowthSummary()（7/30/90 天 strengths + risks）
├── buildSignals()（risks + positives，ad-hoc 结构）
├── buildActionProposals()（2-3 条建议）
└── domains（learning/focus/english/reading/exercise/course/goal/workload/consistency）
↓
Phase 21 Projections
├── DailyFeedback（js/dailyFeedback.js）
├── GrowthTimeline（js/growthTimeline.js）
├── GrowthNarrative（js/growthTimeline.js buildNarrative）
└── RetentionContext（js/retentionContext.js）
↓
UI（Workbench / Stats）+ AI Context
```

- --

# 能力地图

| 能力 | 当前状态 | 证据 |
|---|---|---|
| 用户最近成长方向 | ✅ 可回答 | `buildDailyInsight().status` / `growthSummary.ranges[7d].learningTrend.description` |
| 哪些行为正在改善 | ✅ 可回答 | `positiveSignals` / `growthSummary.ranges[7d].strengths` |
| 哪些行为正在下降 | ✅ 可回答 | `riskSignals` / `growthSummary.ranges[7d].risks` |
| 哪些目标存在风险 | ✅ 可回答 | `goalState.risk` / `riskSignals[type=goal_risk]` |
| 哪些变化值得反馈 | ✅ 可回答 | `trendState.importantChanges`（阈值 ≥ 20%） |
| 行为变化（Behavior Change） | ⚠️ 部分可回答 | `buildTrend().status = rising/falling`，但无法区分单次 vs 持续 |
| 稳定趋势（Consistency） | ✅ 可回答 | `consistencyState.summary.currentStreak` / `buildTrend().volatility` |
| 阶段变化（Stage Transition） | ✅ Phase 21.5 已覆盖 | `buildNarrative().currentStage` / `stages` |
| 长期能力形成（Identity/Capability） | ❌ 不可回答 | 无此概念；由 Memory candidate → confirmed 补充，但非 GrowthIntelligence 输出 |

## 缺失层

1. **统一 Growth Signal 结构**：当前 `positiveSignals` 和 `riskSignals` 是临时对象（`{type, severity, reason, evidence}`），没有 `strength`、`confidence`、`direction` 标准字段。
2. **行为变化 vs 波动区分**：`buildTrend()` 的 `status = rising` 阈值是 `delta >= 20%`，但未校验持续性（是否连续多天递增）或波动率（只有波动率 < 阈值才可信）。
3. **长期习惯形成检测**：`focus_habit_forming` 类型存在但仅基于 30 天 trend = rising，无"连续 N 天 + 波动率低 + 频率高"的复合条件。
4. **机会检测**：positiveSignals 可以检测“关注上升”，但不会主动建议“考虑建立阅读目标”。

- --

# Growth Signal 审计

## 当前信号来源

|信号 |来源 |结构 |
|---|---|---|
| 关注 | `Analytics.getTrend('focus')` | `{metric, label, span, current, previous, delta, status, volatility, evidence}` |
| 练习 | `Analytics.getTrend('exerciseMinutes')` | 同上 |
| 阅读 | `Analytics.getTrend('pages')` | 同上 |
| 英语 | `Analytics.getTrend('english')` | 同上 |
| 待办事项 | `Analytics.getTrend('todoDone')` | 同上 |
| 课程 | `Analytics.getCourseSummary()` | `{total, doing, avgProgress, lowProgressCount}` |
| 目标 | `GoalEngine.computeGoalsProgress()` | `{active, completed, expired, atRisk, risk[]}` |
| 连续记录 | `Analytics.getStreaks()` | `{currentStreak, longestStreak, lastDate, todayDone}` |

## 统一结构评估

当前 `buildTrend()` 输出结构 **部分统一**：

```js
// buildTrend() 输出（存在统一基础）
{
  metric: 'focus',
  label: '专注时长',
  span: '7d',
  current: 190,
  previous: 140,
  delta: 36,
  status: 'rising',       // ← direction 信息但不完整
  volatility: 45,
  insufficientData: false,
  evidence: { currentActiveDays: 6, previousActiveDays: 5, ... }
}
```

* *缺失字段**（建议 Phase 22.1 补充）：

| 缺失 | 用途 | 建议 |
|---|---|---|
| `type` | 区分行为变化 / 一致性 / 阶段转换 / 身份 | 从状态 波动 活跃天数 推导 |
| `direction` | 统一 上升 / 下降 / 持平（替代状态字符串） | 从增量正负号直接映射 |
| `strength` | 0-1 信号强度（考虑增量幅度 波动的反比 活跃天数） | `abs(delta) / (100 + volatility)` 归一化 |
| `confidence` | 0-1 信号可信度 | 基于活跃天数数量和波动 |
| `isSustained` | 是否为稳定趋势（非一次波动） | `volatility < 50 && activeDays >= 5` |

## 重复计算检查

- ✅ `stateCache` 已存在（基于 `_meta.revision` 缓存）
- ✅ DailyFeedback / Timeline / RetentionContext 均使用已有 `growthState`
- ⚠️ `buildGrowthSummary()` 对 7/30/90 三个窗口各调用一次 `Analytics.getDateRangeSummary()`，与 `buildTrend()` 中的 `Analytics.getTrend()` 存在部分重叠（同一日期范围内的汇总和日序列）

## UI 层自行解释检查

- ✅ `DailyFeedback.buildHighlights()` receives `growthState`, does not call Analytics directly
- ✅ `GrowthTimeline.buildTimeline()` consumes `growthState`
- ⚠️ `pages/workbench.js` uses `change.label + '：' + change.current + ...` to directly concatenate technical values for `changesEl` in `renderGrowthBrief()` (not formatted through the user language layer)

- --

# Growth Intelligence 输出审计

## 用户层

当前 `buildDailyInsight().status` 和 `positiveSignals[0].reason` 可生成：

> ✅ "最近 30 天专注时长上升 36%。"

* *问题：** 无格式化层将 `trend.delta = 36` 转为更友好的"有明显提升"或"轻微改善"。

## 系统层

`buildTrend()` 提供结构化数据：

> ✅ `{metric: "focus", direction: "rising" (部分), delta: 36, volatility: 45}`

* *缺失：** 无 `confidence: 0.82` 等字段。

## AI 层

`ctx.growth.trends` 已包含 7/30/90 天趋势：

> ✅ AI 可回答"根据你的记录，最近专注时间有所增加。"

* *问题：**
- `ctx.growthState.importantChanges` 中的 `label` 是中文（如"专注时长"），但 `metric` 是英文键名（如 `focus`）
- `ctx.growthState.positiveSignals` 中的 `reason` 直接包含数字（如"上升 36%"），AI 可能逐字引用

## 技术字段泄露检查

| 问题 | 位置 | 严重度 |
|---|---|---|
| Analytics 字段名直接展示 | `pages/workbench.js` changesEl 拼接 `change.current` | 低 |
| 无证据判断 | `positiveSignals` 中 `focus_habit_forming` 仅基于 trend = rising，无 volatility 检查 | 中 |
| AI 过度解释 | 当前无，AI Context 中 Coach 已限制 | ✅ |

- --

# 成长机会审计

## 正面机会（优势机会）

| 场景 | 当前支持 | 缺失 |
|---|---|---|
| 阅读连续提升 → 建议建立长期阅读目标 | ❌ | 系统可检测 `reading rising` 但不生成"建议建立目标"的 action proposal |
| 专注稳定 → 建议提高时长 | ❌ | 无 progressive goal 建议 |

## 风险机会（风险提醒）

| 场景 | 当前支持 | 缺失 |
|---|---|---|
| 过去稳定运动 → 最近下降 → 提醒恢复 | ✅ | `riskSignals[type=focus_declining]` 存在 |
| 目标临近截止但进度低 | ✅ | `goalState.risk` 存在 |

## 下一步行动

| 场景 | 当前支持 |
|---|---|
| 今天没有专注 → 建议短专注 | ✅ `actionProposals` 包含 |
| 有逾期待办 → 建议先完成 | ✅ `actionProposals` 包含 |

* *总体判定：** Positive Opportunity 是当前最大缺口。系统能检测到用户在某方面进步，但不主动建议将其转化为长期目标。

- --

# AI Context Suggestions

## 当前 AI 上下文内容

```
ctx = {
  today, overview, trends (7d/30d),
  english, focus, exercise, study, courses, todos,
  goals, growth, growthState, memory, coach, report, dailyFeedback
}
```

## 是否需要新增 `ctx.growthSignals`？

| 维度 | 评估 |
|---|---|
| **收益** | AI 可以获得结构化信号（方向和置信度）来替代从趋势中自行推断方向 |
| **成本** | 新增 token 开销（约 200-400 个 tokens，取决于信号数量） |
| **Token 影响** | 中等（当前上下文已较大，growthState 占比较高） |
| **必要性** | **当前阶段不推荐增加**。`ctx.growth.trends` 已包含每指标的趋势数据，AI 可以从中推断方向。增加独立 `growthSignals` 会导致数据冗余 |

## 是否需要新增 `ctx.growthSummary`？

| 维度 | 评估 |
|---|---|
| **收益** | AI 获得一句"最近 7 天整体学习趋势上升"的简洁总结 |
| **成本** | 低（约 50-100 个代币） |
| **Token 影响** | 小 |
| **必要性** | **P1 建议**。当前 `ctx.growth.trends[7d].learningTrend.description` 已包含类似信息（如"5 项学习指标中，主要方向为上升"），但埋在深层结构中。如果 Phase 22 重新组织 `ctx.growth`，可将 description 提升为顶层字段 |

## 替代方案建议

不新增字段，而是**重组**现有 `ctx.growth`：

```js
// 当前
ctx.growth = {
  score: { value, factors, ... },
  trends: { '7d': { learningTrend: {...}, consistency: {...}, ... }, ... },
  risks: [...],
  strengths: [...]
}

// Phase 22.1 建议（重组而非新增）
ctx.growth = {
  score: { value, factors, ... },
  trends: { ... },      // 保留
  risks: [...],          // 保留
  strengths: [...],      // 保留
  signals: [             // 新增：从 trends + risks + strengths 提取统一信号
    { metric: 'focus', direction: 'up', strength: 0.72, confidence: 0.85, isSustained: true }
  ]
}
```

- --

# Memory 边界

```
┌─────────────────────────────────────────────────────────┐
│                    Memory 边界                          │
├─────────────────────────┬───────────────────────────────┤
│   应属于 Memory          │   不应属于 Memory              │
├─────────────────────────┼───────────────────────────────┤
│ ✓ 用户确认长期规律        │ ✗ 短期趋势（7 天 rising）       │
│ ✓ 用户确认习惯            │ ✗ 一次提升（单日 spike）        │
│ ✓ 用户确认偏好            │ ✗ 系统判断（AI 推断）           │
│ ✓ 用户确认阶段成果         │ ✗ Growth Signal 原始数据        │
│ ✓ 用户确认目标历史         │ ✗ DailyFeedback 内容            │
│                          │ ✗ Timeline 事件                 │
│                          │ ✗ Narrative 阶段                │
│                          │ ✗ Growth Score                  │
│                          │ ✗ RetentionContext 输出         │
└─────────────────────────┴───────────────────────────────┘
```

## 当前边界检查

| 模块 | 是否写入 user.memory | 判定 |
|---|---|---|
| `growthIntelligence.js` | ❌ | ✅ 正确 |
| `growthTimeline.js` | ❌ | ✅ 正确 |
| `retentionContext.js` | ❌ | ✅ 正确 |
| `dailyFeedback.js` | ❌ | ✅ 正确 |
| `growthMemory.js` | ✅（确认/拒绝） | ✅ 正确（用户确认后才写入） |
| `aiContext.js` | ❌ | ✅ 正确 |

- --

# 性能

365 天模拟数据（300 checkin 183 focus 122 reading 92 sport 73 英语 183 todo 1 goals）

| 模块 | p50 (毫秒) | p95 (毫秒) | 目标 | 判定 |
|---|---|---|---|---|
| GrowthIntelligence.buildDailyInsight | 34.67 | 38.13 | <200毫秒 | ✅ |
| DailyFeedback | 0.012 | 0.039 | <10毫秒 | ✅ |
| GrowthTimeline | 0.013 | 0.069 | <10毫秒 | ✅ |
| GrowthNarrative | 0.011 | 0.134 | <10毫秒 | ✅ |
| RetentionContext.buildWelcomeBack | 0.352 | 0.496 | <10毫秒 | ✅ |
| RetentionContext.buildStreakReminder | 0.361 | 0.555 | <10毫秒 | ✅ |
| RetentionContext.getRetentionCandidate | 0.002 | 0.007 | <10毫秒 | ✅ |

* *结论：** 所有 runtime projection 远低于 10ms 目标。GrowthIntelligence p95 = 38ms 远低于 200ms 目标。性能不构成 Phase 22 瓶颈。

- --

# 安全

| 检查项 | 结果 | 证据 |
|---|---|---|
|Store 写入（GrowthIntelligence/GrowthTimeline/RetentionContext/DailyFeedback） |❌ 无 |`rg setUser` 0 匹配 |
|localStorage 写入 |❌ 无 |`rg localStorage` 0 匹配 |
|令牌 / 密码 / API 密钥泄露 |❌ 无 |`rg password|token|api.?key` 0 匹配 |
|AI 自动写入 |❌ 无 |GrowthMemory 写入仅通过 `confirmCandidate/rejectCandidate`（用户操作触发） |
| 绝对化文案 | ❌ 无 | 无"你一定会成功" |
| 恐吓文案 | ❌ 无 | 无"你的记录马上消失" |
| AI 完全了解用户 | ❌ 无 | 无"AI完全了解你" |

- --

# 建议下一阶段

## 阶段 22.1 · 统一增长信号结构

* *范围：** 最小扩展，不改变架构

| 任务 | 目标 |
|---|---|
| 在 `growthIntelligence.js` 中为 `buildTrend()` 输出增加 `strength`、`confidence`、`isSustained` | 让系统区分信号强度和可信度 |
| 将 `positiveSignals` / `riskSignals` 重构为统一 `GrowthSignal` 结构 | 统一 `{type, direction, strength, confidence, evidence}` |
| 在 `ctx.growth` 中增加 `signals[]` 数组（runtime-only） | AI 可直接引用结构化信号 |

## 阶段 22.2 · 习惯形成检测

* *范围：** 建立在 22.1 基础上

| 任务 | 目标 |
|---|---|
| 定义 `isHabitForming(trend)` 复合条件 | `activeDays >= 14 && volatility < 50 && delta > 10` |
| 在 positiveSignals 中区分 `momentum`（短期）和 `habit_forming`（长期） | 避免 AI 过度承诺 |
| 在 GrowthMemory candidate 生成中应用 `isHabitForming` | 提高 candidate 质量 |

## 第22.3阶段 · 机会检测

* *范围：** 独立扩展

| 任务 | 目标 |
|---|---|
| 在 positiveSignals 中检测"某指标持续上升 → 建议建立目标" | 生成 `opportunity` 类信号 |
| 在 actionProposals 中增加"建立目标"类型建议 | 引导用户将进步转化为目标 |

- --

# 修改文件列表

本阶段为纯审计，**无代码修改**。

仅新增：`docs/PHASE_22_0_GROWTH_INTELLIGENCE_AUDIT.md`

# 架构影响

无。本阶段不修改任何代码。

# 测试结果

- **前端：** PASS 476/476（45 个文件）
- **后端：** PASS 68/68（20套套间）
- **构建：** 传球（1.65秒）
- **git diff --check：** PASS（通过）

# 风险列表

| 风险 | 级别 | 建议 |
|---|---|---|
| Growth Signal lacks unified confidence/strength | P0 | Resolved in Phase 22.1 |
| Cannot distinguish one-time improvement vs stable trend | P0 | Resolved in Phase 22.1/22.2 |
| No proactive Opportunity Detection | P1 | Resolved in Phase 22.3 |
| Workbench changesEl directly displays technical values | P1 | Optimized together in Phase 22.1 |
| GrowthIntelligence p95 = 38ms | P2 | Currently acceptable, but performance should be monitored if new signal structure is added |
