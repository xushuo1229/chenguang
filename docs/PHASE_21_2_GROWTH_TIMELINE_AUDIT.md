# Phase 21.2 · 成长时间线与里程碑体验审计

审计日期：2026-09-15
范围：只读架构和产品体验审计。
运行时代码、存储模型、内存模型、同步协议或后端模式均未被修改。

# 1. 当前状态

* *结果：尚无统一时间线，但事件来源存在。**

该产品已经可以从多个角度描述增长，但它并不呈现一个连续的长期叙事。

现有建筑模块：

|区域 |当前能力 |时间线相关性 |
| --- | --- | --- |
| 分析 | 每日 / 每周 / 每月总结，趋势，连胜，活动地图，活动分布，个人最佳 | 可以证明首次记录、连胜、周期总数和历史最佳。 |
| GoalEngine | 从当前快照中导出活动/已完成/已过期/已归档目标 | 可以识别已完成的目标，但无法确定确切的历史完成日期。 |
| 增长智能 | 计算 7/14/30/90 天的趋势、增长评分、优势、风险、一致性和每日洞察 | 可以识别基于周期的改进和有意义的持续变化。 |
|增长报告 |构建每日、每周和每月的总结，包含成就、见解、挑战和建议 |提供叙述性，但不提供时间顺序的增长表。|
| 成长记忆 | 获取习惯、里程碑、偏好、见解、候选人、信心和生命周期 | 包含里程碑规则，但记忆不得成为时间线日志。 |
| 页面 | 工作台显示今天；统计显示报告、趋势、内存和个人最佳；AI解释趋势、风险、目标和长期记忆 | 目前没有页面拥有统一的时间线体验。 |

当前体验回答：


```text
How am I doing today?
How am I doing this week / month?
What patterns or risks exist?
```

它尚未清楚地回答：


```text
What growth nodes have I passed over time?
```

这是主要的长期叙事空白。

# 2. 数据来源分析

## 2.1 分析

分析是唯一的统计真实来源，已经揭示了最可靠的事件证据：

- `getDailySummary(date, data)`
- `getWeeklySummary(opts, data)`
- `getMonthlySummary(year, month, data)`
- `getDateRangeSummary(startDate, endDate, data)`
- `getTrend(metric, startDate, endDate, mode, data)`
- `getStreaks(data, opts)`
- `getActivityMap(data, opts)`
- `getActivityDistribution(startDate, endDate, data)`
- `getPersonalBest(data, opts)`

有用的时间线证据包括：

|证据 |含义 |
| --- | --- |
|[[代码0]] |首次记录的生长动作。|
|[[代码0]] |当前连续增长期。|
|[[代码0]] |历史一致性高峰。|
|课时总计 |学习、专注、锻炼、阅读和完成任务，时间跨度为7/30/90天。|
|个人最佳 |单日专注、学习、体育、阅读或英语纪录。|

限制：

Analytics 知道记录日期，但它当前并未公开统一的事件模型，例如：


```js
{ eventType, occurredAt, sourceId, evidence }
```

因此，时间线应当是运行时投影，而不是新存储的事件流。

## 2.2 目标

GoalEngine 能够根据当前数据快照正确地推导目标状态。

它可以支持以下里程碑：


```text
Completed 1 goal
Completed 3 goals
Completed first course goal
```

然而，目标完成情况是由当前值和目标值得出的。数据模型无法可靠地存储`completedAt`时间戳。

后果：


```text
Allowed: "截至今天，你已完成 N 个目标。"
Forbidden: "你在 2026-08-01 完成了目标。"
```

除非未来的阶段明确讨论在数据模型中添加完成时间戳。

## 2.3 增长智能

Growth Intelligence 已经提供：

- 7 / 14 / 30 / 90 天趋势。
- 增长评分。
- 积极信号和风险信号。
- 一致性状态。
- 推荐关注点。
- 每日洞察。

它可以支持时间线节点，例如：


```text
近 30 天学习投入上升
近 90 天专注节奏改善
连续记录达到 7 天
```

但这些是根据时期得出的观察，而不是具体日期的事件。它们必须被标注为得出的观察。

## 2.4 增长报告

报告已经将分析和增长智能的输出转换为用户可读的摘要。

它们作为叙事有用，但不是时间线：

- 报告总结一个时期。
- 时间轴应显示有界的增长节点。
- 报告应仍然是解读的场所。

## 2.5 增长记忆

成长记忆已经包含了里程碑规则，包括：

