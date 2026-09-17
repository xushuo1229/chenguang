# Phase 21.4 · 里程碑叙事审计

Audit date: 2026-09-15
Scope: read-only product and architecture audit.
No business code, Store model, Memory model, Sync protocol, AI Context, or Backend schema was modified.

## 1. 当前状态

**RESULT: TIMELINE HAS RELIABLE EVENTS, BUT NOT YET A LONG-TERM NARRATIVE.**

The current Growth Timeline is a bounded runtime projection. It is no longer a raw data dump because each node has:

```text
id
type
title
description
source
asOf
confidence
```

It uses fixed user-language copy, source and type whitelists, a maximum of 8 nodes, and avoids invented completion dates. This is a good foundation.

However, the Timeline still answers:

```text
What happened?
```

It does not yet clearly answer:

```text
What stage am I in?
Why do these events matter together?
How does this connect to my recent direction?
```

So the current experience is best described as:

```text
Milestone List
```

rather than:

```text
Long-term Growth Narrative
```

The next step is not more data. The next step is a narrative projection that groups existing Timeline nodes into stages and meanings.

## 2. 时间线分析

### 2.1 Current Event Sources

`js/growthTimeline.js` currently derives nodes from:

| Source | Data used | Current node type |
| --- | --- | --- |
| Analytics | First record date | `achievement` |
| Analytics | Current streak | `milestone` |
| Analytics | Completed courses | `achievement` |
| Goals | Completed goal count | `achievement` |
| GrowthIntelligence | 30-day learning / focus / reading / exercise summaries | `milestone` or `progress` |
| GrowthIntelligence | Positive important changes | `progress` |
| GrowthIntelligence | Active days over 30 days | `consistency` |

Reports are not used directly as event sources. That is acceptable because Reports already derive from Analytics, Goals, and Growth Intelligence. Reports should remain narrative summaries, not duplicate event sources.

Memory is not used as a Timeline source. This is also correct for the current phase because Memory is a long-term confirmed pattern layer, while Timeline is a runtime projection.

### 2.2 Event Credibility

Current credibility controls are appropriate:

1. Source is limited to `Analytics`, `Goals`, and `GrowthIntelligence`.
2. Type is limited to `achievement`, `milestone`, `progress`, and `consistency`.
3. Confidence is bounded between 0 and 1.
4. Stable IDs prevent duplicate nodes.
5. The output is capped at 8 items.
6. Goal completion uses `asOf` because no `completedAt` exists.
7. Positive trends use language such as “数据显示”.

Current weaknesses:

1. Nodes are independent; there is no stage grouping.
2. The user must infer the connection between first record, streak, accumulation, and achievement.
3. Some nodes use milestone language without showing the broader phase.
4. Trend and consistency nodes can feel repetitive if they are adjacent.
5. The Timeline can show what happened, but not why the sequence matters.

### 2.3 Is It Just A Data List?

No. It is more than a raw data list because it already has fixed human-readable titles and descriptions.

But it is not yet a full narrative because it does not expose a progression such as:

```text
起点 → 稳定尝试 → 投入积累 → 阶段成果 → 当前方向
```

The missing layer is not a new data source. It is a derived presentation and interpretation layer.

## 3. 里程碑分析

### 3.1 High-Value Milestones

These represent meaningful growth nodes and should remain central to the Timeline.

| Milestone | Existing source | Narrative meaning |
| --- | --- | --- |
| First growth record | Analytics `firstRecordDate` | The growth archive has a starting point. |
| Streak reaches 7 days | Analytics current streak | The user is testing a repeatable rhythm. |
| Streak reaches 30 days | Analytics current streak | A stable rhythm is forming. |
| Streak reaches 90 days | Analytics current streak | Execution has become sustained. |
| Learning reaches 600 minutes in 30 days | Growth Intelligence | Learning has moved from isolated actions to accumulated effort. |
| Focus reaches 180 minutes in 30 days | Growth Intelligence | Attention investment has become measurable. |
| First completed goal | GoalEngine | Intent has become a visible result. |
| Multiple completed goals | GoalEngine | Goal completion is becoming a repeatable pattern. |
| Course stage completed | Analytics course summary | Learning progress has reached a concrete stage. |

These are high value because they require either repetition, accumulation, or completion.

### 3.2 Medium-Value Events

These can support the narrative but should not dominate it.

