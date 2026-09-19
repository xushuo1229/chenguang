# Phase 27.6.4 · LLM Runtime Gateway 架构

状态：FROZEN（2026-09-19，独立 Re-Audit READY_TO_FREEZE，见 PHASE_27_6_4_LLM_RUNTIME_GATEWAY_INDEPENDENT_REAUDIT.md）

> **残余路径声明（Re-Audit M-1，方案 ②）**：经 `options.provider` 注入的 provider 若返回
> `failed` 信封且 `reason` 不在 `FAIL_REASONS` 词汇内，`buildFallbackOutput` 产出的非法
> fallback 会被 `GATEWAY_INVARIANT_BROKEN` 防线拒绝（fail-closed 500）。该路径仅存在
> 于注入非契约 provider 的场景（27.6.3 工厂产出的信封不可能携带非法 reason，registry
> 路径完全闭合）。**Phase 27.7 装配禁止注入非契约 provider**；若需要放开，必须先加
> reason 白名单守卫（`FALLBACK_REASONS.has(reason) || (reason = 'llm_unavailable')`）
> 并补回归用例（含 partial 端到端用例，Re-Audit L-1）。
日期：2026-09-19
前置：Phase 27.6.3 LLM Provider Abstraction（已冻结 a927aaa）
能力等级：L1 — Bounded Context Read Layer（不变）

---

## 0. 定位与 Scope

27.6.3 打通了「如何安全地调一次 LLM」（Provider 边界）；27.6.2.x 建成了「如何信任 LLM 的输出」（三道 Validator）。但两段之间还没有运行时粘合——谁负责把防火墙上下文交给 Provider、把原始 reply 交给 Validator、把一切失败翻译成确定性兜底？

27.6.4 交付这个运行时：**Runtime Gateway（一次解释请求的编排器）**。

```text
DATA → FACT → INSIGHT → EVIDENCE → REASONING   （既有确定性层，不变）
      → 【Runtime Gateway ← 27.6.4】
            内部顺序执行（结构上不可绕过）：
            1. contextFirewall.buildLlmContext   （Context Firewall）
            2. providerRegistry → provider       （27.6.3 Provider）
            3. JSON.parse(reply)                 （失败 → llm_malformed）
            4. outputContract.validateOutputContract
            5. evidenceBinding.validateEvidenceBinding（快照绑定）
            6. semanticValidator.validateSemanticValidation
            7. 全绿 → validated 输出；任一失败 → 确定性兜底输出
      → 运行时结果信封（本 Phase 新契约）
```

### 明确不做（Non-Goals）

- 不实现 Chat / 会话界面（无多轮、无消息历史）。
- 不实现 Planner / Autonomous Action（Gateway 无任何写路径、无工具、无执行面）。
- 不修改 Memory / CGStore / Analytics / Goals / Sync / Student Knowledge State。
- **不新增任何 HTTP 路由**（`/api/agent-home/*` 三条不变；HTTP 契约属 27.7 MVP Architecture 的装配职责）。
- 不实现 Prompt 模板体系（属 27.6.5 Prompt Template Contract；本 Phase 原样消费 27.6.3 适配器内置 Prompt）。
- 不加缓存、不加重试、不加队列、不加后台任务——一次请求一次编排，纯函数式无状态。

### 0.1 冻结面修复（纳入本 Phase 交付，独立架构审计判定项）

实现前独立审计发现：`agentOutputValidator/outputContract.js` 的 `validateOutputContract` 对 `status:'fallback'` 的 explanations 存在**双重校验冲突**——通用 pass 无条件运行 `validateExplanation`（要求 `type`/`text`，把 `insightId/title/why` 判为 UNKNOWN_FIELD），fallback 分支的 `validateFallbackExplanation` 却要求 `insightId/title/why` 并禁止 `type/text`。两套要求不可同时满足，**非空 fallback explanations 永远无法通过校验**（已独立复现实证）；冻结测试仅覆盖空解释形态，缺陷潜伏至今。

而 27.6.2.1 冻结规范（PHASE_27_6_2_1_OUTPUT_CONTRACT_IMPLEMENTATION.md）本意即「fallback explanations 使用 deterministic reasoning 结构」。**判定：实现偏离冻结规范，修复 = 对齐规范，非破坏冻结契约**。修复方案（最小面）：