- 连续记录阈值：7 / 30 / 90 天。
- 30天学习阈值。
- 30天专注阈值。
- 已完成目标数量。

内存不应该扩展为时间线存储系统。

正确的边界：


```text
Memory: stable long-term facts confirmed or maintained by lifecycle.
Timeline: runtime projection of meaningful growth nodes.
```

# 3. 时间线设计

## 3.1 原理

时间线必须是纯粹的运行时投影。

推荐的数据流：


```text
CGStore
→ Analytics snapshot
→ GrowthIntelligence snapshot
→ GoalEngine progress snapshot
→ GrowthMemory confirmed facts
→ Growth Timeline projection
→ UI
```

禁止的数据流：


```text
Timeline → CGStore
Timeline → Memory
Timeline → Sync
Timeline → Backend
```

## 3.2 运行时形状

未来的实现应使用有界结构：


```js
{
  version: "1.0",
  today: "2026-09-15",
  dataSufficient: true,
  items: [
    {
      id: "milestone:streak_7",
      type: "milestone",
      title: "连续成长达到 7 天",
      description: "根据最近连续记录判断。",
      datePrecision: "asOf",
      observedAt: "2026-09-15",
      basis: "derived",
      sourceId: "milestone:streak_7",
      evidence: [
        {
          source: "Analytics",
          metric: "current_streak",
          value: 7
        }
      ]
    }
  ]
}
```

重要字段：

|场域 |目的 |
| --- | --- |
|[[代码0]] |区分里程碑、改进、习惯和记录。|
|`datePrecision` |避免假装推导结论具有精确事件日期。|
|`observedAt` |标记当前快照支持该节点。|
|`basis` |将观察到的记录事实与派生解释分开。|
|`sourceId` |稳定身份并防止重复节点。|
|[[代码0]] |保持节点可解释性。|

## 3.3 日期语义

时间轴应支持三种日期精度：

| 值 | 含义 | 示例 |
| --- | --- | --- |
| `day` | 存在实际记录日期。 | 首次记录的操作。 |
| `period` | 该节点属于计算范围。 | 最近30天。 |
| `asOf` | 该节点截至今天为真，但确切的交叉日期未知。 | 已完成的目标。 |

这是诚实所必需的。没有它，时间轴可能会把推测的事实呈现为历史事件。

## 3.4 订购和上限

建议限制：

- UI 时间线：最多 8 个项目。
- AI 上下文时间线，如果以后实现：最多 5 个项目。
- 每个项目的证据：上下文中最多 1 个，UI 中最多 2 个。
- 优先选择高可信度和稳定的里程碑，而非短期波动。

推荐优先级：

1. 首次记录日期。
2. 确认的记忆里程碑。
3. 当前连胜阈值。
4. 30天的学习或专注突破。
5. 已完成的目标或课程。
6. 有意义的30天/90天改进。
7. 历史个人最佳。

短期噪音不应进入时间线。

# 4. 里程碑分析

## 4.1 真正的增长节点

| 里程碑 | 来源 | 质量 | 备注 |
| --- | --- | --- | --- |
| 首次成长记录 | 分析 `getPersonalBest()` | 良好 | 诚实的入职和激活节点。 |
| 连续记录达到 7 / 30 / 90 天 | 分析连续记录   增长智能 | 良好 | 已经符合记忆里程碑规则。 |
| 30天学习超过600分钟 | 成长智力 | 良好 | 已定义。 |
| 30天专注时间超过180分钟 | 增长智能 | 良好 | 已定义。 |
| 首个完成的目标 | GoalEngine | 在有限条件下表现良好 | 可以说“截至今天”，但不是确切的历史日期。 |
|多个完成目标 |GoalEngine |有限制良好 |应使用阈值，如3/10以避免噪声。|
| 课程已完成 | 分析课程总结 / 课程状态 | 良好 | 对学习叙述有帮助。 |
|书籍已完成 |阅读记录 |良好 |应要求 `pages >= totalPages`。|
| 历史个人最佳 | 分析 `getPersonalBest()` | 条件 | 仅当数值超过有意义的阈值时；否则第一个小记录将变为噪音。 |
| 持续 30 / 90 天的改进 | 增长智能 | 有条件 | 必须显示证据和时间段；并非每一个小的变化都是一个里程碑。 |

## 4.2 非里程碑

这些不应作为生长节点呈现：