| Event | Source | Caution |
| --- | --- | --- |
| Reading reaches 200 pages in 30 days | Growth Intelligence | Good accumulation signal, but lower stakes than learning or focus. |
| Exercise reaches 300 minutes in 30 days | Growth Intelligence | Good lifestyle signal, but should not be framed as medical advice. |
| English learning improves | Growth Intelligence | Useful direction signal if sustained. |
| 90-day positive trend | Growth Intelligence | Important, but should remain a derived observation. |
| Weekly report achievements | Growth Report | Good for narrative wording, but not a separate event source. |
| Monthly report achievements | Growth Report | Useful for retrospective framing, not a new event stream. |

Medium-value events should be used to enrich a phase, not to create many separate Timeline cards.

### 3.3 Ordinary Behavior Records

These should usually remain in daily feedback or reports.

| Event | Why it is not a milestone |
| --- | --- |
| One check-in | Operationally useful, but too small for a long-term node. |
| One completed todo | Task progress, not a growth stage. |
| One sport session | Should feed accumulation, not be displayed as a milestone. |
| Adding a goal | This is intent, not achievement. |
| One positive day | Insufficient evidence for a narrative claim. |
| A confirmed preference | Personal context, not a growth event. |
| A candidate Memory | Unconfirmed trend; must not be treated as fact. |

Ordinary records are still important, but they belong in the daily feedback layer.

## 4. 叙事设计

### 4.1 Core Model

A narrative layer can be built without new storage:

```text
Event
→ Stage
→ Meaning
```

The important addition is not another milestone calculation. It is grouping existing nodes by the stage they represent.

### 4.2 Recommended Stages

| Stage | Contributing events | Narrative meaning |
| --- | --- | --- |
| 起点 | First record | “你的成长档案开始形成。” |
| 稳定尝试 | Streak reaches 7 days; active days building | “你开始把记录变成一种节奏。” |
| 稳定节奏 | Streak reaches 30 days; active days strong | “连续执行正在变得更稳定。” |
| 投入积累 | Learning 600 minutes; focus 180 minutes; reading or exercise totals | “记录开始转化为可观察的投入。” |
| 阶段成果 | Completed goals; completed courses | “投入已经转化为阶段性结果。” |
| 当前方向 | Positive 30 / 90 day trends | “数据显示当前节奏正在产生变化。” |

### 4.3 Example Narrative Projection

A runtime narrative summary could look like:

```js
{
  version: "1.0",
  today: "2026-09-15",
  stages: [
    {
      id: "stage:start",
      label: "起点",
      meaning: "你的成长档案开始形成。",
      evidenceIds: ["timeline:first_record"],
      confidence: 0.9
    },
    {
      id: "stage:building",
      label: "稳定尝试",
      meaning: "你开始把记录变成一种节奏。",
      evidenceIds: ["timeline:streak_7"],
      confidence: 0.88
    },
    {
      id: "stage:accumulation",
      label: "投入积累",
      meaning: "专注和学习记录开始形成阶段性的投入。",
      evidenceIds: ["timeline:focus_180_30d", "timeline:learning_600_30d"],
      confidence: 0.92
    }
  ]
}
```

This remains a projection. It should not be persisted unless a future phase explicitly discusses a new product model.

### 4.4 Copy Boundary

Allowed:

```text
你的成长档案开始形成。
连续记录正在形成节奏。
数据显示学习投入正在增加。
这些记录开始转化为阶段成果。
```

Forbidden:

```text
你已经彻底改变。
你已经养成了所有习惯。
你一定会成功。
AI完全了解你。
这是你的命运转折点。
```

The narrative should feel encouraging, but it must not turn derived observations into absolute life conclusions.

### 4.5 UI Versus AI Responsibility

| Layer | Responsibility |
| --- | --- |
| UI Timeline | Show stage labels and short fixed meanings. |
| UI Milestone node | Show factual evidence and `asOf`. |
| Workbench | Show today plus at most one current stage hint. |
| Stats | Own the long-term Timeline and narrative grouping. |
| AI Coach | Explain the user’s current phase and connect it to risks, strengths, and next actions. |
| AI Conversation | Answer personal questions using Context, without repeating a full Timeline card. |

The UI should provide the stable narrative scaffold. AI should provide interpretation and next-step meaning.

## 5. UX 建议

### Workbench

Workbench should remain today-focused.

Recommended:

```text
今日成长反馈
当前成长阶段
最多一个里程碑提示
```

Example:

```text
当前阶段：稳定尝试
你已经开始连续记录。
```

Avoid:

```text
完整成长轨迹
历史报告
多个 Timeline 卡片
```

Workbench should make the user feel continuity, not overwhelm them with history.

### Stats

Stats should own the long-term growth archive.

Current Timeline section is useful, but it presents nodes linearly. A better structure would be:

