# 阶段 21.1 留存设计审计

# 1. 当前留存状态

* *状态：部分循环**

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
4. AI Context currently does not have a unified `dailyFeedback` field, and AI needs to reconstruct conclusions from multiple scattered fields.

# 2. 用户旅程分析

## 工作台

当前职责：记录入口 + 今日成长反馈入口。

现状：

- 第一屏已经放置成长简报，方向正确。
- 今日发现能展示连续打卡、待办、专注和阅读。
- 记录打卡、运动、阅读、英语、专注后会刷新 UI 和成长简报。

缺口：

- 反馈缺少稳定的“今天变化 / 今日亮点 / 下一步”三段结构。
- toast 与成长简报之间没有统一语义。

## 统计

当前职责：完整分析 + 报告 + Memory 管理。

现状：

- 周报和月报回答“最近怎么样”。
- Memory Candidate 和 Confirmed Memory 已有入口。

缺口：

- 缺少从“最近 7 / 30 / 90 天变化”派生的成长时间线。
- 用户需要自己组合报告、目标和 Memory 才能看到长期变化。

## AI

当前职责：解释、建议、长期规律反馈。

现状：

- AI can read growth, goals, memory, report.
- Report current main exposures weekly / monthly.

缺口：

- 没有 runtime `dailyFeedback`，AI 无法直接引用一个统一的今日反馈对象。

# 3. 每日成长反馈设计

## 目标

用户完成一次重要行为后，不需要自己分析，就能看到：

1. 今天发生了什么。
2. 这次记录对应的成长亮点。
3. 下一步可以做什么。

## 建议结构


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

## 生成规则

Daily Growth Feedback 必须是纯派生对象：

- Input: Existing AI Context or existing Growth Intelligence daily insight.
- Data sources: Analytics, GrowthIntelligence, Goals.
- Output: `summary`, `highlight`, `suggestion`.
- Lifecycle: runtime only, not persisted, not written to Store.

建议实现：

- In the AI context, derived based on `GrowthReport.buildReport(context, 'daily')`:
  - `summary = daily.summary`
  - `highlight = achievements[0] || insights[0]`
  - `suggestion = recommendations[0] || nextSteps[0]`
- Workbench continues to reuse a snapshot of the current growth briefing, mapping the existing status / strength / recommendedFocus into the same three-part structure.

## 文案边界

允许：

- “今天完成了一次专注记录。”
- “你的连续成长记录正在保持。”
- “可以先完成一个 10 分钟的小任务。”

禁止：

- “你正在改变人生。”
- “你已经成为自律的人。”
- “AI 保证你会进步。”

# 4. 成长面板方案

Workbench 已经是事实上的成长驾驶舱，不需要新增大卡片，也不建议改变页面架构。

## 首屏应继续回答三个问题

1. **我今天状态怎么样？**
Use the existing Growth Brief status.
2. **最近有什么进步？**
Use the existing strength / importantChanges, newly displayed as `highlight`.
3. **下一步做什么？**
Using the existing recommendedFocus / actionProposals, add a new display as `suggestion`.

## 最小调整方案

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

# 5. 时间线设计

## 目标

让用户看到“我过去发生了什么变化”，而不是只看一次性分数。

## 建议结构


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

允许 类型：

- [[代码0]]
- [[代码0]]
- [[代码0]]
- [[代码0]]

## 数据来源

只允许：

- 分析快照
- GrowthIntelligence 快照
- 目标 派生结果
- GrowthMemory 已确认项目

禁止：

- 直接扫描所有原始历史数据
- 新增数据库字段
- Add new achievement table

## 投影规则

Timeline 是运行时投影，建议最多 8 条：

|来源 |类型 |说明 |
| --- | --- | --- |
| 目标完成 | achievement | 来自 GoalEngine 完成 |
| 指标上升 | improvement | 来自 GrowthIntelligence 重要变化 / 趋势 |
| 连续记录、目标完成、学习/专注阶段 | milestone | 来自现有 milestone 派生规则 |
| 确认的习惯 / 模式 | habit | 只使用用户确认或已沉淀的长期规律 |

Sort: `date desc`, then by confidence / importance in descending order.

# 6. 里程碑设计

