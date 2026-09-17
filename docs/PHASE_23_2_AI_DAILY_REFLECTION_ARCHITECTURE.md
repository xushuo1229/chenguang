# Phase 23.2 AI Daily Reflection Architecture

Date: 2026-09-17
Baseline: `9c49ec8 feat: add AI growth context layer`
Status: READ-ONLY ARCHITECTURE DESIGN

---

## 1. Current AI Capability

### 1.1 Data Foundation (already available)

| 数据 | 来源 | 已接入 AI | 可支撑 Reflection |
|------|------|----------|-----------------|
| 今日任务完成率/数量 | `growthContext.taskSummary` | ✅ `ctx.growthContext` | ✅ 直接可用 |
| 今日专注/学习/运动分钟 | `growthContext.focusSummary` | ✅ | ✅ 直接可用 |
| 连续打卡天数 | `growthContext.streaks` | ✅ | ✅ 直接可用 |
| 7 天趋势环比（study/focus/exercise/english/todos） | `aiContext.trends.days7` | ✅ | ✅ 直接可用 |
| 活跃目标 + 进度 + 风险 | `aiContext.goals` + `growthContext.goals` | ✅ | ✅ 直接可用 |
| 正向/风险信号 | `growthContext.signals` | ✅ | ✅ 直接可用 |
| 今日亮点/变化/下一步 | `ctx.dailyFeedback`（`dailyFeedback.js` 规则引擎） | ✅ | ✅ 直接可用 |
| Coach Memory | `ctx.memory`（`growthMemory.js`） | ✅ | ✅ 可用于长期观察 |
| Growth Score | `growthState.overall` + `growth.score` | ✅ | ✅ 可用于整体评价 |

### 1.2 Verdict

**数据基础完全具备。** `GrowthContext` + `dailyFeedback` + `trends.days7` + `goals` 已提供生成高质量 Daily Reflection 所需的全部输入。不需要新增数据采集层。

### 1.3 Current Gap (why Reflection doesn't exist yet)

当前 AI 是**被动对话模式**（用户提问 → AI 回答）。缺少**主动反馈模式**（AI 在特定时机生成结构化复盘，无需用户提问）。这是产品形态差异，不是数据缺失。

---

## 2. Product Definition

### What It Is

AI Daily Reflection 是**成长闭环中的反馈层**：

```
用户行为 → Analytics → GrowthContext → AI Reflection → 用户调整 → 新行为
```

它是一个**结构化、可预期的每日总结卡片**，不是自由聊天。

### What It Is NOT

| 不是 | 原因 |
|------|------|
| Chat | 无需用户输入，AI 主动生成 |
| Todo | 不修改任务，只评论和建议 |
| Statistics Dashboard | 不是原始数据展示，是解释和建议 |
| 新数据系统 | 复用 GrowthContext + Analytics，不新增存储 |

### It IS

> 用户每天花 30 秒读一段 AI 生成的复盘，了解自己今天做了什么、趋势如何、明天应该注意什么。

---

## 3. Data Flow

### Reflection Input (Prompt Context)

```
┌───────────────────────────────────────────────┐
│           Reflection Prompt Context           │
├───────────────────────────────────────────────┤
│  growthContext.taskSummary                     │  ← 今日任务（必须）
│  growthContext.focusSummary                    │  ← 今日专注/学习/运动（必须）
│  growthContext.streaks                         │  ← 连续打卡（必须）
│  growthContext.signals.positive / risks        │  ← 规则信号（必须）
│  growthContext.suggestions                     │  ← 规则建议（必须）
│  aiContext.trends.days7                        │  ← 7 天环比（必须，支撑成长观察）
│  aiContext.goals.active (top 3)                │  ← 活跃目标（必须）
│  dailyFeedback.highlights / changes / nextActions │ ← 规则反馈（必须）
│  memory.confirmed (top 3)                      │  ← 长期记忆（可选）│
│  user input (optional)                         │  ← 用户补充（如"今天很累"）│
└───────────────────────────────────────────────┘
```

