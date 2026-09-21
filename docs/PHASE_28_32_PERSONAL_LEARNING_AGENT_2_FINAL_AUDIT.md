# Phase 28–32 Personal Learning Agent 2.0 Final Audit

## Audit Result

READY_TO_FREEZE

## Executive Summary

Phase 28–32 已按 additive 方式完成，Personal Learning Agent 从“学习问答 Agent”升级为用户可控的 Personal Learning Agent 2.0。

新闭环：

```text
Course Knowledge / Evidence
  → Assessment
  → Practice Attempt + Knowledge Evidence
  → Student Knowledge State
  → Adaptive Review Intelligence
  → Learning Planner
  → Action Proposal
  → User Confirmation
  → Assessment / Review Action
  → Feedback
  → Next Perception
```

系统没有引入 autonomous planner、tool-calling agent、Memory Writer、FSRS、BKT、Vector DB 或 Multi-Agent。

## Phase Status

| Phase | Scope | Status |
| --- | --- | --- |
| 28 | Advanced Practice / Assessment | PASS |
| 29 | Adaptive Mastery & Review Intelligence | PASS |
| 30 | Learning Planner | PASS |
| 31 | Action Proposal + User Confirmation | PASS |
| 32 | Personal Learning Agent 2.0 Orchestration | PASS |

## 1. Phase 28 Advanced Assessment

### Architecture

PASS

1. Assessment items 只从 Course Node definition 与 Course Evidence quote 确定性生成。
2. 最多 5 个 items。
3. 无 definition 且无 evidence 时 fail closed。
4. 服务端重建题目并判分，不暴露 expected。
5. 判分 deterministic，无 LLM 参与。
6. Assessment score 只是 evidence，不直接改写 mastery。
7. Assessment attempt 与 Knowledge Evidence 在同一 SQLite transaction 中写入。
8. 不创建第二套 Mastery Store。

Evidence:

- `backend/src/services/learningAssessmentService.js:84`
- `backend/src/services/learningAssessmentService.js:120`
- `backend/src/services/learningAssessmentService.js:184`

### Security

PASS

1. Route 使用 `authRequired`。
2. Assessment submission 使用 `writeLimiter`。
3. `confirmed !== true` 拒绝。
4. Course、Node、Evidence ownership fail closed。
5. User answer 只作为 DATA。
6. Response 不暴露 expected、provider 或内部堆栈。

Evidence:

- `backend/src/routes/learning.js:61`
- `backend/src/routes/learning.js:74`
- `backend/test/advancedAssessment.test.js`

## 2. Phase 29 Adaptive Review Intelligence

### Architecture

PASS

1. 只读派生 adaptive review。
2. 输入仅限 Student Knowledge State、Knowledge Evidence、Practice Attempts。
3. Adaptive score 是 projection，不持久化。
4. 不引入 FSRS、BKT、LLM inference。
5. 最多返回 50 items。
6. Policy deterministic。

Evidence:

- `backend/src/services/adaptiveReviewService.js:135`
- `backend/src/routes/learning.js:94`

### Security

PASS

1. Route 使用 `authRequired`。
2. Course ownership fail closed。
3. 不写 review schedule。
4. 不自动修改 Student State。
5. Response metadata 保持 `recommendation_only`。

Evidence:

- `backend/test/adaptiveReview.test.js`

## 3. Phase 30 Learning Planner

### Architecture

PASS

1. Planner 只消费 Adaptive Review。
2. Plan 最多 4 blocks。
3. `availableMinutes` bounded 到 15–240。
4. 同一天相同 source fingerprint 得到相同 `planId`。
5. Plan read-only，不持久化。
6. Plan 不是 fact，也不是 action。

Evidence:

- `backend/src/services/learningPlannerService.js:52`
- `backend/src/routes/learning.js:106`

### Security

PASS

1. Route 使用 `authRequired`。
2. Course ownership fail closed。
3. `permissions.write` 为空。
4. metadata `actionLevel = plan_only`。
5. 不修改 Todo、Goal、Analytics、Knowledge State。

Evidence:

- `backend/test/learningPlanner.test.js`

## 4. Phase 31 Action Proposal + Confirmation

### Architecture

PASS

1. 新增 `learning_action_proposals` additive table。
2. Proposal 通过 planId + blockId + kind + node + dayKey 确定指纹。
3. Confirm 必须显式由用户发起。
4. Confirm 后 assessment block 才返回 assessment items。
5. Assessment proposal 只有在 attempt + evidence 写入成功后标记 completed。
6. Review / consolidate action 不伪造 mastery evidence。

Evidence:

- `backend/schema.sql:185`
- `backend/src/db/learningActionModel.js`
- `backend/src/services/learningActionService.js:75`
- `backend/src/services/learningActionService.js:139`

### Security

PASS

1. Confirm / complete route 使用 `authRequired` + `writeLimiter`。
2. Proposal owner 隔离。
3. Plan 与 block 必须能被服务端重建并匹配。
4. kind / status 使用 allowlist。
5. 不执行 Todo / Goal / Analytics write。

Evidence:

- `backend/src/routes/learning.js:118`
- `backend/src/routes/learning.js:127`
- `backend/test/learningAction.test.js`

## 5. Phase 32 Personal Learning Agent 2.0

### Architecture

PASS

1. Overview 统一 Perception、Adaptive Review、Planner、Actions。
2. Overview 保持 read-only。
3. Next action 必须显式确认。
4. 一次只确认一个 next action。
5. 不自动连续执行。
6. LLM 不参与 planning、action selection 或 execution。

