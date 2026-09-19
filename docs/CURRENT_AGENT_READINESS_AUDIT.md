# Current Agent Readiness Audit

Date: 2026-09-18

## 1. Executive Summary

当前架构方向是正确的：系统已经从 AI Coach 演进为 Personal Learning Agent 的数据与上下文基础。Course Knowledge、Knowledge Extraction、Student Knowledge State、Reflection 和 GrowthMemory 的边界基本清晰。

但是，当前状态不能直接进入 Agent Productization。

主要原因：

1. Phase 27.1 Agent Context Builder 仍是未提交实现。
2. Phase 27.1 还没有 Independent Re-Audit。
3. Phase 27 Agent Home Architecture、Student Knowledge State Architecture 和 Phase 26.1 Re-Audit 文档也尚未提交。
4. Agent Reasoning Layer 和 Agent Home UI 还不存在。
5. CoachMemory 仍在浏览器 localStorage 中，后端 LearningContext 无法读取。

因此，当前 Agent Readiness 是：

```text
CONDITIONAL READY
```

含义：

```text
架构方向：READY
继续编码：NOT READY
下一步：先冻结并审计 Phase 27.1
```

## 2. Current Git State

最近提交：

```text
c6fd61d feat: add student knowledge state foundation
235e247 fix: harden phase 25 knowledge extraction review
22dbe17 fix: eliminate MPA first-frame flicker
4f21acc feat: add knowledge extraction pipeline
eabca22 docs: freeze phase 24 course space foundation
7f95cde docs: freeze personal learning agent architecture v1.1
```

当前工作树包含大量未提交内容：

```text
modified files:   61
untracked paths:  29
```

与 Phase 27.1 直接相关且未提交的文件：

```text
M  backend/src/routes/index.js
?? backend/src/db/agentHomeContextModel.js
?? backend/src/routes/agentHome.js
?? backend/src/services/agentHomeService.js
?? backend/test/agentHomeContext.test.js
?? docs/PHASE_27_1_AGENT_CONTEXT_BUILDER_FINAL.md
```

以下关键架构文档也未提交：

```text
docs/PERSONAL_LEARNING_AGENT_HOME_ARCHITECTURE_V1_0.md
docs/STUDENT_KNOWLEDGE_STATE_ARCHITECTURE_V1_0.md
docs/PHASE_26_1_INDEPENDENT_REAUDIT.md
docs/PHASE_27_1_AGENT_CONTEXT_BUILDER_FINAL.md
```

工作树中还存在大量历史文档翻译修改和浏览器临时目录。这些内容不应与 Agent Phase 混入同一个 commit。

## 3. Agent Capability Level

使用以下分级：

| Level | Capability | Meaning |
| --- | --- | --- |
| L0 | Deterministic Data Layer | 拥有用户行为、课程、知识、目标和记忆数据 |
| L1 | Bounded Context Read Layer | 能安全读取、隔离和有界聚合上下文 |
| L2 | Structured Insight | 能输出带证据、可信度和建议的洞察 |
| L3 | Agent Home Productization | 有独立只读学习智能入口 |
| L4 | User Confirmed Planning | 能提出计划并由用户确认执行 |
| L5 | Autonomous Action | 能自主执行操作 |

当前系统处于：

```text
L1 — Bounded Context Read Layer
```

Phase 27.1 已经实现 L1，但由于未提交、未审计、未冻结，不能视为稳定完成。

当前明确禁止进入：

```text
L2+ implementation
```

必须先完成 Phase 27.1 Freeze Gate。

## 4. Current Capability Audit

| Capability | Status | Evidence / Boundary |
| --- | --- | --- |
| Course Knowledge | PASS / FROZEN | Course Space Foundation 已提交并冻结 |
| Knowledge Extraction | READY_TO_FREEZE | Phase 25 implementation 与 hardening 已提交 |
| Student Knowledge State | CONDITIONAL PASS | implementation commit 已存在；Phase 26.1 Re-Audit 文档未提交 |
| Reflection | PASS | 已有 Daily Reflection、Reflection Feedback 和安全加固 |
| GrowthMemory | PASS with boundary risk | 前端派生长期成长记忆，数据存于 CGStore `user.memory` |
| CoachMemory | PARTIAL | 仅浏览器 localStorage；后端 LearningContext 当前不可读 |
| Agent Context | CONDITIONAL PASS | Phase 27.1 已实现，但未提交且未独立审计 |
| Agent Reasoning Layer | NOT IMPLEMENTED | 没有 structured insight / evidence / confidence / recommendation 输出层 |
| Agent Home UI | NOT IMPLEMENTED | 没有独立学习智能 Dashboard |
| Agent Memory | PARTIAL | 短期 Context 存在；跨层 Memory 契约还没有产品化实现 |
| Agent Action | CORRECTLY BLOCKED | 当前只允许 `insight_only`，没有写 Action |

## 5. Architecture Alignment

### 5.1 Aligned

当前实现遵守以下原则：

1. Agent Context 是只读层。
2. Context 输出有界。
3. 用户身份来自后端 JWT。
4. SQL 查询带用户隔离。
5. Mastery 仍由 Evidence + deterministic aggregation 派生。
6. Agent Context 不写 Course、Mastery、Evidence、CGStore、Goals 或 Sync。
7. 当前 Action Level 是 `insight_only`。

### 5.2 Misaligned or Incomplete

| Area | Finding |
| --- | --- |
| Phase Gate | Phase 27.1 未 commit、未 audit、未 freeze |
| Documentation | 多个关键 architecture / audit 文档未提交 |
| Analytics Adapter | Context 中 `learningHistory.trend` 仍为空数组 |
| Reflection Context | 当前 Reflection Summary 实际来自行为上下文，不是完整 Reflection 内容存储 |
| Memory Boundary | CoachMemory 无法进入后端 Context；GrowthMemory 存储位置需要后续契约化 |
| Reasoning Boundary | 没有 structured insight schema，不能开始 Agent 产品化 |
| UI Boundary | 没有 Agent Home UI，用户还不能直接获得 Agent 学习视图 |

