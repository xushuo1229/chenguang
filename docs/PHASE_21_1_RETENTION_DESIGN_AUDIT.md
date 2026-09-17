# Phase 21.1 留存设计审计

## 1. 当前留存状态

**STATUS: PARTIAL LOOP**

当前产品已经具备基础留存链路：

```text
用户记录
→ CGStore
→ Analytics
→ Growth Intelligence
→ Workbench 成长简报 / Stats 报告 / AI Coach
→ 用户确认长期规律
```

已具备的能力：

- Workbench 第一屏已有「今日成长简报」，包含当前状态、风险、优势、推荐行动。
- 用户记录后 `updateUI()` 会刷新成长简报，但多数 toast 只说“已记录成功”，没有直接回答“这次记录改变了什么”。
- Stats 已有周报、月报、Memory 管理入口。
- AI 页面已有趋势、目标、报告和 confirmed Memory。
- GrowthMemory 已有 milestone 派生逻辑，但当前 runtime Context 只合并 candidates，未充分展示 milestones。

主要留存断点：

1. 记录后的即时反馈偏“操作成功”，缺少“今天有什么变化”。
2. 长期进步主要集中在周报/月报，缺少轻量时间线。
3. 阶段性成长节点已有计算基础，但缺少用户可理解的入口。
4. AI Context 目前没有统一的 `dailyFeedback` 字段，AI 需要从多个分散字段重组结论。

## 2. 用户旅程分析

### Workbench

当前职责：记录入口 + 今日成长反馈入口。

现状：

- 第一屏已经放置成长简报，方向正确。
- 今日发现能展示连续打卡、待办、专注和阅读。
- 记录打卡、运动、阅读、英语、专注后会刷新 UI 和成长简报。

缺口：

- 反馈缺少稳定的“今天变化 / 今日亮点 / 下一步”三段结构。
- toast 与成长简报之间没有统一语义。

### Stats

当前职责：完整分析 + 报告 + Memory 管理。

现状：

- 周报和月报回答“最近怎么样”。
- Memory Candidate 和 Confirmed Memory 已有入口。

缺口：

- 缺少从“最近 7 / 30 / 90 天变化”派生的成长时间线。
- 用户需要自己组合报告、目标和 Memory 才能看到长期变化。

### AI

当前职责：解释、建议、长期规律反馈。

现状：

- AI 能读取 growth、goals、memory、report。
- 报告当前主要暴露 weekly / monthly。

缺口：

- 没有 runtime `dailyFeedback`，AI 无法直接引用一个统一的今日反馈对象。

## 3. 每日成长反馈设计

### 目标

用户完成一次重要行为后，不需要自己分析，就能看到：

1. 今天发生了什么。
2. 这次记录对应的成长亮点。
3. 下一步可以做什么。

### 建议结构

```js
{
  version: '1.0',
  date: '2026-09-15',
  dataSufficient: true,
  summary: '今日完成专注 25 分钟。',
  highlight: '你的连续成长记录正在保持。',
  suggestion: '可以继续完成一个小目标。',
  source: 'GrowthReport.daily'
}
```

### 生成规则

Daily Growth Feedback 必须是纯派生对象：

- 输入：已有 AI Context 或已有 Growth Intelligence daily insight。
- 统计来源：Analytics、GrowthIntelligence、Goals。
- 输出：`summary`、`highlight`、`suggestion`。
- 生命周期：runtime only，不持久化，不写入 Store。

建议实现：

- 在 AI Context 中基于 `GrowthReport.buildReport(context, 'daily')` 派生：
  - `summary = daily.summary`
  - `highlight = achievements[0] || insights[0]`
  - `suggestion = recommendations[0] || nextSteps[0]`
- Workbench 继续复用当前成长简报的一次 snapshot，将现有 status / strength / recommendedFocus 映射成相同三段结构。

### 文案边界

允许：

- “今天完成了一次专注记录。”
- “你的连续成长记录正在保持。”
- “可以先完成一个 10 分钟的小任务。”

禁止：

- “你正在改变人生。”
- “你已经成为自律的人。”
- “AI 保证你会进步。”

## 4. 成长面板方案

Workbench 已经是事实上的成长驾驶舱，不需要新增大卡片，也不建议改变页面架构。

### 首屏应继续回答三个问题

1. **我今天状态怎么样？**
   使用现有 Growth Brief status。
2. **最近有什么进步？**
   使用现有 strength / importantChanges，新增展示为 `highlight`。
3. **下一步做什么？**
   使用现有 recommendedFocus / actionProposals，新增展示为 `suggestion`。

### 最小调整方案

P0 不新增卡片，只增强现有「今日成长简报」：

```text
今日成长简报
├─ Summary：今天的关键变化
├─ Highlight：当前成长亮点
├─ Suggestion：下一步小行动
└─ Existing Actions：现有建议入口
```

记录完成后的反馈统一为：

```text
toast：轻量确认
Growth Brief：完整反馈
```

不建议通过弹窗或复杂通知打断用户。

## 5. 时间线设计

### 目标

让用户看到“我过去发生了什么变化”，而不是只看一次性分数。

### 建议结构

```js
[
  {
    date: '2026-09-15',
    type: 'milestone',
    title: '连续成长 7 天',
    description: '来自最近的活跃记录。',
    sourceId: 'milestone:streak_7'
  }
]
```

允许 type：

- `achievement`
- `improvement`
- `milestone`
- `habit`