- `validateOutputContract` 中，当 `candidate.status === 'fallback'` 时 explanations **仅**经 `validateFallbackExplanation` 校验（跳过通用 `validateExplanation` pass）；`validated`/`partial` 路径行为零变化。
- 回归测试（补入 `backend/test/agentLlmOutputContract.test.js`）：非空 fallback 解释通过；带 `type/text` 的 fallback 解释仍被拒（形态守卫保留）；validated 输出含 `insightId/title/why` 仍被拒（原行为不变）。

---

## 1. Gateway Boundary（网关边界）

### 1.1 位置与唯一入口

```text
调用方（未来 = 路由层；本 Phase = 测试）
   │  只允许传：{ context, insights, reasoning, task }
   ▼
runtimeGateway.runExplanation() ──── 唯一公共入口
   │
   ├─ buildLlmContext({context, insights, reasoning, task})
   │     ↑ Gateway 不接受现成的防火墙上下文——防火墙构建在网关内部完成，
   │       「绕过防火墙」在结构上不可能（输入契约与 buildLlmContext 相同）。
   ├─ computeContextSnapshotId(firewallContext)（快照绑定，调用方无法错配）
   ├─ providerRegistry.resolveAgentProvider()（可注入 stub 覆盖）
   ├─ provider.generateExplanation({context: firewallContext, task})
   └─ 按 §2 流水线推进 → gateway 结果信封
```

### 1.2 输入

与 `buildLlmContext` 完全同构的三段确定性产物 + task：

- `context`（learning-context-v1）、`insights`（agent-insight-v1）、`reasoning`（agent-reasoning-v1）
- `task ∈ contextContract.TASKS`

Gateway **不感知** userId 之外的任何身份信息、数据库、req/res。三段输入的合法性由 `buildLlmContext` 内部的 `validateFirewallInput` 强制（所有权/敏感键/形状违规直接向上抛——那是编排调用方的 bug）。

### 1.3 输出：Gateway 结果信封（冻结形态）

```jsonc
{
  "status": "validated" | "fallback",
  "output": { /* 完整 agent-llm-output-v1 对象（validated=LLM 产出过三道校验；
               fallback=确定性产出，直接可用） */ },
  "meta": {
    "gatewayVersion": "agent-runtime-gateway-v1",
    "task": "explain_daily",
    "requestId": "<uuid>",
    "contextSnapshotId": "<hash>",
    "provider": "openaiCompatible",
    "model": "deepseek-chat",
    "promptVersion": "agent-llm-provider-prompt-v1",
    "latencyMs": 123,
    // validated 路径：
    "validators": { "outputContract": true, "evidenceBinding": true, "semantic": true },
    // fallback 路径：
    "fallbackReason": "llm_timeout"        // ∈ FALLBACK_REASONS
  }
}
```

铁律：

- **Gateway 是全函数**：除输入契约违规（上游 bug）外，任何运行时失败都产出合法结果信封，绝不产出部分可用状态。唯一抛错例外：`GATEWAY_INVARIANT_BROKEN`（§0.1 修复后，确定性兜底数据违反 Output Contract 属不可触达的不可能状态，是编程错误防线而非运行路径）。
- **`status:'fallback'` 的 output 由确定性推理层构建**（见 §3），Gateway 自身永不编造解释文本。
- 信封里没有密钥、没有上游错误细节、没有原始 reply（validated 时 reply 已被 parse 并校验；原始文本不留存）。

---

## 2. Runtime Pipeline（运行时流水线）

`validated` 路径（全部成功才返回）：

```text
envelope.status === 'ok'
  → JSON.parse(envelope.reply)
      失败 → fallback(llm_malformed)
  → candidate = parse 结果
  → outputContract.validateOutputContract(candidate)
      失败 → fallback(llm_schema_invalid)
  → evidenceBinding.validateEvidenceBinding({firewallContext, output: candidate,
        expectedSnapshotId: 网关内部计算的快照 id})
      失败 → fallback(llm_evidence_mismatch)
  → semanticValidator.validateSemanticValidation({firewallContext, output: candidate})
      失败 → fallback(按 §4 映射：llm_unsafe / llm_unsupported_claim)
  → 全绿 → { status:'validated', output: candidate, meta.validators 全 true }
（candidate.status ∈ {'validated','partial'} 均视为链路成功；结果信封 status 统一记
  'validated'——内层 output.status 保留原值，信息无损；partial 与 validated 共用
  同一校验分支，行为一致由组 12 回归用例锁定。）
```

