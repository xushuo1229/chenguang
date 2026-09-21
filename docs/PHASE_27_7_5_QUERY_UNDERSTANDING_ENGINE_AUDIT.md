# Phase 27.7.5 Query Understanding Engine Audit

## Audit Result

READY_TO_FREEZE

## Scope

| File | Review Result |
| --- | --- |
| `backend/src/services/agentQueryUnderstanding/queryUnderstandingEngine.js` | PASS |
| `backend/test/agentQueryUnderstanding.test.js` | PASS |
| `docs/PHASE_27_7_5_QUERY_UNDERSTANDING_ENGINE_IMPLEMENTATION.md` | PASS |
| `agentContextSelection/` | Unchanged |
| `agentFirewall/` | Unchanged |
| `agentGateway/` | Unchanged |
| Provider / HTTP API | Unchanged |

## Architecture Review

PASS

1. `27.7` deterministic reasoning chain保持不变。
2. `27.7.1` 的 Query Understanding 位置正确。
3. `27.7.2` Context Selection architecture未被绕过。
4. `27.7.3` contract是唯一输出契约。
5. `27.7.4` Context Selection Engine保持冻结。
6. Engine 没有接入 HTTP API、Gateway、Firewall 或 Provider。

## Determinism Review

PASS

1. 同一 input + control plane 输出 semantic equality。
2. 没有 random、async ordering、wall clock、Provider 或 LLM 依赖。
3. `interpretationId` 与 `metadata.fingerprint` 由 canonical hash deterministic 派生。
4. Relative time 没有显式 `referenceTime` 时进入 ambiguity，不读取系统时间。

## Contract Review

PASS

1. Contract version 精确为 `query-understanding-v1`。
2. Closed schema、unknown field fail closed。
3. Intent、queryType、scope、ambiguity、clarification、selection hints 枚举一致。
4. Course refs ≤ 3，knowledge refs ≤ 5。
5. Serialized data plane ≤ 4096 bytes。
6. 输出通过 frozen `validateQueryUnderstanding()`。

## Security Review

PASS

1. Query、user context、conversation context 保留为 untrusted DATA。
2. Prompt injection 不执行。
3. Secret extraction 不响应。
4. Control-plane identity 不进入 data plane。
5. 没有数据库、CGStore、Provider、memory writer、evidence writer、insight writer 或 reasoning writer 访问。
6. Engine 不执行 tool、plan、action 或 autonomous loop。

## Data Truthfulness Review

PASS

1. Raw query 保留 untrusted user authority。
2. Explicit course / knowledge reference 保留 explicit provenance。
3. Current course context 保留 system context authority。
4. Inferred scope 不伪装成 fact。
5. Reference 不验证 existence，也不伪造 Knowledge Node。
6. User context 不升级为 evidence、insight、reasoning 或 system fact。

## Boundary Review

PASS

1. 不 retrieve context。
2. 不 select context。
3. 不 answer。
4. 不 create truth。
5. 不 reason。
6. 不 plan。
7. 不 act。
8. 不调用 LLM。
9. 不执行工具。

## Compatibility Review

PASS

1. Frozen `selectLearningContext()` 可直接消费 Engine 输出。
2. Explicit course / knowledge integration PASS。
3. Ambiguous query 由 Context Selection rejected。
4. Unsupported query 在 Context Selection 之前保持 rejected。
5. Context Selection budget、ownership、authority 和 selection decision 未改变。

## Privacy Review

PASS

1. 输入字段全部 allowlist。
2. 无 full CGStore dump、raw database row 或 cross-user payload。
3. User context non-persistent。
4. Conversation context ephemeral。
5. Data plane 不包含 `ownerUserId`。

## Test Verification

```yaml
Query Understanding focused tests: 23/23 PASS
Backend regression: 282/282 PASS
Frontend regression: 609/609 PASS
Build: PASS
git diff --check: PASS
```

## Findings

### Critical

None

### High

None

### Medium

None

### Low

None

### Info

1. Reference recognition当前是 deterministic lexical matching，不是 semantic parser。这是 v1 的有意边界。
2. 没有显式 `referenceTime` 的相对时间进入 safe ambiguity，而不是使用 wall clock。这是安全优先行为。

## Final Verdict

READY_TO_FREEZE
