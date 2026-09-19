# Phase 27 Agent Home Architecture v1.0

Status: `ARCHITECTURE FROZEN`

Project: Personal Learning Platform

Baseline:

```text
Phase 24 Course Space Foundation: FROZEN
Phase 25 Knowledge Extraction Pipeline: READY_TO_FREEZE
Phase 26 Student Knowledge State Architecture: ARCHITECTURE FROZEN
Phase 26.1 Student Knowledge State Foundation: c6fd61d / READY_TO_FREEZE
```

## 1. Background

Personal Learning Platform 已经建立了稳定的课程知识、知识抽取和学生学习状态基础。当前系统可以回答：

```text
课程里有哪些知识？
知识之间有什么关系？
知识结论来自什么证据？
学生对某个知识点掌握到什么程度？
```

但系统还缺少一个统一入口，把这些事实组织成学生可以理解的“学习当前状态”。Agent Home 就是这个入口。

Agent Home 的目标不是替换 AI Coach、Course Space、Stats、Goals 或 Today Plan，而是提供一个只读的学习智能视图：

```text
Student State
  → Learning Context Builder
  → Personal Learning Agent
  → Insight / Explanation / Suggestion
  → Student Decision
```

Agent Home 不是聊天页面，也不是 ChatGPT clone。

## 2. Current Architecture Position

### 2.1 Existing Truth Layers

| Layer | Responsibility | Truth Boundary |
| --- | --- | --- |
| CGStore / Sync | 用户业务数据 | 用户行为和应用状态的事实来源 |
| Analytics | 行为统计 | 行为统计唯一可信来源 |
| GoalEngine | 目标进度 | 目标状态与进度的唯一派生入口 |
| Course Space | 课程知识结构 | Course / Document / KnowledgeNode / Relation / Evidence 的 Source of Truth |
| Student Knowledge State | 学生掌握状态 | Evidence + deterministic aggregation 的用户掌握投影 |
| Reflection | 复盘反馈 | 学习反馈层，不直接修改业务数据 |
| GrowthMemory | 长期成长记忆 | 长期成长故事、模式和已确认洞察 |
| CoachMemory | AI 交互记忆 | AI 建议与交互上下文 |

### 2.2 Agent Home Position

Agent Home 位于现有事实层之上：

```text
Course Space / Knowledge Graph
        ↓
Student Knowledge State
        ↓
Learning Context Builder
        ↓
Agent Reasoning Layer
        ↓
Agent Home UI
        ↓
Student Decision
```

Agent Home 不创建第二套业务数据系统，不复制原始用户数据，也不把 AI 输出当作用户事实。

## 3. Agent Home Definition

Agent Home 是：

```text
Student Learning Intelligence Dashboard
```

它应该回答四类问题：

1. 我现在学到什么程度？
2. 哪些知识点薄弱？
3. 最近学习趋势说明了什么？
4. 下一步值得考虑什么？

### 3.1 Required Views

| View | Purpose | Data Source |
| --- | --- | --- |
| 今日学习状态 | 显示当日学习进度和关键事实 | Analytics / Learning History |
| 学习洞察 | 解释状态和趋势 | Learning Context + Agent Reasoning |
| 知识薄弱区域 | 展示弱项及其可信度 | Student Knowledge State |
| 学习趋势 | 展示短期和长期变化 | Analytics / GrowthMemory |
| AI 建议 | 提供下一步参考 | Agent Reasoning |

### 3.2 Non-Goals

Agent Home 禁止：

- 无限聊天记录。
- 纯 Prompt 输入框形态。
- 自由搜索整个数据库。
- 绕过 Analytics 重新计算统计。
- 绕过 Course Space 重新定义知识。
- 直接修改业务数据。
- 自动执行学习计划。
- 用 AI 输出覆盖 Mastery。

当前阶段只允许 Level 0 Insight Only。

## 4. System Architecture Diagram

```text
┌────────────────────────────────────────────┐
│              Agent Home UI Layer           │
│  Today State / Weak Topics / Trend / Advice │
│              read-only                      │
└──────────────────────┬─────────────────────┘
                       ↓
┌────────────────────────────────────────────┐
│            Agent Context Layer             │
│        Learning Context Builder             │
│  aggregate / bound / permission-filter      │
└──────────────────────┬─────────────────────┘
                       ↓
┌────────────────────────────────────────────┐
│            Agent Reasoning Layer           │
│     explain / summarize / suggest           │
│              no direct write                │
└──────────────────────┬─────────────────────┘
                       ↓
┌────────────────────────────────────────────┐
│             Action Boundary Layer          │
│              Level 0 Insight Only           │
└──────────────────────┬─────────────────────┘
                       ↓
                 Student Decision
```