`fallback` 路径（任何一步失败或 Provider failed 信封）：

```text
Provider 信封 status==='failed'
  → fallback(envelope.reason)               // llm_* 词汇原样承接
Provider 违约直接抛错（27.6.3 契约不应发生，防御性兜底）
  → fallback(llm_unavailable)
options.provider 显式注入但形状非法（调用方 bug）
  → throw GATEWAY_PROVIDER_INVALID（输入契约违规）
registry 解析结果为 null（配置不可用）
  → fallback(llm_not_configured)
```

语义约束：

- 三道 Validator 的调用**顺序固定**（Output Contract → Evidence Binding → Semantic），且 Evidence Binding 内部会重跑 Output Contract、Semantic 内部也会重跑 Output Contract——Gateway 显式串行调用是为了让 `meta.validators` 逐层留痕，失败定位到第一道闸。
- **`FALLBACK_NOT_BINDABLE`**：Evidence/Semantic Validator 拒绝 fallback 输出（设计使然：它们只服务 LLM 产出）；因此 fallback 路径**不再**经过这两道 Validator，只经 `validateOutputContract` 自检（依赖 §0.1 修复后 Output Contract 对 fallback explanations 的分支优先级——修复前非空兜底解释无法通过校验）——确定性兜底若连 Output Contract 都不过，属不可能状态（编程错误防线），Gateway 抛 `GATEWAY_INVARIANT_BROKEN`（大声失败，绝不交付）。
- 快照一致性：`expectedSnapshotId` 由 Gateway 内部对同一 `firewallContext` 调用 `evidenceBindingContract.computeContextSnapshotId`（归属 `agentEvidenceBinding/evidenceBindingContract.js`）计算，LLM 收到的上下文与校验所依据的上下文**结构上同一**。

## 3. Fallback Construction（确定性兜底构建）

兜底输出 = **把 agent-reasoning-v1 的确定性解释翻译成 agent-llm-output-v1 的 fallback 形态**：

```jsonc
{
  "schemaVersion": "agent-llm-output-v1",
  "status": "fallback",
  "available": false,
  "fallback": { "type": "deterministic_reasoning", "reason": "<llm_* 原因>", "source": "agent-reasoning-v1" },
  "explanations": [
    { "id": "fallback:<reasoningId>", "insightId": "...", "title": "...", "why": "...",
      "evidenceRefs": [{ "insightId": "...", "evidenceId": "<insightId>:<index>", "metric": "...", "period": "..." }] }
  ],
  "suggestions": [], "uncertainties": [],
  "metadata": { "readOnly": true, "actionLevel": "insight_only", "providerIndependent": true }
}
```

- 来源：防火墙投影后的 `reasoning.explanations`（≤6 条，Gateway 截取前 `MAX_EXPLANATIONS`=5 条；每条的 `evidenceRefs` 按防火墙投影逐条翻译，`evidenceId = <insightId>:<index>`，只引用真实存在的高质量证据）。
- **防御性引用治理（整条治理，M-1）**：防火墙投影的 refs 携带 `insightId/index/metric/period` 全部字段（`contextFirewall.projectReasoning`），但底层 `index` 稠密性/`metric`/`period` 非空由 reasoning 层实现惯例保证而非防火墙契约强制（27.6.1 冻结面，本 Phase **不**收紧防火墙校验以免改变合法输入面）。逐 ref 过滤会留下稀疏 refs（`index 0,2 残留` → evidenceId 位置错配），故按**整条治理**：条目内**任一** ref 不合格（`!(Number.isInteger(index) && index >= 0 && metric && period)`）、或过滤后 refs 不满足稠密性（每个 ref 的 `index === 其在输出数组中的位置`，从 0 起）、或 `insightId` 不可回查（firewallContext.insights 中对应 insight 不存在或 `index >= evidence.length`）时，**整条丢弃该条目**；`evidenceId` 一律取 `<insightId>:<数组位置>`（稠密性下与 ref.index 相等）。不变量由测试锁定：稀疏 refs（合法输入）→ 条目整条丢弃且信封合法；不可回查 insightId → 整条丢弃；真实投影数据零丢弃（绊线）。
- **id 有界化**：`id = 'fallback:' + reasoning.id`（如 `fallback:reasoning:focus-trend-7d`）；当组合超过 `MAX_ID_LENGTH`(120) 时改用 `fallback:` + `sha256(reasoning.id)` 前 24 位十六进制（96-bit 截断，确定性、碰撞概率工程上可忽略、恒 ≤ 120）。
- **字节预算压力策略**：构建完成后按 `contextFirewall.fitToBudget` 同策略从尾部整条丢弃 explanations，直至序列化字节 ≤ `OUTPUT_LIMITS.MAX_TOTAL_OUTPUT_BYTES`(8192)；丢弃后为空仍超限的病态输入才触发 `GATEWAY_INVARIANT_BROKEN`。5 条 × 240 字 CJK 满载场景由压力测试锁定 ≤ 8192。
- reasoning 层本身不可用（`available:false` / 空解释）时：`explanations: []` 的纯 fallback 信封（Output Contract 允许 fallback + 空解释）。
- 文本全部来自确定性层（`title`/`why` 已被防火墙限幅 240 字符），Gateway 不增删改任何文字。
- 兜底永远退向**确定性推理**，绝不退向「再试一次 LLM」或「放宽校验」。
- **registry 解析 null 分支的信封取值**：`meta.provider = 'none'`、`model = ''`、`promptVersion = ''`、`latencyMs = 0`（Provider 未被调用，如实留空/零；gatewayContract 校验允许该空态）。

