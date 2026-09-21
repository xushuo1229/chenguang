# Phase 27.7.6 Practice Foundation, Mastery Promotion Gate, and Review Queue

## 1. Goal

在 MVP Runtime 之上加入最小学习闭环：练习记录、掌握晋级闸门和复习队列。全部能力保持 additive，不替换 Student Knowledge State。

## 2. Architecture

```text
Practice Attempt
  → user confirmation
  → user / course / knowledge node ownership validation
  → student_practice_attempts append-only log
  → existing Student Knowledge State evidence aggregation
  → Mastery Promotion Gate
  → Review Queue
```

## 3. Data Boundary

新增：

```text
student_practice_attempts
```

1. Practice attempt 是 append-only user-owned log。
2. Mastery State 仍只由 `student_knowledge_evidence` 聚合。
3. Practice 通过现有 `recordEvidence()` 写入 assessment evidence，不创建第二套掌握模型。
4. 不使用 FSRS、BKT 或 AI inference。

## 4. API Boundary

```text
POST /api/learning/practice/attempts
GET  /api/learning/practice/attempts
GET  /api/learning/mastery-promotion/:courseId
GET  /api/learning/review-queue/:courseId
```

规则：

1. 全部要求 JWT。
2. 写操作使用 `writeLimiter`。
3. Practice record 必须显式 `confirmed = true`。
4. `score` 必须是 0–1。
5. Course、Knowledge Node 与 owner 必须一致。

## 5. Mastery Promotion Gate

```text
mastery-promotion-gate-v1
```

Pass criteria:

1. `masteryLevel >= 0.75`
2. `evidenceCount >= 2`
3. 存在 assessment evidence

Gate 只读派生，不自动晋级、不自动改写用户数据。

## 6. Review Queue

```text
review-queue-v1
```

1. 只包含未 mastered 的 Knowledge State。
2. Weak state priority 高于 learning state。
3. 同级按 mastery 升序、title lexicographic 排序。
4. Queue 是 projection，不是持久化队列。

## 7. Tests

```yaml
Practice / Mastery / Review focused tests: 3/3 PASS
Backend regression: 289/289 PASS
Frontend regression: 611/611 PASS
Build: PASS
```

## 8. Freeze

Practice Foundation、Mastery Promotion Gate、Review Queue 已冻结。后续若引入 spaced repetition、AI 出题、自动评分或自动学习计划，必须新建 Phase。