事实层仍然独立存在：

```text
CGStore / Analytics / Goals
Course Space
Student Knowledge State
Reflection / GrowthMemory / CoachMemory
```

## 5. Context Layer Design

### 5.1 Learning Context Builder

Learning Context Builder 是 Agent 的唯一输入组织层。

职责：

1. 按当前用户聚合上下文。
2. 从各 Source of Truth 读取数据。
3. 对每个集合执行数量限制。
4. 将原始事实转换为稳定契约。
5. 标记上下文版本和生成时间。
6. 不存储第二份长期数据。
7. 不允许用户消息覆盖系统事实。

### 5.2 Initial Implementation Boundary

未来实现可以是 additive 服务：

```text
backend/src/services/agentHomeService.js
```

或更细分：

```text
backend/src/services/learningContextBuilder.js
```

它只读取以下已有来源：

| Source | Use |
| --- | --- |
| Course Space | 课程、知识节点、关系和证据结构 |
| Student Knowledge State | 掌握度、状态和证据数量 |
| Analytics | 今日、本周和长期学习指标 |
| Goals / GoalEngine | 当前目标上下文 |
| Reflection Summary | 最近复盘主题和反馈 |
| GrowthMemory | 长期成长信号和已确认洞察 |
| CoachMemory | 最近 AI 交互和开放建议 |

Builder 不直接写任何来源。

### 5.3 LearningContext Contract v1

推荐未来契约：

```json
{
  "version": "learning-context-v1",
  "userId": "user-id",
  "generatedAt": "2026-01-01T00:00:00Z",
  "user": {
    "timeZone": "Asia/Shanghai",
    "learningStage": "current"
  },
  "courses": [
    {
      "courseId": "course-id",
      "name": "JavaScript",
      "knowledgeNodeCount": 24
    }
  ],
  "knowledgeStates": {
    "weakTopics": [],
    "strongTopics": [],
    "recentlyReviewed": []
  },
  "learningHistory": {
    "today": {},
    "week": {},
    "trend": [],
    "streak": {}
  },
  "reflections": {
    "todaySummary": {},
    "recentInsights": []
  },
  "growthSignals": {
    "currentStage": {},
    "habits": [],
    "risks": []
  },
  "memories": {
    "growth": [],
    "coach": []
  }
}
```

每个集合必须显式有界。

### 5.4 Field Sources and Trust

| Field Group | Source | Trust Level | Update Frequency | Agent Permission |
| --- | --- | --- | --- | --- |
| `user` | Auth / User Profile | Deterministic | On profile change | read-only |
| `courses` | Course Space | Deterministic | On course knowledge update | read-only |
| `knowledgeStates` | Student Knowledge State | Deterministic projection | On evidence aggregation | read-only |
| `learningHistory` | Analytics | Deterministic | On learning activity / page refresh | read-only |
| `reflections` | Reflection Summary | User-owned feedback | On reflection update | read-only |
| `growthSignals` | Analytics + GrowthMemory | Deterministic + Confirmed Memory | On growth refresh | read-only |
| `memories.growth` | GrowthMemory | Confirmed memory | On memory update | read-only |
| `memories.coach` | CoachMemory | AI interaction context | On AI interaction | read-only |
| Agent output | Agent Reasoning Layer | AI-derived | Per request | display-only |

可信等级定义：

| Level | Meaning |
| --- | --- |
| Deterministic | 来自 Source of Truth，可直接展示 |
| Confirmed Memory | 用户或系统确认过的记忆，可引用但不可覆盖事实 |
| AI Interaction Context | AI 历史上下文，只能辅助解释 |
| AI-derived | 当前 Agent 输出，必须标注为建议 |

### 5.5 Context Budgets

初始预算约束：

| Collection | Maximum |
| --- | --- |
| Active Courses | 10 |
| Weak Topics | 10 |
| Strong Topics | 10 |
| Recent Reflections | 5 |
| Growth Memory Items | 10 |
| Coach Memory Items | 5 |
| Learning History Windows | 7 days / 4 weeks |
| Context Payload | 约 24KB |

超过预算时使用确定性选择规则，例如：