| 数据 | 原因 |
| --- | --- |
| 完成的一项待办事项 | 操作性行为，不是长期增长节点。 |
| 一次签到 | 太小，除非是连续达标的一部分。 |
| 添加一个目标 | 意图，而不是成就。 |
| 用户确认的偏好 | 个人情况，而不是增长事件。 |
| 候选记忆 | 未确认的可能趋势；不能作为事实展示。 |
| 短期波动变化 | 稳定性不足。 |
| 下降趋势 | 重要作为风险，而不是里程碑。 |
| AI 推荐 | 一种建议，而不是用户已达成的事项。 |

## 4.3 重复控制

增长内存已经有稳定的里程碑 ID，例如：


```text
milestone:streak_7
milestone:streak_30
milestone:streak_90
milestone:learning_600_30d
milestone:focus_180_30d
milestone:goal_completed
```

时间线应重用或与这些ID对齐。

规则：

1. 一个`sourceId`只出现一次。
2. 在空间有限时，显示达到的最高连胜阈值，而不是重复显示所有较低的阈值。
3. 不要每次用户打开统计时都创建一个新节点。
4. 在此阶段不要持续显示“已显示”状态。

# 5. Context 影响

## 5.1 当前状态

`aiContext.js` 已经公开了：

- [[代码0]]
- [[代码0]]
- [[代码0]]
- [[代码0]]
- [[代码0]]
- [[代码0]]
- [[代码0]]
- [[代码0]]

人工智能已经有足够的资料来解释近期的进展和长期的模式。

因此，P0不需要`ctx.growthTimeline`。

## 5.2 未来期权

如果人工智能以后需要回答如下问题：


```text
我有哪些长期成长节点？
我的成长时间线是什么？
```

然后可以添加一个仅在运行时存在的字段：


```js
ctx.growthTimeline = {
  version: "1.0",
  today: "2026-09-15",
  dataSufficient: true,
  items: []
};
```

如果后续实施规则：

1. 仅限播放时间。
2. 上下文中最多5个项目。
3. 每个项目最多一个证据对象。
4. 不要包含被拒绝或过期的记忆。
5. 不要包含原始用户文本。
6. 不要将候选记忆作为事实。
7. 在`report`、`memory`或核心分析事实之前修剪`growthTimeline`。

预计上下文增加：

| 设计 | 预计增量 |
| --- | --- |
| 3 个紧凑的里程碑项目 | 大约 180-220 个词。|
| 5 个紧凑的里程碑项目 | 大约 250-320 个词。|
| 8 个完整项目带描述 | 对 AI 上下文来说太大。|

安全的上限是5件紧凑物品。

# 6. UX 建议

## 工作台

工作台应保持关注今天。

推荐内容：


```text
今日成长反馈
当前连续记录
最多 1 条里程碑提示
```

推荐文案：


```text
你已连续记录 7 天。
```

避免：


```text
你的完整成长时间线
```

工作台不应该变成历史页面。

## 统计

Stats是时间线的合法拥有者。

推荐放置位置：


```text
成长分析中心
├─ 趋势解读
├─ 成长报告
├─ 成长时间线
├─ 成长轨迹 / Memory
├─ 趋势图表
└─ 个人最佳
```

推荐时间表部分：


```text
成长时间线
截至 2026-09-15

第一次成长记录：2025-12-01
连续成长达到 30 天：截至今天
近 30 天学习投入达到 600 分钟：截至今天
已完成 3 个目标：截至今天
```

互动：

1. 默认：显示 5-8 个项目。
2. 空状态：说明一次记录的操作会启动时间线。
3. 节点点击或悬停：以用户语言显示证据。
4. P0 中不使用模态窗口或仪表板展开。

## AI

AI应该解释时间线，而不是将其复制为完整列表。

推荐：


```text
根据记录，你最近最重要的变化是连续成长达到 7 天。
```

禁止：


```text
我完全了解你的成长历程。
```

人工智能应该区分：

| 数据类型 | 语言边界 |
| --- | --- |
| 分析记录事实 | “根据你的记录” |
| 从周期中得出的观察 | “数据显示” |
| 已确认记忆 | “你已形成” |
| 候选记忆 | “系统发现一个可能趋势” |
| 建议 | “可以尝试” |

# 7. 性能

一次一次性合成节点基准测试使用了365天的本地测试数据：

| 分析操作 | 近似结果 |
| --- | --- |
| 365天 `getDateRangeSummary` | 约 3.6 毫秒 |
| 365天 `getTrend('activity')` | 约 2.8 毫秒 |
| 365天 `getActivityMap` | 约 3.8 毫秒 |
| 365天 `getStreaks` | 约 0.7 毫秒 |
| 365天 `getPersonalBest` | 约 4.1 毫秒 |

