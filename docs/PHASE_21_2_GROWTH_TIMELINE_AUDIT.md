# Phase 21.2 · 成长时间线与里程碑体验审计

Audit date: 2026-09-15
Scope: read-only architecture and product-experience audit.
No runtime code, Store model, Memory model, Sync protocol, or Backend schema was modified.

## 1. 当前状态

**RESULT: NO UNIFIED TIMELINE YET, BUT EVENT SOURCES EXIST.**

The product can already describe growth from several angles, but it does not present one continuous long-term narrative.

Existing building blocks:

| Area | Current capability | Timeline relevance |
| --- | --- | --- |
| Analytics | Daily / weekly / monthly summaries, trends, streaks, activity map, activity distribution, personal best | Can prove first record, streak, period totals, and historical bests. |
| GoalEngine | Derives active / completed / expired / archived goals from the current snapshot | Can identify completed goals, but not the exact historical completion date. |
| Growth Intelligence | Computes 7 / 14 / 30 / 90 day trends, Growth Score, strengths, risks, consistency, and daily insight | Can identify period-based improvement and meaningful sustained change. |
| Growth Report | Builds daily, weekly, and monthly summaries with achievements, insights, challenges, recommendations | Provides narrative, but not a chronological growth surface. |
| Growth Memory | Derives habits, milestones, preferences, insights, candidates, confidence, and lifecycle | Contains milestone rules, but Memory must not become a timeline log. |
| Pages | Workbench shows today; Stats shows reports, trends, Memory, and personal best; AI explains trends, risks, goals, and long-term Memory | No page currently owns a unified Timeline experience. |

The current experience answers:

```text
How am I doing today?
How am I doing this week / month?
What patterns or risks exist?
```

It does not yet clearly answer:

```text
What growth nodes have I passed over time?
```

This is the main long-term narrative gap.

## 2. 数据来源分析

### 2.1 Analytics

Analytics is the only statistical source of truth and already exposes the most reliable event evidence:

- `getDailySummary(date, data)`
- `getWeeklySummary(opts, data)`
- `getMonthlySummary(year, month, data)`
- `getDateRangeSummary(startDate, endDate, data)`
- `getTrend(metric, startDate, endDate, mode, data)`
- `getStreaks(data, opts)`
- `getActivityMap(data, opts)`
- `getActivityDistribution(startDate, endDate, data)`
- `getPersonalBest(data, opts)`

Useful Timeline evidence includes:

| Evidence | Meaning |
| --- | --- |
| `firstRecordDate` | First recorded growth action. |
| `currentStreak` | Current consecutive growth period. |
| `longestStreak` | Historical consistency peak. |
| Period totals | Study, focus, exercise, reading, and task completion across 7 / 30 / 90 day windows. |
| Personal best | Single-day focus, study, sport, reading, or English records. |

Limitation:

Analytics knows record dates, but it does not currently expose a unified event model such as:

```js
{ eventType, occurredAt, sourceId, evidence }
```

Therefore, a Timeline should be a runtime projection, not a new stored event stream.

### 2.2 Goals

GoalEngine correctly derives goal status from the current data snapshot.

It can support milestones such as:

```text
Completed 1 goal
Completed 3 goals
Completed first course goal
```

However, goal completion is derived from the current value and target value. The data model does not reliably store a `completedAt` timestamp.

Consequence:

```text
Allowed: "截至今天，你已完成 N 个目标。"
Forbidden: "你在 2026-08-01 完成了目标。"
```

unless a future phase explicitly discusses adding a completion timestamp to the data model.

### 2.3 Growth Intelligence

Growth Intelligence already provides:

- 7 / 14 / 30 / 90 day trends.
- Growth Score.
- Positive signals and risk signals.
- Consistency state.
- Recommended focus.
- Daily insight.

It can support Timeline nodes such as:

```text
近 30 天学习投入上升
近 90 天专注节奏改善
连续记录达到 7 天
```

But these are period-derived observations, not exact dated events. They must be labeled as derived observations.

### 2.4 Growth Report

Reports already convert Analytics and Growth Intelligence output into user-readable summaries.

