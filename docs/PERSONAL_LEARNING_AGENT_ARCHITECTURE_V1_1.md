# 个人学习代理架构 v1.1

# 建筑冻结记录

项目：`chenguang-platform`

状态：`ARCHITECTURE FROZEN`

基线：

```text
Phase 23.2.3 + Phase 23.x Stabilization
1a0a874 chore: stabilize phase 23.x baseline
Frontend: 580/580 PASS
Backend: 85/85 PASS
Build: PASS
git diff --check: PASS
```

# 1. 产品定义

知行正在从一个 AI 辅助的自律工作台发展为个人学习代理。

代理人必须理解：

- 学生是谁，
- 学生正在学习的内容，
- 目前进展有哪些证据，
- 哪些目标重要，
- 之前发生了什么，
- 以及下一个有用的学习行动应该是什么。

一个代理不仅仅是一个大型语言模型、聊天界面、RAG 流程、提示或人工智能教练。

# 2. 核心环路

```text
User Intent
  → Agent Perception
  → Personal Data / Course Knowledge / Memory
  → Retrieval
  → Evidence
  → Context Builder
  → Reasoning
  → Planning
  → Action Proposal
  → User Confirmation
  → Action
  → Feedback
  → Memory / Analytics
  → Next Cycle
```

# 3. 核心领域

| 领域 | 责任 | 真实来源 |
| --- | --- | --- |
| 个人数据 | 原始用户行为和应用状态 | CGStore / 后端用户数据 |
| 学习分析 | 从行为中确定的意义 | 分析 |
| 目标 | 目标状态和进度 | GoalEngine 分析 |
| 课程知识 | 稳定的课程学习对象、节点、关系、证据 | 课程知识层 |
| 个人记忆 | 长期和教练互动的上下文 | GrowthMemory / CoachMemory |
| 代理上下文 | 当前的、有限的、权限过滤的 AI 输入 | 代理上下文层 |
| 代理状态 / 行动 | 明确的计划和用户确认的执行 | 代理状态 / 行动层 |

# 4. 真理来源规则

- CGStore 仍然是应用程序的用户数据层，不应成为知识库。
- 分析仍然是行为指标的唯一规范来源。
- 目标的进展必须通过 GoalEngine 和 Analytics 推导。
- 课程知识与课程安排和课程进度分开。
- 个人记忆记录随时间变化的重要事项，而非原始行为真相。
- 反思反馈是 AI 质量信号，而非业务行为数据。
- 代理上下文是派生的、有边界的、有版本控制的，并经过权限过滤。
- 代理不会创造事实；它使用证据。

# 5. 知识边界

课程知识必须保持这些界限：

```text
Course
  = user-facing course container

Course Schedule
  = existing timetable and progress data

Knowledge Source
  = document, artifact, URL, lecture, note, or evidence source

KnowledgeNode
  = stable learning concept or unit

KnowledgeRelation
  = typed relationship between nodes

Evidence
  = traceable support for a knowledge claim

Student Knowledge State
  = user-owned mastery/status/evidence projection
```

知识内容不是用户行为数据。学生知识状态不是公开课程内容。

# 6. 内存边界

## 成长记忆

- 长期增长模式、里程碑、偏好、见解和确认的候选人。
- 通过 CGStore 的用户数据拥有。
- 不得重复分析。

## 教练记忆

- 短期和中期的人工智能互动情境。
- 与规范用户数据分开。
- 不得覆盖权威行为事实。

## 反思反馈

- 对反射质量保持二进制反馈。
- 不得修改待办事项、目标、签到、运动、阅读、英语、课程或专注内容。
- 不能算作用户行为分析。

# 7. 情境信托层级

迅速建造必须遵守以下顺序：

```text
System Prompt
  > Authoritative Context
  > Retrieval Evidence
  > User Memory / Preference
  > User Message
```

规则：

- 上下文是数据，而不是指令。
- 用户输入不能覆盖系统规则。
- 客户端提交的行为事实不能覆盖服务器得出的事实。
- 检索到的证据必须有来源并可追溯。
- 不可信的内容必须明确标记为数据。

# 8. 推理、规划、行动

代理人可以：

- 分析，
- 总结，
- 解释，
- 检索，
- 推荐，
- 提出计划，
- 并请求确认。

代理人不得：

- 悄无声息地修改用户数据，
- 自主执行操作，
- 覆盖分析，
- 绕过目标，
- 创建第二个数据系统，
- 或将推断的主张视为观察到的事实。

所有写入操作都需要明确的用户确认和安全的权限执行。

# 9. 检索边界

检索必须是：

- 拥有权意识，
- 保存证据，
- 来源归属，
- 有尺寸限制，
- 版本化，
- 并且安全审计。

代理人不得接收无限制的原始库存。

# 10. 代理模式

| 模式 | 目的 |
| --- | --- |
| ASK | 用有证据支持的背景回答 |
| ANALYZE | 解释发生了什么以及为什么重要 |
| PLAN | 提出一个有界的下一步计划 |
| ACT | 只执行用户确认安全的操作 |
| PROACTIVE | 提出一个有限的建议或提醒 |

# 11. 禁忌建筑

除非明确批准新的架构版本，否则以下是禁止的：

- SPA 重写
- 第二组件系统,
- 第二用户数据存储，
- 第二个分析引擎，
- 页面级目标计算,
- 页面级行为统计,
- 代理人拥有的直接业务承保，
- 自主行动执行，
- 将公共知识与私人学习状态混合，
- 原始无限上下文注入
- 并将客户的声明作为权威事实使用。

# 12. 隐私和安全边界

- 用户数据归用户所有。
- 后端拥有身份验证和授权。
- 代理的响应必须安全呈现。
- 不得在提示或响应中包含机密、令牌、API 密钥、密码或内部实现细节。
- 每个推荐都必须可追溯到上下文和证据。

# 13. 阶段路线图

| 阶段 | 目标 |
| --- | --- |
| 阶段 24 | 课程空间与知识库基础 |
| 阶段 25 | 检索与证据 |
| 阶段 26 | 学生知识状态 |
| 阶段 27 | 代理上下文与推理 |
| 阶段 28 | 规划 |
| 阶段 29 | 安全操作与反馈 |
| 阶段 30 | 综合个人学习代理 |

允许进入第24阶段，因为第23.x阶段基线是稳定的。

# 14. 第24阶段边界

允许：

- 课程知识，
- 文档，
- 知识节点，
- 关系，
- 证据，
- 检索基础，
- 最小课程界面。

不允许：

- 完整代理，
- 计划者，
- 动作系统
- 自主执行，
- 学生掌握引擎
- 全面考试智力，
- 多智能体系统。

# 15. 改变政策

任何架构更改都必须记录：

```text
Current Rule
Problem
Proposed Change
Impact
Backward Compatibility
Migration
Rollback
```

重大更改需要进行架构评审并提升版本号。

# 16. 最终原则

```text
Data tells what happened.
Analytics tells what it means quantitatively.
Knowledge tells what is being learned.
Memory tells what matters over time.
Context tells what is relevant now.
Evidence tells why we believe it.
Agent reasons about what should happen next.
Planning turns reasoning into a plan.
Action executes only with appropriate user control.
Feedback teaches the system what worked.
```

最终状态：

```text
Architecture Version: v1.1
Status: FROZEN
Next Phase: Phase 24 — Course Space & Knowledge Base Foundation
```