### What NOT to include in Prompt

| 排除 | 原因 |
|------|------|
| 任务原文（text） | 用户内容，默认不传；统计足够 |
| 全量 30 天/90 天趋势 | 增大 token 但对"今日复盘"帮助有限 |
| 课程列表明细 | 最多传 `study.courseCount` 和 `averageCourseProgress` |
| 历史对话记录 | Reflection 应独立于对话上下文 |
| Coach Memory candidates | 未确认的可能趋势，不作为事实 |

---

## 4. Reflection Schema

### Recommended Output Structure

```json
{
  "version": "1.0",
  "generatedAt": "2026-09-17T15:00:00Z",
  "date": "2026-09-17",

  "summary": {
    "title": "稳步推进的一天",
    "overview": "今天完成了 6/8 项任务，专注 45 分钟，学习 30 分钟。整体保持稳定节奏。"
  },

  "performance": {
    "tasks": {
      "total": 8,
      "completed": 6,
      "completionRate": 75,
      "pending": 2,
      "yesterdayPending": 1
    },
    "focus": {
      "minutes": 45,
      "activeToday": true
    },
    "learning": {
      "studyMinutes": 30,
      "exerciseMinutes": 0
    },
    "streak": {
      "current": 5,
      "todayDone": true
    }
  },

  "insights": [
    {
      "type": "trend",
      "message": "过去 7 天专注时间比上周增长 20%"
    },
    {
      "type": "risk",
      "message": "晚间任务完成率下降，有 2 项任务推迟到明天"
    },
    {
      "type": "goal",
      "message": "「学习 JavaScript」目标进度 45%，剩余 14 天"
    }
  ],

  "suggestions": [
    {
      "priority": 1,
      "text": "明天上午优先完成剩余的 2 项任务"
    },
    {
      "priority": 2,
      "text": "安排 30 分钟运动，保持运动连续性"
    },
    {
      "priority": 3,
      "text": "晚上减少新增任务，避免堆积"
    }
  ]
}
```

### Field Specification

| 字段 | 来源 | 必须性 | AI 生成 |
|------|------|--------|--------|
| `summary.title` | AI（基于数据主题） | 必须 | ✅ AI |
| `summary.overview` | AI（1-2 句总结） | 必须 | ✅ AI |
| `performance.tasks.*` | `growthContext.taskSummary` | 必须 | ❌ 规则直传 |
| `performance.focus.*` | `growthContext.focusSummary` | 必须 | ❌ 规则直传 |
| `performance.learning.*` | `growthContext.focusSummary` | 必须 | ❌ 规则直传 |
| `performance.streak.*` | `growthContext.streaks` | 必须 | ❌ 规则直传 |
| `insights[]` | AI（基于 trends + signals + goals） | 必须 | ✅ AI |
| `suggestions[]` | AI（基于 growthContext.suggestions + trends） | 必须 | ✅ AI |

**关键设计**：`performance` 区块由**规则引擎直传**（不经过 AI），确保数据始终真实。AI 只生成 `summary`、`insights`、`suggestions` 三个字段。

---

## 5. Prompt Architecture

### Proposed Prompt Structure

```
System Prompt（新增 Reflection 专用版本）
    |
    ├── 教练人设（复用现有）
    ├── 只读铁律（复用现有）
    ├── Reflection 专用指令（新增）：
    │     - "请基于以下数据生成今日复盘"
    │     - "summary.title 不超过 10 字"
    │     - "summary.overview 不超过 60 字"
    │     - "insights 不超过 3 条"
    │     - "suggestions 不超过 3 条，按优先级排序"
    │     - "不要编造数据块中没有的数字"
    │     - "不要输出与数据无关的鸡汤"
    │
    ├── <context> 数据块（复用现有 buildContextBlock）
    │     └── 精简版 growthContext + trends.days7 + goals.top3 + dailyFeedback
    │
    └── Output Format Instruction:
          "请严格按以下 JSON 格式返回：
           { 'summary': {...}, 'insights': [...], 'suggestions': [...] }"
```