They are useful as narrative, but they are not a Timeline:

- Reports summarize a period.
- Timeline should show bounded growth nodes.
- Reports should remain the place for interpretation.

### 2.5 Growth Memory

Growth Memory already contains milestone rules, including:

- Streak thresholds: 7 / 30 / 90 days.
- 30-day learning threshold.
- 30-day focus threshold.
- Completed goal count.

Memory should not be expanded into a Timeline storage system.

Correct boundary:

```text
Memory: stable long-term facts confirmed or maintained by lifecycle.
Timeline: runtime projection of meaningful growth nodes.
```

## 3. 时间线设计

### 3.1 Principle

Timeline must be a pure runtime projection.

Recommended data flow:

```text
CGStore
→ Analytics snapshot
→ GrowthIntelligence snapshot
→ GoalEngine progress snapshot
→ GrowthMemory confirmed facts
→ Growth Timeline projection
→ UI
```

Forbidden data flow:

```text
Timeline → CGStore
Timeline → Memory
Timeline → Sync
Timeline → Backend
```

### 3.2 Runtime Shape

A future implementation should use a bounded structure:

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

Important fields:

| Field | Purpose |
| --- | --- |
| `type` | Separates milestone, improvement, habit, and record. |
| `datePrecision` | Avoids pretending that derived conclusions have exact event dates. |
| `observedAt` | Marks when the current snapshot supports the node. |
| `basis` | Separates observed record facts from derived interpretations. |
| `sourceId` | Stabilizes identity and prevents duplicate nodes. |
| `evidence` | Keeps the node explainable. |

### 3.3 Date Semantics

Timeline should support three date precisions:

| Value | Meaning | Example |
| --- | --- | --- |
| `day` | A real record date exists. | First recorded action. |
| `period` | The node belongs to a calculated range. | Last 30 days. |
| `asOf` | The node is true as of today, but the exact crossing date is unknown. | Completed goals. |

This is essential for honesty. Without it, the Timeline may present inferred facts as historical events.

### 3.4 Ordering And Caps

Recommended limits:

- UI Timeline: maximum 8 items.
- AI Context Timeline, if implemented later: maximum 5 items.
- Evidence per item: maximum 1 in Context, maximum 2 in UI.
- Prefer high-confidence and stable milestones over short-term volatility.

Recommended priority:

1. First record date.
2. Confirmed Memory milestones.
3. Current streak thresholds.
4. 30-day learning or focus breakthroughs.
5. Completed goals or courses.
6. Meaningful 30 / 90 day improvements.
7. Historical personal bests.

Short-term noise should not enter the Timeline.

## 4. 里程碑分析

### 4.1 True Growth Nodes

| Milestone | Source | Quality | Notes |
| --- | --- | --- | --- |
| First growth record | Analytics `getPersonalBest()` | Good | Honest onboarding and activation node. |
| Streak reaches 7 / 30 / 90 days | Analytics streaks + Growth Intelligence | Good | Already aligned with Memory milestone rules. |
| 30-day learning exceeds 600 minutes | Growth Intelligence | Good | Already defined. |
| 30-day focus exceeds 180 minutes | Growth Intelligence | Good | Already defined. |
| First completed goal | GoalEngine | Good with limitation | Can say “as of today”, not an exact historical date. |
| Multiple completed goals | GoalEngine | Good with limitation | Should use thresholds such as 3 / 10 to avoid noise. |
| Course completed | Analytics course summary / course status | Good | Useful for study narrative. |
| Book completed | Reading records | Good | Should require `pages >= totalPages`. |
| Historical personal best | Analytics `getPersonalBest()` | Conditional | Only if value passes a meaningful threshold; otherwise first small record becomes noise. |
| Sustained 30 / 90 day improvement | Growth Intelligence | Conditional | Must show evidence and period; not every small delta is a milestone. |

### 4.2 Non-Milestones

These should not be presented as growth nodes:

