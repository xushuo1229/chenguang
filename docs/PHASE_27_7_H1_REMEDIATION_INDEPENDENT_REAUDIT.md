# Phase 27.7 H-1 Remediation Independent Re-Audit

Date: 2026-09-20

Final Verdict: **READY_TO_FREEZE**

## 1. Scope

本复审只核对 Phase 27.7 H-1 Remediation 的代码级整改，不评估新功能，不启动 Phase 27.7.1。

核心问题：

```text
H-1：ownerUserId 与内部元数据被传入外部 LLM Provider Prompt。
```

整改目标：

```text
Control Plane（所有权、校验、Snapshot 绑定）
    ≠
Data Plane（LLM 可见 Provider Payload）
```

## 2. Implementation Review

### 2.1 Gateway Boundary

`backend/src/services/agentGateway/runtimeGateway.js:95-97`

```text
buildLlmContext()        → 内部校验与投影上下文
toProviderPayload()      → Provider 数据面 payload
computeContextSnapshotId() → Validator 绑定快照
```

Gateway 不再把完整 `firewallContext` 传给 Provider，而是只传 `providerPayload`
（`runtimeGateway.js:135`）。

### 2.2 Provider Defense-in-Depth

`backend/src/services/agentProvider/openaiCompatibleProvider.js:81`

Provider 在构造 Prompt 前再次执行：

```text
toProviderPayload(context)
```

即使调用方误传内部上下文，Provider 也会重新投影，而不是直接序列化进入 Prompt。

### 2.3 Identity Ownership

本次按更严格原则执行：`ownerUserId` 不只从 Provider payload 移除，也从
`agent-llm-context-v1` 本体移除。

- `backend/src/services/agentFirewall/contextFirewall.js:154-174`：
  `buildLlmContext()` 产物不再包含 `ownerUserId`。
- `backend/src/services/agentEvidenceBinding/evidenceBindingContract.js:81-92,142`：
  所有权校验改为从控制面显式接收 `ownerUserId`。
- `backend/src/services/agentGateway/runtimeGateway.js:168-172`：
  Gateway 在 Validator 阶段传入 `context.userId`，身份不进入 LLM 数据面。

### 2.4 Snapshot Semantics

`computeContextSnapshotId()` 现在绑定的是 identity-free 的 LLM 投影上下文。
Snapshot 仍用于同一请求内的 Context / Output 绑定，不承担授权职责；授权身份由
Gateway 在控制面持有并显式传入 Evidence Binding。

## 3. Security Review

| Review Item | Result |
|---|---|
| `ownerUserId` 不进入 `agent-llm-context-v1` | PASS |
| `ownerUserId` 不进入 Provider payload | PASS |
| 未知字段 / 注入字段不进入 Provider payload | PASS |
| Provider 侧二次投影 | PASS |
| LLM 身份伪造 fail-closed | PASS |
| 所有权校验保留在 Validator 链 | PASS |

## 4. Test Verification

```yaml
Backend:
  233/233 PASS

Frontend:
  609/609 PASS

Build:
  PASS

git diff --check:
  PASS
```

## 5. Browser Verification

生产版 `npm run preview` 后访问 `agent-home.html`：

| Viewport | Layout | Horizontal Overflow | Console Errors | Page Errors | HTTP >= 400 |
|---|---:|---:|---:|---:|---:|
| 1920×1080 | PASS | 0px | 0 | 0 | 0 |
| 375×812 | PASS | 0px | 0 | 0 | 0 |

移动端在未登录状态下显示业务空态，属于预期只读失败面，无技术性运行错误。

## 6. Findings

```text
Critical: 0
High: 0
Medium: 0
Low: 0
```

No new findings.

## 7. Architecture Impact

- 修改范围限定在 Agent Context / Gateway / Provider / Evidence Binding 边界。
- 未修改 CGStore、Analytics、Goals、Sync、Course System、Knowledge State、
  Reflection、Memory、Todo、Today Plan。
- 未引入新持久化模型、新存储、后台任务或 AI 写操作能力。
- 该变更收紧了既有边界，未改变用户可见业务行为。

## 8. Final Recommendation

Phase 27.7 架构冻结前置条件已满足：

```text
Context Firewall: PASS
Provider Boundary: PASS
Identity Isolation: PASS
Contract: PASS
Regression: PASS
Security: PASS

Critical / High / Medium: 0
```

建议进入独立 documentation freeze commit。
