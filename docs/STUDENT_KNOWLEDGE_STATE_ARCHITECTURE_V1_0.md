# Student Knowledge State Architecture v1.0

Status: `ARCHITECTURE FROZEN`

Baseline:

```text
Personal Learning Agent Architecture: 7f95cde
Phase 24 Course Space Foundation: eabca22
Phase 25 Knowledge Extraction: 235e247
```

Architecture Date: 2026-09-18

## 1. Overview

Student Knowledge State 是连接 Course Knowledge 与 Personal Learning Agent 的独立理解层。

当前项目已经回答：

```text
这门课程里有哪些知识？
```

Course Space 可以表达：

```text
Course -> Document -> KnowledgeNode -> KnowledgeRelation -> Evidence
```

但系统还不能回答：

```text
这个学生对某个知识节点掌握到了什么程度？
```

Student Knowledge State 不复制课程内容，也不复制用户行为。它是用户拥有的、可追溯的、基于证据的掌握状态投影。

本阶段只冻结架构，不实现数据库、API、Agent 或 Tutor。

## 2. Architecture Position

```text
Course Space
    |
    v
Knowledge Graph
    |
    v
Student Knowledge State
    |
    v
Learning Context
    |
    v
Future Agent
```

Phase 26 当前只定义前三层：

```text
Course Space
Knowledge Graph
Student Knowledge State
```

Learning Context 与 Future Agent 属于后续阶段。Agent 不能直接解释学生能力；它只能读取经过授权、过滤和溯源的 Learning Context。

### Boundary Map

| Layer | Responsibility | Truth Boundary |
| --- | --- | --- |
| Course Space | 定义知识是什么 | Course、Document、KnowledgeNode、Relation、Evidence |
| Student Knowledge State | 表达学生掌握什么 | Mastery、Confidence、State、Evidence Projection |
| GrowthMemory | 记录长期成长轨迹 | Habits、Goals、Trends、Confirmed Insights |
| CoachMemory | 保存 AI 交互上下文 | Recent Suggestions、Conversation State、Feedback |

四者不能混合。Student Knowledge State 不是 GrowthMemory 的第二表，也不是 CoachMemory 的缓存。

## 3. Core Concepts

### Knowledge Node

来自 Course Space，是稳定的课程知识单元。

Knowledge Node 表示：

```text
Promise
Closure
Event Loop
Database Index
```

它属于课程知识，不属于用户状态。

### Student Knowledge State

表示特定用户对特定 Knowledge Node 的当前学习状态。

它必须可回答：

```text
Who: user_id
What: knowledge_node_id
Where: course_id
How much: mastery_level
How certain: confidence_level
Current State: state
Why: evidence
```

### Evidence

支持状态判断的原始或派生事实。

Evidence 必须有来源、时间和类型。没有 Evidence 的 Mastery 判断不能进入 high confidence。

### Mastery

掌握程度，表达用户当前对知识节点的理解或应用水平。

Mastery 是派生值，不是 AI 直觉，也不是永久标签。

### Confidence

系统对 Mastery 判断的可信程度。

Confidence 回答：

```text
这个 mastery_level 有多少证据支持？
```

## 4. Data Model Design

本阶段不创建数据库。以下只是未来实现契约。

### student_knowledge_states

```sql
CREATE TABLE student_knowledge_states (
  id                  TEXT PRIMARY KEY,
  user_id             INTEGER NOT NULL,
  course_id           TEXT NOT NULL,
  knowledge_node_id   TEXT NOT NULL,
  mastery_level       REAL NOT NULL DEFAULT 0,
  confidence_level    TEXT NOT NULL DEFAULT 'low',
  state               TEXT NOT NULL DEFAULT 'unknown',
  last_evaluated_at   TEXT NOT NULL,
  created_at          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

### Fields

| Field | Type | Meaning | Constraint |
| --- | --- | --- | --- |
| `id` | UUID | 状态记录主键 | 系统生成 |
| `user_id` | User ID | 状态所有者 | 必须参与所有读取与写入过滤 |
| `course_id` | Course ID | 所属课程 | 必须与 Knowledge Node 的课程一致 |
| `knowledge_node_id` | Node ID | 被评估的知识节点 | 必须来自 Course Space |
| `mastery_level` | 0-1 REAL | 掌握程度 | 派生值，禁止由 AI 直接写入 |
| `confidence_level` | enum | 判断可信度 | `low` / `medium` / `high` |
| `state` | enum | 生命周期状态 | 见 State Model |
| `last_evaluated_at` | timestamp | 最近一次评估时间 | 用于判断新鲜度 |
| `created_at` | timestamp | 创建时间 | 审计字段 |
| `updated_at` | timestamp | 更新时间 | 审计字段 |

推荐唯一性：

```sql
UNIQUE(user_id, course_id, knowledge_node_id)
```

一个用户在同一个课程中对同一个 Knowledge Node 只保留一条当前状态。历史证据另表存储。

## 5. State Model

```text
Unknown
  -> Learning
  -> Familiar
  -> Mastered
  -> Needs Review
