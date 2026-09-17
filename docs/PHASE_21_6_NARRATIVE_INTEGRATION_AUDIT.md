# Phase 21.6 · 成长叙事集成审计

Audit date: 2026-09-15
Scope: decision audit only.
No business code, Store schema, Sync protocol, Backend schema, Memory model, Analytics, GrowthIntelligence, or AI Context was modified.

## 1. 当前状态

**RESULT: NARRATIVE VALUE IS VALID, BUT USER EXPOSURE IS STILL TOO NARROW.**

The current chain is:

```text
CGStore
→ Analytics
→ GrowthIntelligence
→ GrowthTimeline.buildTimeline()
→ GrowthTimeline.buildNarrative()
→ Stats
```

The Narrative layer currently turns Timeline events into stages such as:

```text
起点
→ 稳定尝试
→ 稳定节奏
→ 投入积累
→ 阶段成果
→ 当前方向
```

It outputs:

```js
{
  version: "1.0",
  today: "YYYY-MM-DD",
  dataSufficient: true,
  summary: "成长阶段：起点 → 稳定尝试 → ...。",
  currentStage: {
    id: "stage:...",
    label: "...",
    meaning: "...",
    evidenceIds: [],
    confidence: 0-1
  },
  stages: []
}
```

The implementation is runtime-only. It is not persisted, synced, written into Memory, or injected into AI Context.

Current strength:

1. The projection is bounded.
2. Stage meanings use fixed copy.
3. Evidence IDs remain traceable.
4. Confidence stays within `0-1`.
5. It does not create historical dates that do not exist.

Current weakness:

The narrative is only visible in Stats. Stats is the correct home for the full long-term archive, but it is usually visited less often than Workbench. Therefore, the narrative does not yet reinforce daily motivation.

## 2. 产品价值审计

### 2.1 Long-Term Retention

**STATUS: NEED IMPROVEMENT.**

The narrative can improve retention because it converts isolated records into a visible progression. However, it currently lives only in Stats. A user who opens Workbench daily may not see it.

The product idea is good, but exposure is incomplete.

### 2.2 User Achievement

**STATUS: GOOD.**

The narrative helps users understand that goals, streaks, focus totals, and course completion are not isolated numbers. They become stages in a longer story.

This directly supports the desired feeling:

```text
原来我已经走了这么远。
```

### 2.3 Daily Usage Motivation

**STATUS: NEED IMPROVEMENT.**

Workbench currently focuses on today’s state, daily feedback, and next actions. That is correct, but it does not yet show continuity.

A light current-stage hint could connect today’s action to a longer arc:

```text
当前成长阶段：稳定尝试
```

This should be small. It should not replace today’s feedback.

### 2.4 AI Personalization

**STATUS: NOT READY FOR CONTEXT EXPANSION.**

AI already receives Analytics, Growth Intelligence, Goals, Memory, Report, and Daily Feedback. It can explain growth without a new Context field.

Adding the full Narrative now would risk duplication and increase Context size. The more useful next step is Workbench exposure.

### 2.5 Overall Product Value

**OVERALL: NEED IMPROVEMENT.**

The narrative concept is validated, but activation is incomplete. Stats proves the model; Workbench would activate daily perception.

## 3. 工作台审计

### 3.1 Current Workbench Responsibility

Workbench currently owns:

```text
Today’s status
Daily Feedback
Today’s actions
```

The Growth Brief already shows today’s changes, highlights, focus, and recommended actions. This boundary is correct.

### 3.2 Should Workbench Show `currentStage`?

**RECOMMENDATION: B — LIGHT HINT ONLY.**

Workbench should show one sentence:

```text
当前成长阶段：稳定尝试
```

It should not show the full Narrative.

### 3.3 Why Not Option A — No Integration

Option A would preserve the current boundary, but it would leave the narrative underused.

The user’s daily entry point would not benefit from the long-term progression. That weakens the retention value of Phase 21.5.

### 3.4 Why Not Option C — Full Narrative

Option C is too heavy.

Workbench should not become a historical archive page. Showing all stages, evidence, and meanings would:

1. Compete with Daily Feedback.
2. Increase cognitive load.
3. Duplicate Stats.
4. Shift Workbench away from action.

### 3.5 Recommended Workbench Presentation

Add one bounded line inside or near the existing Growth Brief:

```text
当前成长阶段：稳定尝试
```