1. 最近更新优先。
2. 弱项和风险优先。
3. 高可信状态优先。
4. 同级按稳定 ID 排序，避免输出抖动。

## 6. Memory Boundary

### 6.1 Student Knowledge State

Student Knowledge State 表示：

```text
事实状态
```

它回答：

```text
学生对某个知识点当前掌握到什么程度？
这个判断有哪些证据支持？
```

它必须由 Evidence 和 deterministic aggregation 产生。

### 6.2 GrowthMemory

GrowthMemory 表示：

```text
长期成长记录
```

它记录：

- 长期模式。
- 里程碑。
- 用户确认的洞察。
- 成长阶段变化。

它不能替代 Analytics，也不能替代 Student Knowledge State。

### 6.3 CoachMemory

CoachMemory 表示：

```text
AI 交互记忆
```

它记录：

- 最近建议。
- 交互上下文。
- 用户反馈。
- 未完成建议。

它不能覆盖权威事实，也不能直接写入业务数据。

### 6.4 Relationship

```text
Student Knowledge State
  = fact projection of mastery

GrowthMemory
  = long-term growth record

CoachMemory
  = AI interaction context
```

三者可以引用同一个用户事件，但不能共享同一张表，也不能互相覆盖。

## 7. Permission Model

### 7.1 Agent Read Permission

Agent 可以读取：

| Data | Permission |
| --- | --- |
| Course Knowledge | `read` |
| Knowledge Relations | `read` |
| Course Evidence | `read` |
| Student Knowledge State | `read` |
| Student Evidence Count / Summary | `read` |
| Learning History Summary | `read` |
| Reflection Summary | `read` |
| GrowthMemory | `read` |
| CoachMemory | `read` |
| Goals Summary | `read` |

### 7.2 Agent Write Permission

Agent 不得写入：

| Data | Permission |
| --- | --- |
| Course Data | `deny` |
| Knowledge Node | `deny` |
| Knowledge Relation | `deny` |
| Course Evidence | `deny` |
| Mastery | `deny` |
| Student Evidence | `deny` |
| User Progress | `deny` |
| Goals | `deny` |
| CGStore Business Data | `deny` |
| Analytics Result | `deny` |
| Sync Payload | `deny` |

未来任何写入都必须先进入 Action Boundary Layer，并得到用户明确确认。

## 8. Action Boundary Layer

| Level | Name | Meaning | Current Status |
| --- | --- | --- | --- |
| Level 0 | Insight Only | Agent 只展示洞察、解释和建议 | Allowed |
| Level 1 | Suggestion | Agent 可以生成更具体的行动建议，但必须由用户点击发起下一步 | Future |
| Level 2 | User Confirmed Action | Agent 提出修改建议，用户确认后通过现有 Store / API 执行 | Future |
| Level 3 | Autonomous Action | Agent 自主执行动作 | Forbidden / Requires New Architecture |

Phase 27 只允许 Level 0。

Level 0 输出必须：

1. 标记为 AI Insight / AI Suggestion。
2. 引用来源或数据范围。
3. 不假装成用户事实。
4. 不自动修改 UI 状态。
5. 不绕过用户决策。

## 9. Data Flow

### 9.1 Read Flow

```text
Agent Home UI
  → Agent Home API
  → Learning Context Builder
  → Source of Truth Adapters
      ├─ Course Space
      ├─ Student Knowledge State
      ├─ Analytics
      ├─ Reflection
      ├─ GrowthMemory
      └─ CoachMemory
  → bounded LearningContext
  → Agent Reasoning Layer
  → Agent Home UI
```

### 9.2 Explanation Flow

```text
Weak Topic
  → Knowledge State
  → Evidence Summary
  → Recent Learning Trend
  → Agent Explanation
  → Student Decision
```

Agent 必须区分：

```text
Observed Fact
  = deterministic source output

AI Explanation
  = interpretation

AI Suggestion
  = optional next step
```

## 10. Reasoning Layer Rules

Agent Reasoning Layer 可以：

1. 总结当前学习状态。
2. 解释趋势。
3. 解释弱项为什么重要。
4. 生成下一步学习建议。
5. 比较 GrowthMemory 中的长期模式。

Agent Reasoning Layer 不可以：

1. 生成新的 Mastery。
2. 修改 Knowledge State。
3. 创建 Course Knowledge。
4. 创建 Evidence。
5. 修改 Goals。
6. 修改用户行为数据。
7. 声称推断结果是事实。