| Data | Reason |
| --- | --- |
| One completed todo | Operational action, not a long-term growth node. |
| One check-in | Too small unless part of a streak threshold. |
| Adding a goal | Intent, not achievement. |
| Preference confirmed by user | Personal context, not a growth event. |
| Candidate Memory | Unconfirmed possible trend; cannot be shown as fact. |
| Short-term volatile change | Insufficient stability. |
| Declining trend | Important as risk, not as milestone. |
| AI recommendation | A suggestion, not something the user achieved. |

### 4.3 Duplicate Control

Growth Memory already has stable milestone IDs such as:

```text
milestone:streak_7
milestone:streak_30
milestone:streak_90
milestone:learning_600_30d
milestone:focus_180_30d
milestone:goal_completed
```

Timeline should reuse or align with these IDs.

Rules:

1. One `sourceId` appears only once.
2. Show the highest reached streak threshold instead of repeating all lower thresholds when space is limited.
3. Do not create a new node every time the user opens Stats.
4. Do not persist “already shown” state in this phase.

## 5. Context 影响

### 5.1 Current State

`aiContext.js` already exposes:

- `overview`
- `trends`
- `growth`
- `growthState`
- `memory`
- `coach`
- `report`
- `dailyFeedback`

AI already has enough material to explain recent progress and long-term patterns.

Therefore, `ctx.growthTimeline` is not required for P0.

### 5.2 Future Option

If AI later needs to answer questions such as:

```text
我有哪些长期成长节点？
我的成长时间线是什么？
```

then a runtime-only field could be added:

```js
ctx.growthTimeline = {
  version: "1.0",
  today: "2026-09-15",
  dataSufficient: true,
  items: []
};
```

Rules if implemented later:

1. Runtime only.
2. Maximum 5 items in Context.
3. Maximum one evidence object per item.
4. Do not include rejected or expired Memory.
5. Do not include raw user text.
6. Do not include candidate Memory as fact.
7. Trim `growthTimeline` before `report`, `memory`, or core Analytics facts.

Estimated Context increase:

| Design | Estimated increment |
| --- | --- |
| 3 compact milestone items | About 180-220 tokens. |
| 5 compact milestone items | About 250-320 tokens. |
| 8 full items with descriptions | Too large for AI Context. |

The safe upper bound is 5 compact items.

## 6. UX 建议

### Workbench

Workbench should remain focused on today.

Recommended content:

```text
今日成长反馈
当前连续记录
最多 1 条里程碑提示
```

Recommended copy:

```text
你已连续记录 7 天。
```

Avoid:

```text
你的完整成长时间线
```

Workbench should not become a history page.

### Stats

Stats is the correct owner of the Timeline.

Recommended placement:

```text
成长分析中心
├─ 趋势解读
├─ 成长报告
├─ 成长时间线
├─ 成长轨迹 / Memory
├─ 趋势图表
└─ 个人最佳
```

Recommended Timeline section:

```text
成长时间线
截至 2026-09-15

第一次成长记录：2025-12-01
连续成长达到 30 天：截至今天
近 30 天学习投入达到 600 分钟：截至今天
已完成 3 个目标：截至今天
```

Interaction:

1. Default: show 5-8 items.
2. Empty state: explain that one recorded action starts the Timeline.
3. Node tap or hover: show evidence in user language.
4. No modal or dashboard expansion in P0.

### AI

AI should interpret the Timeline, not duplicate it as a full list.

Recommended:

```text
根据记录，你最近最重要的变化是连续成长达到 7 天。
```

Forbidden:

```text
我完全了解你的成长历程。
```

AI should distinguish:

| Data type | Language boundary |
| --- | --- |
| Analytics record fact | “根据你的记录” |
| Period-derived observation | “数据显示” |
| Confirmed Memory | “你已形成” |
| Candidate Memory | “系统发现一个可能趋势” |
| Recommendation | “可以尝试” |

## 7. 性能

A one-time synthetic Node benchmark used 365 days of local test data:

| Analytics operation | Approximate result |
| --- | --- |
| 365-day `getDateRangeSummary` | About 3.6 ms |
| 365-day `getTrend('activity')` | About 2.8 ms |
| 365-day `getActivityMap` | About 3.8 ms |
| 365-day `getStreaks` | About 0.7 ms |
| 365-day `getPersonalBest` | About 4.1 ms |

