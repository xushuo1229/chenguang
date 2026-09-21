# Phase 27.7.6 Learning Conversation Runtime Architecture

## 1. Goal

把已冻结的 Query Understanding、Context Selection、Context Firewall、Deterministic Reasoning、Provider、Output Validator 组成一次只读 Learning Conversation Runtime，而不是新增聊天系统。

## 2. Contract

```text
learning-conversation-v1
```

Response:

```json
{
  "version": "learning-conversation-v1",
  "userId": 1,
  "readOnly": true,
  "status": "validated | fallback | clarification_required",
  "modeHint": "concept_explanation",
  "queryUnderstanding": {},
  "contextSelection": {},
  "explanation": {},
  "permissions": {
    "read": ["learning_context", "selected_context"],
    "write": []
  },
  "metadata": {}
}
```

## 3. Pipeline

```text
User Query
  → Input Allowlist
  → query-understanding-v1
  → context-selection-v1
  → Agent Home learning-context-v1
  → agent-insight-v1
  → agent-reasoning-v1
  → Context Firewall
  → Provider / deterministic fallback
  → Output Validator
  → learning-conversation-v1
```

## 4. Boundaries

1. Runtime 不写 Todo、Goal、Analytics、Memory、Knowledge Node、Evidence 或 Reflection。
2. Runtime 不执行 tool、plan、action 或 autonomous loop。
3. High ambiguity、unsupported intent、empty selection 或 rejected selection 直接返回 `clarification_required`，不调用 Provider。
4. Provider 失败继续使用 deterministic fallback。
5. LLM 是解释层，不是 Source of Truth。

## 5. API Boundary

```text
POST /api/agent-home/learning-conversation
Authorization: JWT
Rate Limit: aiLimiter
```

Input:

```json
{
  "query": "解释 Promise",
  "currentCourseLabel": "JavaScript"
}
```

`query` 上限 1000 字符；`currentCourseLabel` 上限 120 字符；unknown field fail closed。

## 6. Frontend Integration

Agent Home 增加 Learning Conversation card。UI 显示：

1. Loading 状态。
2. validated / fallback 解释。
3. Context transparency。
4. Learning mode hint。
5. 友好错误状态，不暴露 Provider internals。

## 7. Freeze

本架构已冻结。后续扩展必须新建 Phase。