Evidence:

- `backend/src/services/personalLearningAgentService.js:18`
- `backend/src/services/personalLearningAgentService.js:72`
- `backend/src/routes/learning.js:151`
- `backend/src/routes/learning.js:163`

### Frontend

PASS

1. Agent Home 新增 Personal Learning Agent 2.0 卡片。
2. UI 显示 perception、plan 与 next recommendation。
3. “确认下一个行动”是显式用户操作。
4. Assessment answer 使用 textarea 提交，不用 innerHTML 渲染。
5. Provider / internal error 不透出。

Evidence:

- `js/apiClient.js`
- `js/agentHomeService.js`
- `js/agentHomeView.js`
- `tests/personalLearningAgentUI.test.js`

## Authority Hierarchy

PASS

保持：

```text
System Facts
  > Deterministic Analytics
  > Course Knowledge
  > Student Knowledge State
  > Evidence
  > Insight
  > Reasoning
  > User Input
  > LLM Generated Content
```

验证：

1. Assessment 只能引用 Course Knowledge / Evidence。
2. Mastery 只由 Student Knowledge Evidence 聚合。
3. Adaptive priority 不能改写 state。
4. Plan 不能改写 fact。
5. Proposal 不能改写 mastery。
6. User input 不能改写题目或 Evidence。
7. LLM 不在 Phase 28–32 execution loop 中。

## Data Isolation

PASS

1. 所有新查询都使用 authenticated `userId`。
2. Course ownership 通过 Sync 数据验证。
3. Node ownership 通过 Course Space 数据验证。
4. Proposal / assessment / review / planner / agent 全部 fail closed。
5. `learning_action_proposals` 有 user foreign key 与 `(user_id, fingerprint)` 唯一约束。

Evidence:

- `backend/test/advancedAssessment.test.js`
- `backend/test/adaptiveReview.test.js`
- `backend/test/learningPlanner.test.js`
- `backend/test/learningAction.test.js`
- `backend/test/personalLearningAgent.test.js`

## Regression Tests

```yaml
Backend:
  304/304 PASS

Frontend:
  612/612 PASS

Build:
  PASS

git diff --check:
  PASS
```

Focused tests:

```yaml
Advanced Assessment: 4/4 PASS
Adaptive Review: 3/3 PASS
Learning Planner: 2/2 PASS
Learning Action: 3/3 PASS
Personal Learning Agent: 3/3 PASS
Learning Agent UI: 1/1 PASS
```

## Findings

### F-001 Existing manual practice endpoint is still two writes

- Severity: Low
- Status: OPEN, NON-BLOCKER
- Evidence: `backend/src/services/studentPracticeService.js:90` 后仍调用 `recordEvidence()`。
- Impact: 理论上中间失败可能产生 orphan attempt。
- Boundary: 新 Assessment path 已使用同事务；旧 manual endpoint 不在本阶段扩 scope。

### F-002 Mastery Gate assessment condition remains inferred

- Severity: Low
- Status: OPEN, NON-BLOCKER
- Evidence: `backend/src/services/learningReviewService.js:21`
- Recommendation: 后续单独 Phase 显式投影 assessment evidence type。

### F-003 Review / consolidation completion does not create mastery evidence

- Severity: Info
- Status: INTENTIONAL
- Reason: 防止用户把“标记完成”伪造成学习证据。Mastery feedback 仍必须来自 Assessment。

## Files Changed

### Backend

- `backend/schema.sql`
- `backend/src/routes/learning.js`
- `backend/src/db/learningActionModel.js`
- `backend/src/services/learningAssessmentService.js`
- `backend/src/services/adaptiveReviewService.js`
- `backend/src/services/learningPlannerService.js`
- `backend/src/services/learningActionService.js`
- `backend/src/services/personalLearningAgentService.js`

### Frontend

- `js/apiClient.js`
- `js/agentHomeService.js`
- `js/agentHomeView.js`

### Tests

- `backend/test/advancedAssessment.test.js`
- `backend/test/adaptiveReview.test.js`
- `backend/test/learningPlanner.test.js`
- `backend/test/learningAction.test.js`
- `backend/test/personalLearningAgent.test.js`
- `tests/personalLearningAgentUI.test.js`

### Architecture

- `docs/PHASE_28_ADVANCED_PRACTICE_ASSESSMENT_ARCHITECTURE.md`
- `docs/PHASE_29_ADAPTIVE_MASTERY_REVIEW_ARCHITECTURE.md`
- `docs/PHASE_30_LEARNING_PLANNER_ARCHITECTURE.md`
- `docs/PHASE_31_ACTION_PROPOSAL_CONFIRMATION_ARCHITECTURE.md`
- `docs/PHASE_32_PERSONAL_LEARNING_AGENT_2_ARCHITECTURE.md`
- `docs/PHASE_28_32_PERSONAL_LEARNING_AGENT_2_FINAL_AUDIT.md`

## Non-goals

以下能力未实现，也未被授权：

1. Autonomous continuous execution。
2. Tool calling。
3. Memory writer。
4. Multi-agent orchestration。
5. FSRS / BKT。
6. Embedding / Vector DB。
7. Unlimited retrieval。
8. 自动修改 Todo / Goal / Analytics / Sync。
9. LLM 自动评分。

## Final Verdict

```yaml
Critical: 0
High: 0
Medium: 0
Low: 2
Info: 1

Architecture: PASS
Security: PASS
Data Isolation: PASS
User Confirmation: PASS
Regression: PASS
Build: PASS

Final:
READY_TO_FREEZE
```