For the same synthetic data, `GrowthIntelligence.computeGrowthState()` took about 125 ms in Node.

Interpretation:

1. Analytics calls over 365 days are not the main bottleneck.
2. Growth Intelligence is more expensive because it computes multiple windows and metrics.
3. Timeline must consume the already-computed AI Context or Growth Intelligence snapshot.
4. Timeline must not call `computeGrowthState()` again.
5. Timeline must not transform every active day into a node.
6. A capped projection of 8 UI items should have negligible render cost.

Recommended implementation constraints:

```text
Max UI items: 8
Max AI Context items: 5
Max evidence per UI item: 2
Max evidence per Context item: 1
No second Analytics pass
No second GrowthIntelligence pass
No new cache layer
```

## 8. 安全

### 8.1 Inferred Facts Versus Recorded Facts

Timeline must label its basis.

| Basis | Allowed presentation |
| --- | --- |
| `observed` | Real record dates or values. |
| `derived` | Aggregated period conclusions. |
| `confirmed-memory` | User-confirmed long-term fact. |

Forbidden:

```text
You completed this milestone on YYYY-MM-DD
```

when only a period conclusion is available.

### 8.2 Evidence Boundary

Allowed evidence sources:

```text
Analytics
GrowthIntelligence
Goals
```

Forbidden evidence sources:

```text
AI generated
Chat content
Prompt content
Candidate Memory as fact
Rejected Memory
Expired Memory
```

### 8.3 User Content

Timeline should avoid raw todo text, course notes, book names, or other free-form user content in AI Context.

Recommended:

```text
完成了 1 个目标。
```

Avoid:

```text
完成了目标：<raw user goal text>
```

For local UI, any user-provided label must still be rendered with `textContent`, not HTML concatenation.

### 8.4 Memory Pollution

Timeline must not write to:

```text
CGStore
user.memory
Sync payload
Backend schema
```

It must also not promote:

```text
candidate → confirmed
derived trend → confirmed Memory
```

Memory promotion remains governed by the existing user confirmation flow.

## 9. P0 / P1 / P2 计划

### P0: Runtime Timeline Projection

Goal: create a bounded read-only Timeline for Stats.

Recommended scope:

1. Add a pure Timeline projection module.
2. Input only existing snapshot / AI Context / Growth Intelligence state.
3. Output maximum 8 items.
4. Reuse existing milestone IDs and thresholds.
5. Add evidence, `datePrecision`, and `basis`.
6. Show Timeline only in Stats.
7. Show at most one current milestone in Workbench.
8. Add tests for empty data, first record, streak milestones, period milestones, goal completion, duplicate suppression, and evidence safety.

Do not add:

```text
AI Context field in P0
Memory field
Event database
Historical event storage
Sync collection
```

### P1: AI Timeline Awareness

Goal: let AI answer high-level Timeline questions.

Recommended scope:

1. Add runtime-only `ctx.growthTimeline`.
2. Cap at 5 compact items.
3. Trim before Memory and Report.
4. Coach can reference the most important node.
5. AI must not narrate the full Timeline unless explicitly asked.

Tests should cover:

- Context injection.
- Budget trimming.
- Candidate exclusion.
- Confirmed Memory semantics.
- No raw user text leakage.

### P2: Exact Historical Event Log

Goal: show exact achievement dates.

This is not recommended now because it would require discussing:

1. A new event model.
2. Historical timestamp semantics.
3. Sync and conflict rules.
4. Backend schema impact.
5. Long-term noise control.

Do not implement this without a separate architecture phase.

## 10. 最终建议

**CONDITIONAL GO FOR PHASE 21.3.**

The product has enough existing data sources to build a meaningful Growth Timeline as a runtime projection.

However, it must not become:

```text
a second history database
a second Analytics engine
a second Memory system
a Sync-visible collection
```

Recommended next step:

1. Implement P0 as a bounded Stats-only runtime Timeline.
2. Keep Workbench to today plus one milestone hint.
3. Delay AI Context integration to P1.
4. Do not add exact historical event storage in this phase.

This preserves the existing architecture while closing the main long-term narrative gap.