### How to Prevent Common Issues

| 问题 | 防御机制 |
|------|---------|
| 输出格式漂移 | 后端解析 AI 返回 JSON；解析失败则回退到规则引擎生成的默认 Reflection（`dailyFeedback.js` + `growthContext.suggestions`） |
| 无意义鸡汤 | System Prompt 明确指示"不要输出与数据无关的鼓励"；空数据时输出"今天还没有记录" |
| 编造数据 | System Prompt"事实与推测必须分开"；`performance` 区块由前端直传（非 AI 生成），AI 无法篡改 |
| 过度评价用户 | 措辞约束"温和、具体、可执行"；禁止负面标签（如"你太懒了"） |

---

## 6. Token Strategy

### Comparison

| 方案 | Token 消耗 | 用户体验 | 实时性 | 推荐度 |
|------|-----------|---------|--------|--------|
| A: 用户点击生成 | 每次点击 1 次 API 调用 | 好（可控） | 高 | ⭐⭐⭐⭐ |
| B: 每天首次打开自动生成 | 每天最多 1 次 | 好（无操作感） | 中 | ⭐⭐⭐ |
| C: 后台定时生成 | 需要后端定时任务 | 用户不可控 | 低 | ⭐ |

### Recommended: 方案 A（用户点击生成）

**原因：**
1. 最简实现：不需要后端定时任务 / cron
2. Token 可控：用户主动触发，不做无意义消耗
3. 数据实时：生成时使用最新 GrowthContext
4. 用户体验：在 today.html 页面底部放一个"今日复盘"按钮，点击后 AI 生成并展示

### Token Cost Estimate

| 组件 | 估算 Token |
|------|-----------|
| Reflection Prompt Context（精简） | ~800 tokens |
| System Prompt（Reflection 专用） | ~300 tokens |
| AI 输出（Reflection JSON） | ~300 tokens |
| **总计** | **~1400 tokens / 次生成** |

如果用户每天点击 1 次：~42,000 tokens/月。可接受。

---

## 7. Frontend Integration

### Recommended Position: 方案 A — Today Plan 页面

```
today.html
├── 今日概览（统计卡片）
├── 进度条
├── 快速添加
├── 任务列表
└── ┌─────────────────────────────┐
    │  🤖 AI 今日复盘              │  ← 新增区域
    │                             │
    │  [生成复盘] 按钮             │  ← 用户点击后
    │                             │
    │  ┌─────────────────────────┐│
    │  │ 稳步推进的一天            ││
    │  │ 今天完成 6/8 项...        ││
    │  │                         ││
    │  │ 观察:                    ││
    │  │ • 专注时间增长 20%       ││
    │  │ • 晚间任务完成率下降      ││
    │  │                         ││
    │  │ 建议:                    ││
    │  │ 1. 明天优先完成任务       ││
    │  │ 2. 安排运动时间           ││
    │  └─────────────────────────┘│
    └─────────────────────────────┘
```

### Why Today Plan (not workbench or ai.html)

| 候选位置 | 优势 | 劣势 | 结论 |
|---------|------|------|------|
| **A: today.html** | 用户已完成任务后在此查看复盘，场景最自然 | 页面新增内容 | ✅ **推荐** |
| B: workbench.html | 首页流量最大 | 已有 Growth Brief（`dailyFeedback.js` 规则版），AI 复盘会混淆 | ❌ |
| C: ai.html | AI 页面语义匹配 | 用户不会主动去 AI 页面看复盘 | ❌ |

### Implementation Detail