Optional supporting sentence:

```text
你开始把记录变成一种节奏。
```

Rules:

1. Show only `currentStage`.
2. Do not render all stages.
3. Do not render evidence IDs.
4. Do not render a Timeline list.
5. If `dataSufficient` is false or `currentStage` is null, hide the hint.
6. Use `textContent`.
7. Keep the hint inside the existing Growth Brief, not as a new dashboard card.

### 3.6 Data Reuse Requirement

Future Workbench integration must not recompute GrowthIntelligence or Analytics unnecessarily.

It should consume the existing snapshot and already-derived Growth Brief state. If Timeline requires `personalBest` or `courseSummary`, these should be reused from the current snapshot and passed into the projection once.

The Workbench integration should not call Timeline multiple times per render.

## 4. AI 审计

### 4.1 Current AI Inputs

AI Context already includes:

```text
overview
trends
daily
todos
courses
goals
growth
growthState
memory
coach
report
dailyFeedback
```

The AI Coach already consumes:

1. Growth strengths.
2. Growth risks.
3. Goal recommendations.
4. Confirmed Memory.
5. Daily Feedback.
6. Growth Score and data sufficiency.

### 4.2 Does AI Need `ctx.growthNarrative` Now?

**RECOMMENDATION: NO.**

AI can already explain growth from existing fields.

For example:

| Narrative question | Existing AI input |
| --- | --- |
| “我最近稳定吗？” | `growthState.consistencyState` |
| “我有进步吗？” | `growth.trends`, `growthState.importantChanges` |
| “我完成了什么？” | `goals`, `courses`, Growth Report |
| “下一步做什么？” | `growthState.recommendedFocus`, `actionProposals`, Daily Feedback |
| “我有哪些长期规律？” | confirmed Memory |

The AI does not currently need a dedicated `growthNarrative` field to answer these questions.

### 4.3 Coherence Risk

One possible issue is that Stats uses fixed stage labels while AI may use its own language. This is acceptable for now because the user has not yet been promised that AI knows the exact stage labels.

If later the product wants AI to answer:

```text
我现在在哪个成长阶段？
```

then a compact runtime-only field may be added.

### 4.4 Future AI Context Shape

If AI integration becomes necessary, it should be compact:

```js
ctx.growthNarrative = {
  currentStage: {
    id: "stage:building",
    label: "稳定尝试",
    meaning: "你开始把记录变成一种节奏。"
  },
  summary: "成长阶段：起点 → 稳定尝试。"
};
```

It must be runtime-only.

It must not contain:

```text
stages[]
evidenceIds[]
confidence
version
today
raw user content
Memory content
```

unless a later phase proves those fields are necessary.

### 4.5 Trim Order If Added Later

If `ctx.growthNarrative` is added later, it should be treated as derived presentation data, not core fact.

Recommended trimming order:

1. Remove `summary`.
2. Remove `currentStage.meaning`.
3. Remove the entire `growthNarrative`.

Core Analytics facts, Goals, and active action context should survive longer than Narrative.

## 5. Context 成本

A read-only synthetic projection benchmark produced:

| Item | Result |
| --- | --- |
| Timeline nodes | 8 |
| Narrative stages | 5 |
| Full Narrative JSON | About 953 characters |
| Compact `currentStage + summary` JSON | About 105 characters |

Estimated Context impact:

| Design | Estimated cost |
| --- | --- |
| Full Narrative | About 250-400 tokens |
| Compact Narrative | About 40-90 tokens |

The full Narrative is not worth adding to AI Context. It duplicates data that AI already receives.

The compact version is technically cheap, but it should still wait until there is a real AI use case, such as users repeatedly asking:

```text
我现在在哪个阶段？
```

Do not add Context just for symmetry with UI.

## 6. Memory 边界

**RESULT: NARRATIVE IS NOT MEMORY.**

Narrative is a system-generated explanation derived from Timeline.

Memory is different:

```text
Candidate Memory
→ User confirmation
→ Confirmed Memory
→ AI reads as long-term fact or possible trend
```

Narrative must never be written into:

```text
user.memory
CGStore
Sync payload
Backend database
```

Reason:

1. Narrative stages are derived interpretations.
2. They are not user-confirmed facts.
3. They do not have the same lifecycle as Memory.
4. They do not require user confirmation.
5. Writing them into Memory would blur the boundary between explanation and evidence.