当前 `growthMemory.js` 已有阶段性节点派生：

- 连续成长 7 / 30 / 90 天
- 近 30 天学习投入达到 600 分钟
- 近 30 天专注投入达到 180 分钟
- 完成目标

这些规则符合阶段反馈定位，不是游戏化。

## 设计原则

允许：

- 阶段性反馈
- 温和确认
- 与建议连接

禁止：

- 积分
- 排名
- 竞争
- 虚拟奖励
- Add new achievement table

## 展示方案

It is not recommended to add a separate Milestone page. It is recommended to display it as a type of Timeline:


```text
成长时间线
├─ 连续成长 7 天
├─ 近 30 天专注投入达到 180 分钟
├─ 完成第一个学习目标
└─ 专注练习逐步增强
```

# 7. AI 集成影响

AI 不扩展模型能力，只增加上下文派生字段。

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

- 仅运行时
- 不持久化
- Do not modify Memory
- 不新增 AI 写权限
- Do not change the AI Provider contract

AI 语义应保持：

- 温和
- 数据驱动
- 给可选择的小行动
- 不主动命令用户

# 8. 数据架构影响

* *数据影响：无**

理由：

- Daily Feedback can be derived from existing GrowthReport daily results.
- Timeline can be derived from confirmed Analytics, GrowthIntelligence, Goals, and GrowthMemory.
- Milestone already has GrowthMemory derivation logic.
- 不需要新增表、数据字段、Memory 类型、同步字段或第二数据源。

# 9. 性能影响

## 约束

- Workbench continues to reuse existing snapshots and `buildDailyInsight()`.
- AI Context continues to build the Context only once.
- Timeline only consumes existing snapshots / context and does not scan the original history.
- 不新增缓存层。

## 预估影响

P0 影响很小：

- `dailyFeedback` 只增加 3-4 个短字符串字段。
- 不新增 Analytics 调用。

P1 时间表应限制最多 8 条：

- Only take values from derived important changes, target state, and confirmed Memory.
- 避免 365 天全量遍历。

# 10. 安全影响

## 前端

新增文案和时间轴必须使用：

- `textContent`
- 结构化 DOM 构建

禁止：

- 将用户目标名、Memory 内容、Evidence 值直接拼进 `innerHTML`

## AI

- AI 继续只读。
- `dailyFeedback` 是派生上下文，不是用户指令。
- Prompt 边界继续要求把 Context 中的文本当作数据，不当作指令。

# 11. 实施范围

## P0 - 必须实现

1. **每日增长反馈**
   - 新增纯派生函数或扩展 GrowthReport 每日结果。
   - 输出 `summary / highlight / suggestion / dataSufficient`。
   - AI 上下文增加 `ctx.dailyFeedback`。
2. **Workbench 增长简报增强**
   - 不新增卡片。
   - Display summary / highlight / suggestion in the existing first screen growth briefing.
   - 所有记录动作后保持局部刷新。
3. **AI 上下文测试**
   - 覆盖 `dailyFeedback` 存在、仅运行时、空数据、数据不足。
4. **Workbench UX 测试**
   - 覆盖记录后 Growth Brief 更新。
   - 覆盖不修改 Store revision。

## P1 - 建议实现

1. **成长时间线**
   - 新增 runtime projection。
   - 在 Stats 或 Workbench 成长区域展示最多 8 条。
   - 类型限制为 成就 / 改进 / 里程碑 / 习惯。
2. **里程碑展示**
   - 复用 GrowthMemory milestone 派生逻辑。
   - 不新增存储。
3. **记录反馈文案统一**
   - After checking in, exercising, reading, English, and focusing on completion, the toast is semantically consistent with the Growth Brief.

## P2 - 未来优化

1. Timeline grouped display.
2. 长期记忆与趋势变化建立更明确的叙事关系。
3. 在不引入推送服务的前提下，优化用户主动打开时的今日回顾。

# 12. 最终建议

* *准备实施**

当前架构足以支持留存基础建设，无需修改数据模型、同步协议或 AI 权限模型。

It is recommended to first implement P0: unify Daily Growth Feedback, enhance Workbench Growth Brief, and expand AI Context. Timeline and Milestone displays should be placed in P1 to avoid expanding the scope all at once.