- 在 `today.html` 添加一个 `#reflectionSection`（默认隐藏）
- 用户点击"生成复盘" → 调用 AI API（使用精简 growthContext）→ 解析 JSON → 渲染
- 如果 AI 不可用，回退显示 `dailyFeedback.js` 的规则版（作为 Offline 兜底）
- 不需要新增页面路由

---

## 8. Risk Analysis

### Technical Risks

| 风险 | 概率 | 影响 | 缓解 |
|------|------|------|------|
| AI 输出格式漂移（非 JSON） | MEDIUM | 渲染失败 | 后端 try/catch 解析；失败回退规则版 |
| Token 超预算 | LOW | 请求失败 | Context 精简版 ~800 tokens，远低于 6000 上限 |
| AI 生成太慢（>5s） | MEDIUM | 用户等待 | 显示 loading 状态；可设置 10s 超时 |
| 模型不支持 JSON 输出 | LOW | 解析失败 | Prompt 明确要求 JSON；后端做 JSON 提取 |

### Product Risks

| 风险 | 概率 | 影响 | 缓解 |
|------|------|------|------|
| AI 过度评价用户 | MEDIUM | 用户体验下降 | Prompt 措辞约束"温和、具体"；禁止标签 |
| 建议不符合实际 | LOW | 信任下降 | `performance` 由规则直传，AI 只写 summary/insights/suggestions |
| 用户不看复盘 | MEDIUM | 功能闲置 | 放在任务列表下方，完成最后一件任务后视觉引导 |

### Architecture Risks

| 风险 | 概率 | 影响 | 缓解 |
|------|------|------|------|
| 绕过 Analytics 重新计算 | LOW | 数据不一致 | Reflection 只读 `growthContext`，不自建统计 |
| 创建第二套数据 | LOW | 架构膨胀 | Reflection 结果不持久化（每次实时生成或当次缓存） |

---

## 9. Implementation Plan

| Phase | 目标 | 修改范围 | 风险 |
|-------|------|---------|------|
| **23.2.1** | Reflection Schema 定义 + 后端 API | `backend/aiService.js`（新增 `dailyReflection()` 方法）, `backend/promptBuilder.js`（新增 `buildReflectionPrompt()`） | LOW |
| **23.2.2** | 前端接入 | `today.html`（+复盘卡片 HTML）, `pages/today.js`（+生成/渲染逻辑） | MEDIUM |
| **23.2.3** | 回退兜底 + 测试 | `tests/todayPlan.test.js`（+复盘测试）, 确认 AI 不可用时显示规则版 | LOW |

### Frozen Files (Phase 23.2)

```
js/store.js          — 不修改
js/analytics.js      — 不修改
js/goals.js          — 不修改
js/sync.js           — 不修改
js/growthContext.js  — 不修改（Reflection 消费其输出）
today.html           — 23.2.2 才修改（添加复盘卡片）
pages/today.js       — 23.2.2 才修改（添加生成/渲染逻辑）
```

---

## 10. Final Recommendation

**ARCHITECTURE COMPLETE — 可以进入 Phase 23.2.1 开发**

### 推荐第一步

实现后端 `dailyReflection()` API：
1. `promptBuilder.buildReflectionPrompt(context)` — Reflection 专用 System Prompt
2. `aiService.dailyReflection({ context })` — 调用 Provider + 解析 JSON + 失败回退
3. 新增路由 `POST /api/ai/reflection`

### 修改文件

| 文件 | 变更类型 |
|------|---------|
| `backend/src/services/promptBuilder.js` | 新增 `buildReflectionPrompt()` |
| `backend/src/services/aiService.js` | 新增 `dailyReflection()` 方法 |
| `backend/src/routes/ai.js` | 新增 `POST /reflection` 路由 |
| `today.html` | 新增复盘卡片 HTML |
| `pages/today.js` | 新增生成/渲染逻辑 |

### 必须保持冻结的文件

```
js/store.js / js/analytics.js / js/goals.js / js/sync.js
js/growthContext.js / js/aiContext.js
```
