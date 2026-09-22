# Phase 37 Personal Agent Workspace Redesign

## 1. Objective

`ai.html` 从旧 AI Chat 页面升级为 Personal Agent 主入口。用户可见命名统一为 `Personal Agent` / `个人 Agent`，核心体验由 Agent Dashboard、Learning State、Evidence、Insight、Action Proposal 和 Conversation Workspace 组成。

## 2. Architecture

```text
User Query
  → Personal Agent API Client
  → GET /api/personal-agent/context
  → POST /api/personal-agent/chat
  → Personal Agent Runtime
      ├── General Mode: Provider only，禁止访问用户数据
      └── Personal Mode: Agent Home Context
            → Query Understanding
            → Context Selection
            → Selected Context Projection
            → Context Firewall
            → Deterministic Reasoning
            → Provider
            → Output Validation
            → Evidence Binding
  → Agent Conversation UI
```

新增后端层：

- `backend/src/services/personalAgentRuntime.js`：Personal Agent 上下文、模式路由、provider fallback、只读 action proposal。
- `backend/src/routes/personalAgent.js`：`GET /api/personal-agent/context` 与 `POST /api/personal-agent/chat`，均要求登录和限流。

前端层：

- `js/apiClient.js` 新增 `CGAPI.personalAgent.context()` 与 `CGAPI.personalAgent.chat()`，组件不直接 `fetch`。
- `ai.html` 新增三栏 Agent Workspace：Conversation History、Agent Conversation、Context / Learning State。
- `pages/ai.js` 增加 mode switch、Context 渲染、Evidence Answer、Action Proposal 与用户确认入口。

## 3. Product Scope

### Personal Mode

- 默认模式。
- 只复用既有 Agent Home、Learning Conversation、Insight、Practice、Review、Course Knowledge 数据链。
- 回答携带 Evidence，说明“基于你的学习记录”。
- Action 只能以 proposal 呈现，必须用户确认后调用既有确认端点。

### General Mode

- 仅发送用户 message 到 provider。
- 不读取 Personal Context、Course Knowledge、Evidence 或用户业务数据。
- provider 缺失、输出失败或请求失败时收敛为安全 fallback。

## 4. Brand Migration

用户可见的 `AI 教练` / `AI Coach` 标题迁移为 `个人 Agent` / `Personal Agent`。内部兼容键名、历史存储键和模块名保持不变，避免破坏既有数据和 API。

## 5. Safety Boundary

- LLM 不是事实来源。
- Agent 不自动写入业务数据。
- 所有行动必须：Proposal → User Confirm → Existing Execution Endpoint。
- Personal Context 经 Selection 与 Projection 进入请求；General Mode 与个人数据隔离。
- provider 错误、空输出和非法输出都有确定性安全兜底。

## 6. Validation

```yaml
Frontend: 623/623 PASS
Backend: 321/321 PASS
Build: PASS
git diff --check: PASS
Browser Desktop 1920x1080: PASS
Browser Mobile 375x812: PASS
Console Errors: 0
Page Errors: 0
Unexpected 4xx/5xx: 0
Horizontal Overflow: 0
```

Browser 覆盖登录、Context Panel、Conversation History、Personal Mode、Evidence Answer、General Mode、provider fallback 与 Action Proposal 展示。Action 执行仍由既有自动化测试确认必须显式确认。

## 7. Out of Scope

- 不实现 Agent 自主执行。
- 不实现 Planner 自动落库。
- 不实现 Memory Writer。
- 不新增第二套数据系统。
- 不修改既有 API 契约或 Agent 核心架构。

## 8. Remaining Risk

- 当前测试环境 provider 不可用时，Personal / General 请求在 provider 超时后进入兜底；真实 provider 配置后的响应质量仍需后续产品数据观察。
- Conversation History 目前使用页面会话级存储，长期会话与云端 Memory 属于后续阶段。

## 9. Status

`PHASE 37 IMPLEMENTATION COMPLETE`