### 数据来源

只允许：

- Analytics snapshot
- GrowthIntelligence snapshot
- Goals 派生结果
- GrowthMemory confirmed items

禁止：

- 直接扫描所有原始历史数据
- 新增数据库字段
- 新增 achievement 表

### 投影规则

Timeline 是 runtime projection，建议最大 8 条：

| 来源 | type | 说明 |
| --- | --- | --- |
| 目标完成 | achievement | 来自 GoalEngine completed |
| 指标上升 | improvement | 来自 GrowthIntelligence importantChanges / trends |
| 连续记录、目标完成、学习/专注阶段 | milestone | 来自现有 milestone 派生规则 |
| confirmed Habit / Pattern | habit | 只使用用户确认或已沉淀的长期规律 |

排序：`date desc`，再按 confidence / importance 降序。

## 6. 里程碑设计

当前 `growthMemory.js` 已有阶段性节点派生：

- 连续成长 7 / 30 / 90 天
- 近 30 天学习投入达到 600 分钟
- 近 30 天专注投入达到 180 分钟
- 完成目标

这些规则符合阶段反馈定位，不是游戏化。

### 设计原则

允许：

- 阶段性反馈
- 温和确认
- 与建议连接

禁止：

- 积分
- 排名
- 竞争
- 虚拟奖励
- 新增 achievement 表

### 展示方案

不建议新增独立 Milestone 页面。建议作为 Timeline 的一种 type 展示：

```text
成长时间线
├─ 连续成长 7 天
├─ 近 30 天专注投入达到 180 分钟
├─ 完成第一个学习目标
└─ 专注练习逐步增强
```

## 7. AI 集成影响

AI 不扩展模型能力，只增加 Context 派生字段。

建议：

```js
ctx.dailyFeedback = {
  summary: '今日完成专注 25 分钟。',
  highlight: '你的连续成长记录正在保持。',
  suggestion: '可以继续完成一个小目标。',
  dataSufficient: true
}
```

约束：

- runtime only
- 不持久化
- 不修改 Memory
- 不新增 AI 写权限
- 不改变 AI Provider 契约

AI 语义应保持：

- 温和
- 数据驱动
- 给可选择的小行动
- 不主动命令用户

## 8. 数据架构影响

**Data Impact: NONE**

理由：

- Daily Feedback 可由已有 GrowthReport daily 结果派生。
- Timeline 可由 Analytics、GrowthIntelligence、Goals、GrowthMemory confirmed 派生。
- Milestone 已有 GrowthMemory 派生逻辑。
- 不需要新增表、数据字段、Memory 类型、同步字段或第二数据源。

## 9. 性能影响

### 约束

- Workbench 继续复用现有 snapshot 和 `buildDailyInsight()`。
- AI Context 继续只构建一次 Context。
- Timeline 只消费已有 snapshot / context，不扫描原始历史。
- 不新增缓存层。

### 预估影响

P0 影响很小：

- `dailyFeedback` 只增加 3-4 个短字符串字段。
- 不新增 Analytics 调用。

P1 Timeline 应限制最多 8 条：

- 只从已派生的重要变化、目标状态、confirmed Memory 中取值。
- 避免 365 天全量遍历。

## 10. 安全影响

### Frontend

新增文案和 Timeline 必须使用：

- `textContent`
- 结构化 DOM 构建

禁止：

- 将用户目标名、Memory 内容、Evidence 值直接拼进 `innerHTML`

### AI

- AI 继续只读。
- `dailyFeedback` 是 derived context，不是用户指令。
- Prompt 边界继续要求把 Context 中的文本当数据，不当指令。

## 11. 实施范围

### P0 - 必须实现

1. **Daily Growth Feedback**
   - 新增纯派生函数或扩展 GrowthReport daily 结果。
   - 输出 `summary / highlight / suggestion / dataSufficient`。
   - AI Context 增加 `ctx.dailyFeedback`。
2. **Workbench Growth Brief 增强**
   - 不新增卡片。
   - 在现有第一屏成长简报中展示 summary / highlight / suggestion。
   - 所有记录动作后保持局部刷新。
3. **AI Context 测试**
   - 覆盖 `dailyFeedback` 存在、runtime only、空数据、数据不足。
4. **Workbench UX 测试**
   - 覆盖记录后 Growth Brief 更新。
   - 覆盖不修改 Store revision。

### P1 - 建议实现

1. **Growth Timeline**
   - 新增 runtime projection。
   - 在 Stats 或 Workbench 成长区域展示最多 8 条。
   - type 限制为 achievement / improvement / milestone / habit。
2. **Milestone 展示**
   - 复用 GrowthMemory milestone 派生逻辑。
   - 不新增存储。
3. **记录反馈文案统一**
   - 打卡、运动、阅读、英语、专注完成后，toast 与 Growth Brief 语义一致。

### P2 - 未来优化

1. Timeline 分组展示。
2. 长期记忆与趋势变化建立更明确的叙事关系。
3. 在不引入推送服务的前提下，优化用户主动打开时的今日回顾。

## 12. 最终建议

**READY FOR IMPLEMENT**

当前架构足以支持留存基础建设，无需修改数据模型、同步协议或 AI 权限模型。

建议先实施 P0：统一 Daily Growth Feedback、增强 Workbench Growth Brief、扩展 AI Context。Timeline 和 Milestone 展示放在 P1，避免一次性扩大范围。
