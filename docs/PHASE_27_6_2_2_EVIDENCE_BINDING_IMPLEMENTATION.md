# Phase 27.6.2.2 Evidence Binding Implementation

## Baseline

- Architecture: Personal Learning Agent Architecture v1.1
- Context Firewall Contract: Phase 27.6.1
- Output Contract: Phase 27.6.2.1
- Implementation commit: `6590516 feat: add evidence binding validator`

## Contract

`agent-evidence-binding-v1` 是 LLM 输出进入用户前的最后引用安全层。它只消费 `agent-llm-context-v1` 与 `agent-llm-output-v1`，不访问数据库、网络、Provider SDK 或 API Key。

Validator 返回：

```js
{
  version: 'agent-evidence-binding-v1',
  valid: true,
  contextSnapshotId: '<sha256>',
  references: [],
  violations: [],
  fallback: null
}
```

任何失败都会整体 fail-closed，并返回：

```js
{
  available: false,
  reason: 'evidence_binding_failed'
}
```

## Validation Rules

- Insight reference 必须存在于当前 firewall context。
- Evidence reference 必须绑定到 context 中对应 Insight 的真实 Evidence。
- Reasoning reference 必须存在于 context，并且与其声明的 Insight 匹配。
- Reference 类型不能错用。
- Output 中携带的 owner identity 必须与 context owner 一致。
- Context snapshot 必须存在且与 firewall context 的 SHA-256 摘要一致。
- 空 references、重复 references、malformed output 和 fallback payload 都会被拒绝。
- 校验失败时仍然报告所有可判定的 violation，但不允许部分通过。

## Boundary

新增实现：

- `backend/src/services/agentEvidenceBinding/evidenceBindingContract.js`

新增测试：

- `backend/test/agentEvidenceBinding.test.js`

所有函数保持 pure、deterministic、read-only。Validator 不执行 mutation，不创建 Evidence，不修改 Insight、Knowledge State、Memory 或任何业务数据。

最终链路保持：

```text
LLM
→ Output Contract Validator
→ Evidence Binding Validator
→ Validated Explanation
→ User
```

## Test Results

- Backend: 154/154 PASS
- Frontend: 598/598 PASS
- Build: PASS
- `git diff --check`: PASS
- Desktop browser smoke 1920x1080: PASS
- Mobile browser smoke 375x812: PASS
- Console errors / page errors / HTTP >= 400 / horizontal overflow: 0

## Limitations

本层只做引用存在性、类型、所有权和 snapshot 完整性验证。语义、数值和时间一致性属于后续 `Phase 27.6.2.3 Semantic / Numerical / Temporal Validation`。