```

| State | Meaning | Entry Condition |
| --- | --- | --- |
| `unknown` | 尚未观察到学习证据 | 默认状态 |
| `learning` | 有学习行为，但掌握不稳定 | 出现学习活动证据 |
| `familiar` | 能理解概念，但应用或迁移不足 | 学习证据稳定，assessment 结果中等 |
| `mastered` | 能稳定理解并应用 | 高质量 assessment 和学习证据同时支持 |
| `needs_review` | 之前的掌握出现遗忘或错误 | assessment 下降、失败、用户标记或长期未复习 |

规则：

1. 状态变化必须有 Evidence。
2. `needs_review` 不代表学习失败。
3. 状态只能由确定性聚合流程更新。
4. AI 可以解释状态，但不能直接改变状态。

## 6. Mastery Calculation

Mastery 是证据加权结果，不是 AI 黑盒评分。

```text
Evidence Signal
  -> Source Weight
  -> Recency
  -> Difficulty / Quality
  -> Deterministic Aggregation
  -> mastery_level
```

### Source Priority

```text
Learning Behavior
  -> Assessment Result
  -> User Feedback
  -> Reflection
  -> AI Inference
```

### Signal Classes

| Class | Examples | Role |
| --- | --- | --- |
| Learning Behavior | 阅读、课程学习、练习、Focus | 基础接触信号 |
| Assessment | 测验、练习正确率、应用任务 | 主要掌握信号 |
| Review | 复习、重做、回顾 | 巩固或衰减信号 |
| User Feedback | “我理解了”“我还不熟” | 用户自报信号 |
| Reflection | 用户反思内容 | 情境补充信号 |
| AI Inference | 语义相似性、文本解释 | 只能影响 confidence，不能直接写入 mastery |

### Hard Rules

1. `mastery_level` 必须在 `0.00` 到 `1.00`。
2. 没有 Evidence 时保持 `unknown`。
3. Assessment 缺失时最高只能进入 medium confidence。
4. Reflection 和 AI Inference 不能单独产生 `mastered`。
5. 用户 Feedback 可以触发复核，但不能直接设置 mastery。

## 7. Evidence Model

### Evidence Record Contract

未来可使用独立证据表：

```sql
student_knowledge_state_evidence
```

推荐字段：

| Field | Meaning |
| --- | --- |
| `id` | Evidence 主键 |
| `user_id` | 用户所有权 |
| `course_id` | 课程所有权 |
| `knowledge_node_id` | 被解释的知识节点 |
| `source_type` | `learning_activity` / `assessment` / `review` / `reflection` / `manual_feedback` |
| `source_id` | 原始记录 ID |
| `signal` | 行为信号类型 |
| `raw_value` | 来源系统产生的可审计值 |
| `derived_value` | 聚合层派生值 |
| `weight` | 计算权重快照 |
| `occurred_at` | 行为发生时间 |
| `created_at` | 记录创建时间 |

### Source Binding

Evidence 必须绑定真实来源：

```text
source_type + source_id + occurred_at
```

禁止只保存自然语言摘要而不保存来源。

### Evidence Is Not Memory

| Concept | Role |
| --- | --- |
| Evidence | 解释某个 Knowledge State 为什么成立 |
| GrowthMemory | 记录长期成长故事和已确认洞察 |
| CoachMemory | 维护 AI 交互上下文 |
| Course Evidence | 解释课程知识来自哪里 |

Student Evidence 不是 GrowthMemory 的别名，也不是 CoachMemory 的存储。两者可以引用同一个用户事件，但不能共享同一张表或同一套生命周期。

## 8. Confidence Model

Confidence 使用三个稳定级别：

| Level | Meaning | Minimum Condition |
| --- | --- | --- |
| `low` | 证据少、旧或冲突 | 只有单一弱信号 |
| `medium` | 有一定行为或反馈支持 | 多个来源或中等 assessment |
| `high` | 有强 assessment 与稳定证据 | Assessment + Learning Behavior/Review 支持且时间新鲜 |

### Uncertainty Rules

1. 不要用虚假小数精度掩盖不确定性。
2. Evidence 冲突时 confidence 下降。
3. 证据过旧时 confidence 下降。
4. 只有 AI Inference 时 confidence 不能高于 `medium`。
5. UI 必须同时展示 Mastery 与 Confidence，不能只显示一个精确百分比。

## 9. Retrieval Context Design

未来 Learning Context 是 Agent 的唯一读取入口。

### Read Contract

```json
{
  "version": "student-knowledge-state-context-v1",
  "student": {
    "weakTopics": [
      {
        "knowledgeNodeId": "node-id",
        "title": "Promise",
        "masteryLevel": 0.35,
        "confidenceLevel": "medium",
        "state": "learning"
      }
    ],
    "strongTopics": [],
    "recentActivity": [
      {
        "knowledgeNodeId": "node-id",
        "sourceType": "assessment",
        "signal": "incorrect",
        "occurredAt": "2026-09-18T00:00:00Z"
      }
    ]
  },
  "course": {
    "courseId": "course-id",
    "courseName": "JavaScript",
    "relatedNodes": []
  }
}
```

### Retrieval Rules

1. 只能读取当前用户的数据。
2. 必须按 `user_id`、`course_id`、`knowledge_node_id` 过滤。
3. 返回条目必须有 limit。
4. 最近状态优先，历史证据只按需加载。
5. Context 是只读快照，不是可写状态。
6. Agent 只能解释或建议，不能直接写 Student Knowledge State。

本阶段不实现 API。

## 10. Security Boundary

### Ownership

Student Knowledge State 是用户私有数据。

所有未来读写必须满足：

```text
JWT Authentication
    |