对于相同的合成数据，`GrowthIntelligence.computeGrowthState()` 在 Node 中大约花了 125 毫秒。

解读：

1. 365天的分析电话并不是主要瓶颈。
2. 增长智能更昂贵，因为它需要计算多个窗口和指标。
3. 时间线必须消耗已计算好的AI上下文或增长智能快照。
4. 时间线不得再次调用`computeGrowthState()`。
5. 时间线不应将每个活跃日都转化为节点。
6. 将8个UI项目的最高投影应该能忽略不计。

推荐的实现约束：


```text
Max UI items: 8
Max AI Context items: 5
Max evidence per UI item: 2
Max evidence per Context item: 1
No second Analytics pass
No second GrowthIntelligence pass
No new cache layer
```

# 8. 安全

## 8.1 推断事实与记录事实

时间线必须为其基础标注。

| 基础 | 允许的展示 |
| --- | --- |
| `observed` | 实际记录日期或数值。 |
| `derived` | 汇总期间结论。 |
| `confirmed-memory` | 用户确认的长期事实。 |

禁止：


```text
You completed this milestone on YYYY-MM-DD
```

当只有一个时期的结论可用时。

## 8.2 证据边界

允许的证据来源：


```text
Analytics
GrowthIntelligence
Goals
```

禁止的证据来源：


```text
AI generated
Chat content
Prompt content
Candidate Memory as fact
Rejected Memory
Expired Memory
```

## 8.3 用户内容

时间轴应避免在 AI 上下文中使用原始待办事项文本、课程笔记、书名或其他自由形式的用户内容。

推荐：


```text
完成了 1 个目标。
```

避免：


```text
完成了目标：<raw user goal text>
```

对于本地 UI，任何用户提供的标签仍必须使用 `textContent` 渲染，而不是 HTML 拼接。

## 8.4 内存污染

时间线不得写入到：


```text
CGStore
user.memory
Sync payload
Backend schema
```

还不得促进：


```text
candidate → confirmed
derived trend → confirmed Memory
```

记忆推广仍然受现有用户确认流程的管理。

# 9. P0 / P1 / P2 计划

## P0：运行时时间表预测

目标：为统计数据创建一个有边界的只读时间轴。

推荐范围：

1. 添加一个纯时间轴投影模块。
2. 仅输入现有快照 / AI 上下文 / 增长智能状态。
3. 输出最多8项。
4. 重用现有的里程碑ID和阈值。
5. 添加证据，`datePrecision`，和`basis`。
6. 仅在统计中显示时间线。
7. 在工作台中最多显示一个当前的里程碑。
8. 为空数据、第一条记录、连胜里程碑、周期里程碑、目标完成、重复抑制和证据安全添加测试。

请勿添加：


```text
AI Context field in P0
Memory field
Event database
Historical event storage
Sync collection
```

## P1：人工智能时间线意识

目标：让人工智能回答高级时间线问题。

推荐范围：

1. 添加仅运行时的 `ctx.growthTimeline`。
2. 最多包含 5 个紧凑项目。
3. 在 Memory 和 Report 前进行修剪。
4. 教练可以参考最重要的节点。
5. 除非明确要求，否则 AI 不得叙述完整的时间线。

测试应涵盖：

- 上下文注入。
- 预算削减。
- 候选者排除。
- 确认的内存语义。
- 没有原始用户文本泄露。

## P2：精确历史事件记录

目标：显示确切的成就日期。

现在不推荐这样做，因为这将需要讨论：

1. 一个新的事件模型。
2. 历史时间戳语义。
3. 同步和冲突规则。
4. 后端架构影响。
5. 长期噪声控制。

在没有单独的架构阶段的情况下不要实施这个。

# 10. 最终建议

* *有条件进行第21.3阶段。**

该产品拥有足够的现有数据来源，可以构建一个有意义的增长时间表作为运行时预测。

然而，它必须不变成：


```text
a second history database
a second Analytics engine
a second Memory system
a Sync-visible collection
```

推荐的下一步：

1. 将 P0 实现为一个有界的仅统计运行时时间线。
2. 保持工作台为今天加上一个里程碑提示。
3. 将 AI 上下文集成延迟到 P1。
4. 此阶段不要添加精确的历史事件存储。

这在保留现有架构的同时，弥补了主要的长期叙事空白。