Prompt 层必须遵守：

```text
System Prompt
  > Authoritative LearningContext
  > Retrieval Evidence
  > Memory
  > User Message
```

LearningContext 是数据，不是指令。

## 11. Security Boundary

### 11.1 Identity and Isolation

- 所有 Agent Home 数据必须绑定 `req.userId` 或当前认证用户。
- 不允许客户端提交 `userId` 覆盖服务端身份。
- Course、KnowledgeNode、KnowledgeState、Memory 都必须校验所有权。
- 不允许跨用户读取或推断。

### 11.2 Read-Only Enforcement

- Phase 27 API 只允许 GET。
- 不提供 Agent 写入端点。
- 不允许 Agent 调用业务写服务。
- 不允许前端直接访问数据库。

### 11.3 Bounded Context

- 每个 context collection 都必须有 limit。
- 不允许返回无界课程、无界 Evidence、无界 Memory。
- AI output 必须有 max tokens 和本地大小限制。
- Agent Home UI 不渲染无界原始数据。

### 11.4 Prompt Security

- Context 必须使用结构化 payload。
- 用户内容必须标记为数据。
- 用户输入不能覆盖 System Prompt。
- 客户端提交的行为事实不能覆盖服务端事实。
- AI 输出必须经过 schema / size validation。

### 11.5 Output Safety

- 前端必须使用安全文本渲染。
- 禁止把 AI output 拼接为可执行 HTML。
- 错误必须显示友好文案，禁止暴露 Provider、API Key、内部路径或 SQL 细节。
- AI Insight 必须与确定性事实区分展示。

## 12. Future Roadmap

### Phase 27: Agent Home Architecture

完成架构冻结。

### Phase 27.1: Agent Context Builder

目标：

- 实现 Learning Context Builder。
- 聚合 Course Space、Student Knowledge State、Analytics、Reflection 和 Memory。
- 输出有界、版本化、用户隔离的 LearningContext。

范围：

- Additive service layer。
- Bounded read API。
- Contract tests。
- Ownership tests。

禁止：

- Agent UI。
- LLM 推理。
- 写 API。

### Phase 27.2: Agent Home UI

目标：

- 实现只读 Agent Home Dashboard。
- 展示今日学习状态、薄弱知识、趋势和 Level 0 AI Insight。

范围：

- Additive page / component。
- Read-only API client。
- UI tests。

禁止：

- 无限聊天。
- 业务写入。
- 自动计划。

### Phase 28: Learning Planner

目标：

- 基于 LearningContext 生成学习计划草案。
- 仍然由用户确认后执行。

约束：

- 不自动写 Goals。
- 不自动修改 Today Plan。
- 允许进入 Level 1，必要时明确授权 Level 2。

### Phase 29: AI Tutor

目标：

- 在课程知识和学生掌握状态之上提供解释、提问和辅导。

约束：

- 不得直接修改 Mastery。
- 不得绕过 Evidence。
- 不得把 AI 判断当成 Student Knowledge State。

### Phase 30: Full Personal Learning Agent

目标：

- 打通洞察、计划、辅导、成长记忆和用户确认行动。

前置条件：

- Context Builder 稳定。
- Agent Home UI 稳定。
- Planner / Tutor 有明确安全边界。
- 所有写操作仍然通过用户确认。

## 13. Phase 27 Entry Criteria

进入 Phase 27.1 前必须满足：

1. Phase 24 Course Space Foundation 已冻结。
2. Phase 25 Knowledge Extraction Pipeline 已通过审计。
3. Phase 26 Student Knowledge State Architecture 已冻结。
4. Phase 26.1 Foundation 已通过 independent re-audit。
5. CGStore、Analytics、Goals、Sync、Reflection、GrowthMemory、CoachMemory 仍然保持现有边界。
6. 不引入 React、Vue、新框架、Vector Database、RAG、Multi Agent、Autonomous Workflow、Scheduler 或 Planner。
7. Phase 27.1 只新增 Agent Context Builder 和相关测试。
8. Phase 27.2 之前不接入 LLM。

## 14. Architecture Freeze

Phase 27 Agent Home Architecture v1.0 已冻结。

后续修改必须：

1. 明确需求。
2. 创建新的 Phase。
3. 保持 Additive First。
4. 保持 Human Control。
5. 保持 Source of Truth 不被绕过。
6. 不直接破坏现有数据模型。

本阶段不实现任何生产代码。