If the product later wants users to save a stage as a personal milestone, that must be a separate user-confirmed action and a separate architecture discussion.

## 7. UX 建议

### Stats

**STATUS: CORRECT.**

Stats should continue to own the full long-term archive.

Recommended content:

```text
成长轨迹
成长阶段摘要
Timeline nodes
```

This is already aligned with the product boundary.

### Workbench

**STATUS: SHOULD ADD LIGHT HINT.**

Workbench should show only:

```text
当前成长阶段：当前阶段名称
```

This connects today’s action to a longer progression without changing Workbench into a history page.

### AI

**STATUS: NO CONTEXT CHANGE NOW.**

AI should continue to explain using existing Context.

It should not display the full Narrative. It should answer personal questions and connect growth state to next actions.

Recommended AI language:

```text
根据你的记录，最近连续执行正在变得更稳定。
数据显示你的专注投入在增加。
可以先完成一个小目标，把这个节奏保持下去。
```

Forbidden AI language:

```text
你已经成为自律的人。
我已经完全了解你。
你一定会成功。
```

## 8. 安全审查

### 8.1 Over-Inference

Current Narrative copy is mostly safe because it uses bounded stage language.

Allowed:

```text
数据显示你正在形成更稳定节奏。
你开始把记录变成一种节奏。
投入已经转化为阶段性结果。
```

Forbidden:

```text
你已经成为自律的人。
你的习惯已经彻底养成。
你一定会持续进步。
```

Future integrations must keep this boundary.

### 8.2 Fabricated Completion Dates

The Timeline correctly avoids `completedAt` when the data model does not provide it.

Current output uses:

```text
asOf
```

This prevents the system from inventing a historical date.

Workbench and AI integrations must continue this rule.

### 8.3 Sensitive Content

Narrative uses fixed labels and existing Timeline IDs. It should not introduce:

```text
Goal titles
Course names
Book names
Todo text
Chat content
Prompt content
Authentication fields
```

Future AI Context should also remain count-based and stage-based, not raw-content-based.

### 8.4 Automatic Memory

Narrative must not promote itself into Memory.

Correct boundary:

```text
Narrative → UI only
Memory → Candidate + User confirmation + CGStore
```

## 9. 性能审查

A read-only synthetic benchmark for the current projection produced:

| Operation | 1000 runs |
| --- | --- |
| `buildTimeline()` | About `5.83ms` |
| `buildNarrative()` | About `4.29ms` |

Per-call approximate cost:

```text
buildTimeline: about 0.006ms
buildNarrative: about 0.004ms
```

This is negligible for UI.

Performance rules for next phase:

1. Reuse the existing snapshot.
2. Reuse already-derived Growth Intelligence state.
3. Do not call Analytics twice for the same Workbench render.
4. Do not call GrowthIntelligence twice for the same Workbench render.
5. Build Timeline and Narrative once per render.
6. Do not add a new cache layer.
7. Do not scan raw 365-day records inside the Narrative layer.

The Narrative layer itself is cheap because it only groups the existing bounded Timeline projection.

## 10. 最终建议

## Recommended Next Phase

**A. Phase 21.7 Workbench Integration**

### Why

The Narrative already has technical value, but it is underexposed. Workbench is the daily entry point. A light current-stage hint can improve motivation without increasing Context cost or changing architecture.

### Value

1. Connects today’s action to a long-term arc.
2. Improves daily perceived progress.
3. Reinforces retention without new features.
4. Uses an already safe runtime projection.

### Risk

Low if implementation stays bounded.

Main risks:

1. Workbench becoming too historical.
2. Duplicate Analytics computation.
3. Overclaiming habit formation.

These can be controlled by showing one sentence only.

### Implementation Scope

Phase 21.7 should include only:

1. Workbench Growth Brief integration.
2. Show `currentStage.label` as one light hint.
3. Optionally show `currentStage.meaning` only if it remains visually small.
4. Hide the hint when data is insufficient.
5. Reuse the existing snapshot and Growth Brief state.
6. Add unit and page tests.

Phase 21.7 should not include:

```text
AI Context expansion
Memory expansion
Store changes
Sync changes
Backend changes
Full Narrative in Workbench
New dashboard card
New persistent fields
```

AI Context integration should be deferred until real usage shows that users expect AI to answer exact stage questions.