req.userId Ownership Filter
    |
Course Ownership Validation
    |
Knowledge Node Course Validation
    |
Student State Read / Write
```

禁止：

- 跨用户读取 mastery。
- 通过 course 或 node 泄露其他用户状态。
- 客户端提交 mastery 覆盖服务端计算。
- 匿名访问状态。
- AI Provider 保存或传播用户能力画像。

### AI Boundary

AI 可以：

```text
Read bounded Learning Context
  -> Explain
  -> Summarize
  -> Suggest Review
```

AI 不能：

```text
Directly Write mastery_level
Directly Change state
Automatically Modify Goals
Autonomous Plan
Act as Tutor
```

## 11. Compatibility

本架构保持以下边界冻结：

| Layer | Compatibility |
| --- | --- |
| CGStore | 不修改 |
| Analytics | 不修改 |
| Goals | 不修改 |
| Sync | 不修改 |
| Reflection | 不修改 |
| GrowthMemory | 不修改 |
| CoachMemory | 不修改 |
| Course Space | 不修改现有模型 |

Student Knowledge State 只能作为 additive layer 引入。它不能变成 CGStore 的第二套持久化，也不能把课程内容复制进用户状态。

## 12. Phase Roadmap

### Phase 26.1 — Architecture Freeze

目标：

```text
冻结概念、边界、数据契约和未来接口。
```

范围：

- 本文档
- 无代码实现
- 无数据库变更

风险：

- 低

### Phase 26.2 — Database Foundation

目标：

```text
创建 student_knowledge_states 与 evidence 表。
```

范围：

- additive schema
- ownership indexes
- uniqueness
- model layer

风险：

- medium
- 必须兼容 SQLite migration 和旧库

### Phase 26.3 — Evidence Aggregation

目标：

```text
把学习行为、assessment、review、reflection 和 manual feedback 聚合为 Evidence。
```

范围：

- bounded source query
- deterministic aggregation
- source traceability

风险：

- medium
- 必须避免复制原始行为数据

### Phase 26.4 — Knowledge State Calculation

目标：

```text
实现 mastery_level、confidence_level 和 state 的确定性计算。
```

范围：

- state machine
- mastery aggregation
- confidence rules
- transactional update

风险：

- high
- 必须防止 AI 直接写状态

### Phase 26.5 — Learning Context API

目标：

```text
为未来 Agent 提供有界、只读、按用户过滤的 Learning Context。
```

范围：

- read-only API
- authorization
- pagination
- context schema version

风险：

- medium
- 不实现 Agent、Planner 或 Tutor

## 13. Freeze Declaration

Student Knowledge State Architecture v1.0 已冻结。

后续实现必须遵守：

1. Course Space 仍然是知识定义来源。
2. Student Knowledge State 是用户掌握状态，不是课程内容。
3. Evidence 必须可追溯。
4. Mastery 只能由确定性聚合产生。
5. Confidence 必须表达不确定性。
6. AI 只能读取与解释，不能直接写入状态。
7. 不实现 Agent、Planner、Tutor 或 Autonomous Action。
8. 修改本架构必须创建新的 Architecture Version。