## 4. Failure Taxonomy（失败词汇映射，全表）

| 失败点 | 终端 fallbackReason |
|---|---|
| Provider 信封 `status:'failed'` | 信封 reason 原样（⊆ FAIL_REASONS） |
| registry 解析 null | `llm_not_configured` |
| `JSON.parse(reply)` 失败 | `llm_malformed` |
| Output Contract Validator 否决 | `llm_schema_invalid` |
| Evidence Binding Validator 否决 | `llm_evidence_mismatch` |
| Semantic Validator：`SEMANTIC_SCOPE_VIOLATION` | `llm_unsupported_claim` |
| Semantic Validator：其余违规 | `llm_unsafe` |

全部 ∈ `outputContract.FALLBACK_REASONS`（测试锁定）。Gateway 不发明新词汇。

## 5. Statelessness & Concurrency（无状态与并发）

- Gateway 模块无可变模块级状态：无缓存、无计数器、无单例可变字段；每次调用独立。
- 输入三段产物与防火墙上下文在编排过程中只读；输出信封是每次新建的对象。
- 并发安全由纯函数性保证（Node 单线程内无需锁）；Gateway 内部唯一的异步等待是 Provider 调用（其超时已由 27.6.3 边界竞速保证）。

## 6. Security Boundary（安全边界）

- **只读管道不变**：Gateway 不产生任何写操作；不接触数据库/Store/Analytics/Goals/Sync/KnowledgeState/Memory。
- **静态依赖白名单**（测试强制）：`gatewayContract` / `runtimeGateway` / `fallbackOutput` 三个模块的 require 目标仅限：`agentProvider/providerContract`（类型常量）、`agentProvider/providerRegistry`、`agentFirewall/contextFirewall`、`agentFirewall/contextContract`、`agentOutputValidator/outputContract`、`agentEvidenceBinding/evidenceBindingContract`、`agentSemanticValidator/semanticValidatorContract`、`agentReasoning/reasoningContract`（常量）、`node:crypto`、`node:util`。出现任何 db/store/sync 依赖即为架构违规。
- **无原始 reply 留存**：validated 输出经过 parse + 三道校验后，信封不携带原始文本；fallback 信封不携带 LLM 文本。
- **错误收敛**：meta 只带 `fallbackReason`（∈ FALLBACK_REASONS），不透出 Provider/上游细节、堆栈、URL。
- 输入不可变性：测试以深冻结 + 深比较证明 Gateway 编排前后三段输入与防火墙上下文逐字节不变。

## 7. Isolation & Testability（隔离与可测性）

- Provider 可注入（`options.provider`），Validator 不可注入（真实模块常驻——校验链不允许被 mock 掉，这是「禁止 mock 核心行为」的架构化表达）。
- 测试注入 stub provider 时，真实三道 Validator 照常执行——链路集成测试因此能够证明「stub 输出被真实校验器否决」。
- `runExplanation` 对同一输入在相同 stub 下产出字节级一致的结果（确定性）。