## 6. Quality Gate Result

当前未提交工作树中的 Phase 27.1 实现通过以下验证：

```yaml
Backend: 103/103 PASS
Frontend: 590/590 PASS
Build: PASS
git diff --check: PASS
```

这证明当前实现质量基础良好，但不等于架构冻结。

## 7. Architecture Risks

### R-001: Phase 27.1 is not frozen

Severity: High

Phase 27.1 是 Agent Productization 的前置层。它当前是未提交实现，继续叠加 Reasoning 或 UI 会放大架构漂移风险。

### R-002: Memory truth boundary is not product-ready

Severity: High

GrowthMemory 是 derived memory，但存储在 CGStore 用户对象的 `user.memory` 中。CoachMemory 存在于浏览器 localStorage。两者的 Source of Truth、同步边界、可迁移性和后端可读性需要在下一阶段明确。

### R-003: Reflection Summary is not true reflection history

Severity: Medium

当前 LearningContext 中的 Reflection Summary 来自 Reflection Context Source，本质上是今日行为上下文摘要，不是用户长期反思内容。不能让 Agent 把它误解为用户已经做过的反思。

### R-004: Learning trend is empty

Severity: Medium

Agent Home 要展示学习趋势，但当前 Context 的 `learningHistory.trend` 为空。若直接做 UI，会造成产品能力不足；若在 UI 里自行计算，会违反 Analytics 边界。

### R-005: Context duplication risk

Severity: Medium

当前 `learningHistory` 与 `reflections.todaySummary` 包含重复的任务、专注和连续性摘要。未来 Reasoning Layer 如果同时读取，可能产生重复解释。需要定义唯一投影位置或明确其中一个为引用快照。

### R-006: Agent Home may duplicate AI Coach

Severity: Medium

现有 AI 页面已经承载 AI Coach。Agent Home 必须定义为学习智能 Dashboard，而不是第二个聊天页面。否则会造成入口重复、上下文重复和责任混乱。

### R-007: Working tree pollution

Severity: Medium

工作树中同时存在 Phase 27.1 实现、历史文档翻译、未跟踪架构文档和浏览器临时目录。如果不精确分批提交，容易破坏 Phase 历史可读性。

## 8. Recommended Phase Roadmap

### Step 1 — Phase 27.1 Freeze Gate

目标：

1. 生成 `docs/PHASE_27_1_AGENT_CONTEXT_BUILDER_INDEPENDENT_REAUDIT.md`。
2. 审计只读、bounded、user isolation、no-write、payload size 和测试。
3. 精确提交 Phase 27.1 相关代码、测试和文档。
4. 不混入历史文档翻译和临时目录。

完成标准：

```text
READY_TO_FREEZE
```

### Step 2 — Phase 27.2 Agent Home Productization Architecture

目标：

创建架构文档，不写代码。

建议文件：

```text
docs/PHASE_27_2_AGENT_HOME_PRODUCTIZATION_ARCHITECTURE.md
```

核心内容：

1. Agent Home 与 AI Coach 的边界。
2. Agent Insight Contract。
3. Agent Home UI information architecture。
4. Analytics Context Adapter。
5. Reflection Context Adapter。
6. Agent Memory Boundary v1。
7. Level 0 permission model。
8. Browser acceptance plan。

### Step 3 — Phase 27.3 Agent Home UI Foundation

目标：

1. 新增 additive Agent Home 入口。
2. 使用现有 MPA、Calm Dawn 和服务层模式。
3. 只读展示今日状态、弱项、趋势和 Agent Insight。
4. 不实现聊天、自动计划或数据写入。

### Step 4 — Phase 27.4 Deterministic Insight Layer

目标：

在 LLM 之前先实现确定性 Insight Builder：

```json
{
  "insight": "",
  "evidence": [],
  "confidence": 0,
  "recommendedActions": []
}
```

所有字段都必须可追溯到 LearningContext。

### Step 5 — Phase 27.5 Agent Reasoning Layer

只有在 deterministic insight 和 Agent Home UI 稳定后，才引入 LLM Reasoning Layer。

约束：

1. 输入只允许 LearningContext。
2. 输出必须通过 schema validation。
3. AI 不得生成事实。
4. AI 不得写数据。
5. 当前仍然只允许 Level 0。

## 9. Next Architecture Document Plan

下一份文档不应是实现文档，而应是架构文档：

```text
docs/PHASE_27_2_AGENT_HOME_PRODUCTIZATION_ARCHITECTURE.md
```

必须包含：

1. Agent Home 与 AI Coach separation。
2. Agent Home information architecture。
3. LearningContext v1.1 contract。
4. Agent Insight Contract v1。
5. Analytics Adapter boundary。
6. Reflection Adapter boundary。
7. Memory Boundary v1。
8. Permission and Action Boundary。
9. Security and prompt-injection rules。
10. Implementation roadmap。
11. Browser acceptance criteria。
12. Freeze declaration。

## 10. Final Recommendation

当前不应该直接开始 Agent Productization。

正确顺序是：

```text
1. Independent Re-Audit Phase 27.1
2. Freeze and commit Phase 27.1
3. Create Phase 27.2 Architecture Document
4. Review memory / analytics / reflection boundary
5. Implement Agent Home UI only after architecture freeze
```

最终结论：

```text
CONDITIONAL READY
BLOCKING: Phase 27.1 Freeze Gate
NEXT ACTION: Independent Re-Audit + Focused Commit
```