```text
成长轨迹
├─ 起点
│  └─ 第一次成长记录
├─ 稳定尝试
│  └─ 连续成长达到 7 天
├─ 投入积累
│  ├─ 近 30 天专注达到 180 分钟
│  └─ 近 30 天学习达到 600 分钟
└─ 阶段成果
   └─ 目标已完成
```

Recommended UI rules:

1. Keep the section inside Stats.
2. Keep the maximum at 8 nodes.
3. Group nodes by stage.
4. Show one short stage meaning, not a paragraph.
5. Keep `asOf` visible.
6. Keep source hidden by default.
7. Use the same visual language as the existing insight cards.

### AI

AI should not display the full Timeline again.

AI should answer:

```text
我最近在哪个阶段？
我的成长轨迹说明什么？
我应该怎么进入下一阶段？
```

AI can connect:

```text
阶段性投入
→ 当前优势
→ 当前风险
→ 下一阶段建议
```

Example AI response:

```text
从记录看，你已经从“开始记录”进入“稳定尝试”阶段。
数据显示你的专注投入正在增加。
下一步可以继续保持当前节奏，并把它和一个小目标连接起来。
```

This is narrative interpretation, not a new event source.

## 6. 数据影响

### 6.1 Current Projection Fields

The current node shape is sufficient for a Timeline list:

```js
{
  id,
  type,
  title,
  description,
  source,
  asOf,
  confidence
}
```

It is also sufficient for a first narrative grouping layer because `id` and `type` can map nodes to stages.

### 6.2 `milestoneId`

Not required as a new persisted field.

The existing `id` already works as a stable milestone identifier:

```text
timeline:first_record
timeline:streak_7
timeline:streak_30
timeline:goal_completed_1
timeline:focus_180_30d
```

If a narrative stage is added, it can reference these IDs without changing the Store.

### 6.3 `completedAt`

Not recommended now.

Goal and course completion are currently derived from the current snapshot. Without a reliable historical timestamp, the Timeline correctly uses:

```text
asOf
```

Adding `completedAt` would require:

1. A clear definition of completion time.
2. A migration and compatibility plan.
3. Sync conflict rules.
4. Backend schema discussion.
5. Rules for old records that have no timestamp.

This should not be introduced just to improve wording.

### 6.4 `createdAt`

Not required.

Timeline is runtime-only. If a narrative projection is generated on each Stats load, it does not need a persisted creation timestamp.

### 6.5 Runtime Projection Sufficiency

Runtime projection remains sufficient.

Recommended future runtime-only shape:

```js
{
  version: "1.0",
  today: "YYYY-MM-DD",
  stages: [
    {
      id: "stage:accumulation",
      label: "投入积累",
      meaning: "专注和学习记录开始形成阶段性的投入。",
      evidenceIds: ["timeline:focus_180_30d"],
      confidence: 0.92
    }
  ]
}
```

No Store, Memory, Sync, or Backend change is needed.

## 7. AI Context 影响

### 7.1 Do We Need `ctx.growthTimeline` Now?

No.

AI already has enough material to explain growth:

```text
ctx.overview
ctx.growth
ctx.growthState
ctx.memory
ctx.coach
ctx.report
ctx.dailyFeedback
```

AI can already discuss streaks, completed goals, trends, strengths, risks, and reports. Adding the full Timeline now would likely duplicate Context and increase token cost.

### 7.2 When A Context Field Becomes Justified

`ctx.growthTimeline` or `ctx.growthNarrative` becomes justified only if the product wants AI to answer dedicated questions such as:

```text
我处在哪个成长阶段？
我的成长轨迹说明什么？
```

Even then, the Context should not receive all 8 Timeline nodes.

Recommended future Context shape:

```js
ctx.growthNarrative = {
  version: "1.0",
  today: "YYYY-MM-DD",
  stages: []
};
```

Rules:

1. Runtime-only.
2. Maximum 3 stages.
3. Each stage has one fixed meaning.
4. Each stage references at most 2 existing Timeline IDs.
5. No raw user content.
6. No candidate Memory as fact.
7. No persistence.
8. Trim before Report and Memory.

Estimated token cost:

| Design | Estimated increment |
| --- | --- |
| 3 compact stages | About 180-260 tokens |
| 5 stages with descriptions | About 300-420 tokens |
| Full 8-node Timeline | Too redundant for AI Context |

### 7.3 Current Recommendation

For P0, do not add AI Context.

Build the narrative projection for Stats first. If real usage shows that users expect AI to explain the stage, add a compact `growthNarrative` runtime field in P1.

## 8. 性能

The current Timeline projection is lightweight because it consumes:

1. Existing Growth Intelligence state.
2. Existing Analytics `getPersonalBest()` result.
3. Existing course summary.
4. Existing goal summary.

