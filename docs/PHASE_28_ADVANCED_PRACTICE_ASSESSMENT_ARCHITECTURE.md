# Phase 28 Advanced Practice / Assessment Architecture

Status: IMPLEMENTATION_CONTRACT

Baseline: `52ed887 docs: freeze phase 27.8 personal learning agent final audit`

## 1. Goal

把 Practice 扩展为可判分的 Assessment Engine：

```text
Course Node / Evidence
  → Deterministic Assessment Builder
  → User Answer
  → Server-side Scoring
  → Practice Attempt + Knowledge Evidence
  → Student Knowledge State
```

Assessment 不是新数据系统，不是 AI 自动评分系统，也不是 Mastery Store。

## 2. Authority

1. Course Knowledge 与 Evidence 是题目事实来源。
2. Student Knowledge State 是掌握状态唯一来源。
3. Assessment score 只是 evidence，不直接写 mastery。
4. User answer 是评估输入，不能改写题目、Evidence 或 Knowledge Node。
5. LLM 不参与 Phase 28 判分。

## 3. Contract

```text
assessment-item-v1
assessment-result-v1
```

Assessment item：

```json
{
  "itemId": "string",
  "kind": "concept_recall | evidence_quote",
  "prompt": "string <= 500",
  "evidenceId": "string | null",
  "hints": []
}
```

Assessment submission：

```json
{
  "confirmed": true,
  "courseId": "string",
  "knowledgeNodeId": "string",
  "durationMs": 0,
  "answers": [{ "itemId": "string", "response": "string <= 2000" }]
}
```

Result：

```json
{
  "attempt": {},
  "mastery": {},
  "assessment": {
    "version": "assessment-result-v1",
    "score": 0,
    "items": []
  }
}
```

## 4. Deterministic Generation

1. 最多 5 items。
2. 每个题必须绑定 Course Node 或 Course Evidence。
3. 无 definition 与 evidence 时返回 `INSUFFICIENT_ASSESSMENT_SOURCE`。
4. Prompt 与 expected 稳定生成。
5. 不暴露 `expected`；服务端按 itemId 重建并判分。

## 5. Scoring

1. `answerText` 去除控制字符与标点，归一化空白。
2. keyword overlap 产生 0–1 分。
3. score 是 finite unit。
4. item score 平均后写入 Practice attempt。
5. 判分函数 deterministic，无 provider dependency。

## 6. Write Boundary

```text
User confirmation
  → ownership validation
  → one SQLite transaction
  → student_practice_attempts
  → student_knowledge_evidence
  → student_knowledge_states update
```

1. `confirmed !== true` 拒绝。
2. Course、Node、Evidence 必须属于 owner。
3. attempt 与 evidence 必须同事务，避免 Phase 27.8 记录的 orphan attempt。
4. 不创建 assessment session 持久化表。
5. 不创建第二套 mastery state。

## 7. Security

1. Route 必须使用 JWT。
2. 写操作使用 `writeLimiter`。
3. Response 不暴露内部堆栈、expected 答案全文或 provider 信息。
4. User answer 是 DATA，不作为 INSTRUCTION。

## 8. Non-goals

1. AI 出题。
2. 自动学习计划。
3. 自适应调度算法。
4. action executor。
5. history model rewrite。
6. Analytics rewrite。

## 9. Tests

必须覆盖：

1. 空来源拒绝。
2. 未确认拒绝。
3. cross-user course / node / evidence 隔离。
4. deterministic scoring。
5. attempt + evidence 同事务。
6. mastery state 更新。
7. API authentication。