## 8. 测试计划（backend/test/agentGateway.test.js）

| # | 用例组 | 断言要点 |
|---|---|---|
| 1 | gateway contract | 结果信封形态校验（status/output/meta 必需、meta 白名单、validated 必带 validators、fallback 必带 fallbackReason∈FALLBACK_REASONS）；`GATEWAY_INVARIANT_BROKEN` 路径的构造手段为**测试侧打桩模拟编程错误**（mock validateOutputContract；§7 的「Validator 不可注入」约束生产依赖，不约束测试打桩；M-1 修正后稀疏输入不再能充当构造手段） |
| 2 | happy path | stub provider 返回合法 output → status validated、三 validator 标志全 true、meta 快照 id 与 `computeContextSnapshotId` 一致 |
| 3 | provider failure | stub 返回 failed 信封（timeout / not_configured / unavailable）→ fallback 且 reason 原样承接 |
| 4 | malformed | reply 非 JSON → fallback(llm_malformed) |
| 5 | schema violation | reply 为 JSON 但缺字段/类型错 → fallback(llm_schema_invalid) |
| 6 | evidence mismatch | LLM 编造 evidenceId → fallback(llm_evidence_mismatch) |
| 7 | semantic violation | 数值不一致 → fallback(llm_unsafe)；绝对化断言 → fallback(llm_unsupported_claim) |
| 8 | fallback construction | 兜底 output 通过 validateOutputContract（依赖 §0.1 修复）；explanations 来自 reasoning 投影（≤5、evidenceRefs 可回查、无 LLM 文本）；整条治理不变量（M-1）：稀疏 refs（合法输入）→ 条目整条丢弃且信封合法、不可回查 insightId → 整条丢弃、真实投影数据零丢弃（绊线）；字节压力：5 条 × 240 字 CJK 满载 ≤8192；reasoning 空时空解释信封 |
| 9 | firewall binding | 输入所有权错配（userId 不一致）→ 抛防火墙错误（结构上必须先过防火墙） |
| 10 | isolation | 深冻结输入调用后深比较不变；require 白名单静态扫描（禁 db/store/sync） |
| 11 | determinism | 同输入 + 同 stub → 结果字节级一致 |
| 12 | outputContract 修复回归（§0.1） | 非空 fallback 解释通过 contract；带 type/text 的 fallback 解释仍被拒；validated 含 insightId/title/why 仍被拒（27.6.2.1 原行为不变，补入 agentLlmOutputContract.test.js）；另补：partial 状态零变化用例、fallback explanations >5 → TOO_MANY_EXPLANATIONS 用例 |

## 9. 风险与开放问题

1. **无 HTTP 消费方**：Gateway 在 27.7 装配前无生产调用方（与 27.6.3 相同的「基础设施先行」模式）——风险受控：模块为纯函数库，链路由真实 Validator 常驻测试证明。
2. **冻结面修复的回归风险（§0.1）**：outputContract fallback 分支修复触及 27.6.2.1 冻结实现——修复严格限定于 fallback 分支优先级（validated/partial 零变化），由组 12 回归测试 + 全量后端套件双重保护；27.6.4 的独立 Re-Audit 将复核该修复。
3. **兜底解释长度**：防火墙限幅 240 字符/条 + Gateway 截 5 条 + 字节预算尾部丢弃策略——`GATEWAY_INVARIANT_BROKEN` 仅保护不可能状态。
4. **Prompt 模板演进**：27.6.5 将把 Prompt 收编为版本化模板；本 Phase meta 已带 `promptVersion`，迁移时无需改 Gateway 契约。

## 10. 验收标准

- [ ] `backend/src/services/agentGateway/` 三模块落地，依赖白名单成立。
- [ ] §0.1 outputContract fallback 分支修复落地 + 组 12 回归测试通过（validated 路径行为零变化）。
- [ ] 新增测试组全绿；后端 184 存量零回归。
- [ ] 失败词汇映射全表 ∈ FALLBACK_REASONS（测试锁定）。
- [ ] 全链集成：stub provider 合法输出过真实三道 Validator；非法输出被正确否决并落确定性兜底。
- [ ] 前端测试、构建、`git diff --check`、桌面 1920x1080 与移动 375x812 浏览器走查通过（本 Phase 无前端改动，走查为回归确认）。

**PHASE 27.6.4 READY_FOR_INDEPENDENT_REAUDIT**