It does not call Analytics or Growth Intelligence again.

The Phase 21.3 benchmark used synthetic 365-day data:

| Operation | Result |
| --- | --- |
| Timeline projection, 1000 runs, p50 | About `0.0041ms` |
| Timeline projection, 1000 runs, p95 | About `0.0109ms` |

A narrative grouping layer should remain fast if it only groups the existing 8 Timeline nodes.

Performance rules:

1. Do not recompute Growth Intelligence for narrative.
2. Do not call `getPersonalBest()` twice.
3. Do not scan raw records in the narrative layer.
4. Do not generate one node per active day.
5. Keep UI grouped to the same 8-node maximum.
6. Keep any future AI Context to 3 compact stages.

## 9. 安全

### 9.1 Fabricated Growth

Current controls are strong:

1. Fixed source whitelist.
2. Fixed type whitelist.
3. Stable IDs.
4. Bounded confidence.
5. No historical date invention.
6. No raw user text.

A narrative layer must not introduce fabricated progress.

Allowed:

```text
数据显示投入正在增加。
目标已完成。
连续记录正在形成节奏。
```

Forbidden:

```text
你已经成为优秀的人。
你正在彻底改变人生。
AI保证你会进步。
```

### 9.2 Trends As Facts

Trend-derived nodes must remain observations.

Allowed:

```text
数据显示专注时长上升。
近期出现改善信号。
```

Forbidden:

```text
你的专注习惯已经形成。
你的学习问题已经解决。
```

Only confirmed Memory may use stronger “你已经形成稳定习惯” language.

### 9.3 Automatic Memory

The narrative layer must not write Memory.

Correct flow remains:

```text
Analytics
→ Growth Intelligence
→ Timeline / Narrative projection
→ UI
```

and, for Memory:

```text
Growth Intelligence
→ Candidate Memory
→ User confirmation
→ GrowthMemory
→ CGStore
```

Timeline should never promote itself into Memory.

### 9.4 Sensitive Content

The narrative layer should avoid:

1. Goal titles.
2. Course names.
3. Book names.
4. Todo text.
5. Chat content.
6. Prompt content.
7. Authentication fields.

Counts and fixed labels are safer than raw user content.

If UI later displays a user-provided label, it must still be rendered with `textContent`, not HTML concatenation.

## 10. P0 / P1 / P2 计划

### P0: Narrative Stage Projection

Goal: turn the current Timeline from a node list into a stage-based narrative.

Recommended scope:

1. Keep `js/growthTimeline.js` as the only Timeline projection module.
2. Add a runtime narrative grouping output, for example `buildNarrative()`.
3. Map existing Timeline IDs to stages.
4. Add one fixed meaning per stage.
5. Show grouped stages only in Stats.
6. Keep Workbench to today plus one current stage hint.
7. Add tests for stage mapping, empty data, evidence IDs, confidence bounds, and copy safety.

P0 should not:

```text
add AI Context
add Memory fields
add Store fields
change Sync
change Backend
add exact completedAt
```

### P1: Compact AI Narrative

Goal: let AI explain the user’s current stage.

Recommended scope:

1. Add runtime-only `ctx.growthNarrative`.
2. Maximum 3 stages.
3. Each stage has one short meaning.
4. Each stage references at most 2 Timeline IDs.
5. Trim before Report and Memory.
6. AI can use it for interpretation and next-step advice.

Tests should cover:

1. Context injection.
2. Runtime-only behavior.
3. Budget trimming.
4. No candidate Memory as fact.
5. No raw user text.
6. No Store mutation.

### P2: Historical Event Semantics

Goal: support exact historical dates such as:

```text
2026-08-01 完成 3 个目标
```

This should not be implemented now because it requires:

1. A historical event model.
2. `completedAt` semantics.
3. Backend schema changes.
4. Sync conflict rules.
5. Compatibility behavior for old records.

This is a separate architecture discussion.

## 11. 最终建议

**CONDITIONAL GO FOR NARRATIVE LAYER, BUT NOT FOR AI CONTEXT YET.**

The current Timeline is technically safe and bounded, but it is not yet a long-term narrative.

Recommended next phase:

1. Add a P0 runtime narrative grouping layer.
2. Keep it inside `js/growthTimeline.js`.
3. Show grouped stages only in Stats.
4. Keep Workbench focused on today.
5. Let AI interpret growth only after a compact runtime narrative field is justified.
6. Do not add completedAt, createdAt, new storage, Memory extension, Sync changes, or Backend schema changes.

This creates the feeling of:

```text
原来我已经走了这么远。
```

while preserving honest data boundaries and the existing architecture.
