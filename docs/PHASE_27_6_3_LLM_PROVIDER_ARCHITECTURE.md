# Phase 27.6.3 · LLM Provider Abstraction 架构

状态：READY_FOR_INDEPENDENT_REAUDIT
日期：2026-09-19
前置：Phase 27.6.2.3 Semantic Validation（已冻结）
能力等级：L1 — Bounded Context Read Layer（不变，本 Phase 不提升能力等级）

---

## 0. 定位与 Scope

Phase 27.6.x 已建成确定性问题解释链路的前半段与后半段：

```
DATA → DETERMINISTIC FACTS → INSIGHT → EVIDENCE → DETERMINISTIC REASONING
  → Context Firewall (agent-llm-context-v1)
  → [Provider 槽位 —— 27.6.3 填补]           ← 本 Phase
  → Output Contract Validator (agent-llm-output-v1)
  → Evidence Binding Validator
  → Semantic Validator
  → USER
```

27.6.3 只做一件事：**把「调用 LLM」封装成一个有契约、可替换、可审计的 Provider 边界**。

### 明确不做（Non-Goals）

- 不实现 Chat UI。
- 不实现 Planner。
- 不实现 Agent Action。
- 不实现 Memory Writer。
- 不新增任何 HTTP 路由（`/api/agent/*` 现有三条路由保持不变）。
- 不改变 L1 能力等级；Provider 上线后仍只服务 `explain_*` 类只读解释任务。
- 不在 Provider 内做输出解析、修复或「宽容化」——那是下游 Validator 链的职责。

---

## 1. Provider Boundary（Provider 边界）

### 1.1 位置

```
Context Firewall ──buildLlmContext()──► agent-llm-context-v1
        │
        ▼  （唯一允许的入口）
   ┌─────────────────────────────────────────────┐
   │  agentProvider（backend/src/services/agentProvider/）
   │    providerContract.js     契约与校验
   │    providerRegistry.js     注册表与选择
   │    openaiCompatibleProvider.js  适配器实现
   └─────────────────────────────────────────────┘
        │
        ▼  （唯一允许的出口：原始 LLM 响应信封）
Output Contract Validator → Evidence Binding Validator → Semantic Validator
```

### 1.2 输入

Provider 只接受两样东西：

1. `context` —— `agent-llm-context-v1` 防火墙上下文（由 `contextFirewall.buildLlmContext()` 产出）。
2. `task` —— 推理请求，必须 ∈ `contextContract.TASKS`（`explain_daily` / `explain_insights` / `summarize_learning_context`）。

Provider 不接受、不感知：userId 以外的用户身份信息、数据库句柄、Store、请求对象（req/res）、原始业务数据。上下文内一切内容都已被防火墙投影、限额、脱敏。

### 1.3 输出

Provider 输出**原始 LLM 响应信封**（raw response envelope），冻结形态：

```jsonc
// 成功
{
  "status": "ok",
  "reply": "<LLM 原始文本，未经解析、未经修复>",
  "provider": "openaiCompatible",
  "model": "deepseek-chat",
  "promptVersion": "agent-llm-provider-prompt-v1",
  "requestId": "<uuid>",
  "latencyMs": 1234
}
// 失败（操作性失败，不是异常）
{
  "status": "failed",
  "reason": "llm_timeout",        // ∈ FAIL_REASONS ⊆ FALLBACK_REASONS
  "provider": "openaiCompatible",
  "model": "deepseek-chat",
  "promptVersion": "agent-llm-provider-prompt-v1",
  "requestId": "<uuid>",
  "latencyMs": 15021
}
```

两条铁律：

- **Provider 是全函数（total function）**：操作性失败（超时/未配置/上游不可用/限流/畸形响应）一律返回 `failed` 信封，绝不抛业务异常；只有契约违规（输入不是合法防火墙上下文等程序性错误）才抛错——那是编排方的 bug，必须大声失败。
- **`reply` 原样透传**：Provider 不 parse、不 strip code fence、不修复 JSON、不截断。原始文本是 Provider 与 Validator 链之间的唯一交接物，任何「宽容化」都会稀释 Output Contract Validator 的否决权。

### 1.4 禁止清单（Provider 硬边界）

Provider 模块**禁止**：

- 访问数据库（better-sqlite3 / db 模块 / 任何 repository）。
- 访问 CGStore 或任何前端存储概念。
- 修改任何业务数据（goals / tasks / behavior / courses / knowledge…）。
- 写 Memory（Coach Memory / growth memory / 长期记忆）。
- 修改 Insight、Evidence、Reasoning 的任何产出（只读它们的投影）。
- 发起任何写操作（写操作只能来自「AI 建议 → 用户确认 → Store 写入」，L1 根本没有写入口）。

以上边界由静态扫描测试强制（见 §8 与测试计划）。

---

## 2. Provider Contract（Provider 契约）

`providerContract.js` 导出常量与两个校验器：

### 2.1 常量

| 常量 | 值 | 说明 |
|---|---|---|
| `PROVIDER_PROMPT_VERSION` | `agent-llm-provider-prompt-v1` | Prompt 版本，进信封，用于审计 |
| `FAIL_REASONS` | `llm_not_configured` `llm_timeout` `llm_unavailable` `llm_rate_limited` `llm_malformed` | 全部 ⊆ `outputContract.FALLBACK_REASONS`（测试断言） |
| `ENVELOPE_FIELDS` | `status` `reply` `reason` `provider` `model` `promptVersion` `requestId` `latencyMs` | 信封白名单字段 |

### 2.2 `validateProviderInput({ context, task })`

契约违规一律 throw（`statusCode 400`，错误码 `PROVIDER_*`）：

1. `context.version === 'agent-llm-context-v1'`（复用 `toProviderPayload` 的版本闸）。
2. `task ∈ TASKS`（复用 `contextContract.TASKS`，不复制集合）。
3. `context.ownerUserId` 为正整数（所有权字段，防火墙投影产物）。
4. `context.metadata.readOnly === true` 且 `context.metadata.actionLevel === 'insight_only'`。
5. 敏感键扫描：对投影 payload 递归执行敏感键检测（复用 `contextContract.containsSensitiveKey`，本 Phase 将其导出，一行附加导出、零行为变更；该函数递归深度上限 6，Provider 侧扫描与防火墙侧语义完全一致）。
6. 字节预算：`Buffer.byteLength(JSON.stringify(payload)) ≤ CONSTRAINTS.maxBytes`（复用防火墙 `CONSTRAINTS`，8192 字节）。

### 2.3 `validateProviderOutput(envelope)`

Provider 出口自检（防适配器自身 bug，把信封形状也纳入契约）：

- 字段白名单：出现 `ENVELOPE_FIELDS` 之外的字段 → 无效。
- `status === 'ok'` → 必须有非空 string `reply`，禁止出现 `reason`。
- `status === 'failed'` → `reason ∈ FAIL_REASONS`，禁止出现 `reply`。
- 敏感键扫描：信封任何层级出现 apiKey/token/password 类键 → 无效（防适配器把配置塞进信封）。
- `latencyMs` 为非负整数；`requestId`/`provider`/`model`/`promptVersion` 为有界字符串。

适配器返回前自检；自检失败视为适配器实现错误（throw `PROVIDER_ENVELOPE_INVALID`），绝不把坏信封交给下游。

---

## 3. Adapter Pattern（适配器模式）

### 3.1 适配器接口

每个 Provider 适配器导出：

```js
module.exports = { name: 'openaiCompatible', generateExplanation };
// generateExplanation({ context, task, options }) → Promise<envelope>
```

`options`（全部可注入，测试零 env 依赖）：`baseUrl` `apiKey` `model` `timeoutMs` `maxTokens` `temperature` `transport`。

### 3.2 注册表（`providerRegistry.js`）

- `REGISTRY`：`{ openaiCompatible: openaiCompatibleProvider }`，与 `services/providers/index.js` 同构。
- `getAgentProvider(name)`：按名取适配器，未知返回 `null`（调用方决策，不抛）。
- `resolveAgentProvider()`：读 `config.agentLlmProvider`，未配置/未知 → `null`（上游据此走确定性兜底，而不是报错）。
- 注册时校验适配器形状（`name` 非空 + `generateExplanation` 为函数），坏适配器在启动期暴露。

### 3.3 传输层复用（不引入第二套并行系统）

`openaiCompatibleProvider` **复用现有共享传输** `services/providers/openaiCompatible.chatCompletion` 做 HTTP（DeepSeek/Moonshot 等均走此协议）。本 Phase 对共享传输做两处**附加式**（additive）扩展，均向后兼容、不影响 AI Coach 既有路径：

1. `temperature` 透传：调用方显式传入有限温度时才进请求体（Coach 从不传 → 行为不变）。**影响面披露**：`knowledgeExtractionProvider.js` 是既有的 temperature 传参方（`temperature: 0.1`）；当前因该调用同时漏传 `baseUrl/apiKey/model`，会在共享传输的 `AI_NOT_CONFIGURED` 闸门提前失败、且现传输体本就不收 temperature，故本扩展落地当日为**零行为变化**；扩展后该调用方是否「有意激活 0.1」属知识抽取路径的独立决策，**另立修复 ticket**（存量缺陷：该调用缺 baseUrl/apiKey/model，与本 Phase 无关）。
2. 上游 429 识别：上游错误时在 ApiError 实例上附 `err.upstreamStatus = http`（普通实例属性；错误中间件只序列化 `code`/`message`/`details`，已核实不会外泄）。用途：`429 → llm_rate_limited` 精确分类。

Prompt 构建是适配器职责（`buildProviderMessages(payload)`，纯函数、确定性、可单测）：System 描述 `agent-llm-output-v1` 目标 Schema 与硬规则（只准引用 payload 内 id/evidence、长度上限、禁绝对化断言、只输出 JSON），User 为投影 payload 的 JSON 文本。Prompt 的措辞可以演进，但 **Prompt 不得要求 LLM 做任何超出「生成解释」的事**（无工具、无函数调用、无记忆指令）。

### 3.4 新增配置（`backend/src/config/env.js`，全部附加式）

| 变量 | 默认 | 说明 |
|---|---|---|
| `AGENT_LLM_PROVIDER` | `openaiCompatible` | 注册表选择 |
| `AGENT_LLM_BASE_URL` | 回落 `aiBaseUrl` | OpenAI 兼容基址 |
| `AGENT_LLM_API_KEY` | 回落 `aiApiKey` | 密钥（见 §8） |
| `AGENT_LLM_MODEL` | 回落 `aiModel` | 模型名 |
| `AGENT_LLM_TIMEOUT_MS` | `15000` | 比 Coach 的 30s 更紧（Agent Home 是仪表盘语境） |
| `AGENT_LLM_MAX_TOKENS` | `1200` | 输出上限（已验证输出本身还有 8192 字节硬顶） |

显式回落 `ai*` 而不是重复一套 Key：同一密钥、隔离用法与配额视角由 Base URL/模型维度承担；避免运维同步两份密钥。

---

## 4. Timeout Policy（超时策略）

- **超时由 Provider 边界强制执行**：`generateExplanation` 将传输调用与计时器竞速（`Promise.race`），`timeoutMs` 到点即产出 `llm_timeout` 信封——**对任何注入的 transport 都生效**，策略不依赖某个具体传输的自觉。
- 共享传输内既有 `AbortController` 负责真实 HTTP 请求的中止（防止上游无响应拖垮 Express worker），与边界竞速互为纵深，不是两套冲突的计时器。
- 默认 `AGENT_LLM_TIMEOUT_MS = 15000`：Agent Home 解释是「仪表盘增量信息」，15s 内不出即应退回确定性解释；不能拖慢首屏语义。
- 超时映射：竞速超时 → 内部构造 `AI_TIMEOUT` ApiError → Provider 映射 `llm_timeout`。
- **Provider 层不重试**：重试会倍增尾延迟与费用，且确定性兜底（agent-reasoning-v1）已经可用。重试/降级编排属未来 Orchestrator Phase 的策略空间。
- 计时器必须在 `finally` 清理，防止泄漏挂起 Express worker。

## 5. Failure Handling（失败处理）

错误分类映射表（Provider 捕获一切传输层异常）：

| 传输层信号 | 信封 reason |
|---|---|
| `AI_NOT_CONFIGURED` | `llm_not_configured` |
| `AI_TIMEOUT` / AbortError | `llm_timeout` |
| 上游 HTTP 429（`err.upstreamStatus === 429`） | `llm_rate_limited` |
| `AI_EMPTY_REPLY`（空/非字符串响应体） | `llm_malformed` |
| `AI_NETWORK_ERROR` / `AI_UPSTREAM_ERROR` / `AI_MODEL_*` / `AI_UNAUTHORIZED` / 未知异常 | `llm_unavailable` |

原则：

- **上溯无泄漏**：信封只带 `reason`，绝不带上游响应体、上游错误码细节、URL、密钥（共享传输已只在服务端日志打分类，信封连分类细节都不带）。
- **未知错误收敛到 `llm_unavailable`**：宁可粗，不可错。
- 传输层返回 200 但 `reply` 非法（空/非字符串）→ `llm_malformed`，不产出假成功信封。
- `FAIL_REASONS ⊆ FALLBACK_REASONS` 由测试永久锁定——Provider 的失败词汇表永远是下游 Output Contract 已认识的词汇表的子集。

## 6. Fallback Strategy（兜底策略）

- **Provider 不构建兜底解释。** 兜底解释的产出者始终是确定性推理层（`agentReasoning/fallback.js` → `agent-reasoning-v1`），Provider 只负责把操作性失败翻译成 `reason`。
- 未来 Orchestrator 的约定（本 Phase 只立约，不实现编排）：

```
envelope.status === 'ok'
  → JSON.parse(reply)           // parse 失败 → llm_malformed 兜底
  → Output Contract Validator   // 失败 → 按其 violations 兜底
  → Evidence Binding Validator  // 失败 → evidence_binding_failed 兜底
  → Semantic Validator          // 失败 → semantic_validation_failed 兜底
  → 交付 validated 输出
envelope.status === 'failed'
  → 用 envelope.reason 直接作为 fallback.reason（∈ FALLBACK_REASONS）
  → 交付 status:'fallback' 输出（解释文案来自确定性 reasoning 层）
```

- **兜底永远退向确定性推理，绝不退向「另一个 LLM 再试一次」或「放宽校验」**。校验链没有旁路、没有降级模式。
- `llm_not_configured` 属正常运营态（未配 Key 的部署）：静默走确定性解释，不算故障。
- **Validator 失败信号 → 终端兜底词汇映射**（供未来 Orchestrator 遵循；Validator 内部信号词如 `evidence_binding_failed`/`semantic_validation_failed` 不是 `FALLBACK_REASONS` 合法值，禁止直接写入最终输出的 `fallback.reason`，必须映射为终端词汇）：

  | 校验链失败点 | 终端 `fallback.reason`（∈ FALLBACK_REASONS） |
  |---|---|
  | `JSON.parse(envelope.reply)` 失败 | `llm_malformed` |
  | Output Contract Validator 否决 | `llm_schema_invalid` |
  | Evidence Binding Validator 否决 | `llm_evidence_mismatch` |
  | Semantic Validator 否决（范围/数值/时间不一致） | `llm_unsafe` 或 `llm_unsupported_claim` |
  | Provider 信封 `status:'failed'` | 信封 `reason` 原样（已在 FAIL_REASONS 内） |

## 7. Security Boundary（安全边界）

- **只读管道不变**：Provider 位于 L1 只读链路内，输入是已脱敏投影，输出只进校验链；无任何写路径、无任何执行面（不 eval、不动态 require、不执行 LLM 输出）。
- **Prompt 注入纵深**：LLM 输出被当作**不可信文本**——必须通过三道 Validator 才能到达用户；Provider 的 System Prompt 明确「只准引用 payload 内的 id/evidence」，即便被注入诱导虚构，Evidence Binding / Semantic Validator 会否决。
- **注入方向**：payload 以 JSON 文本进入 User 消息；敏感键在 `validateProviderInput` 已被拒绝（双保险：防火墙投影本身已脱敏）。
- **无副作用**：Provider 不写文件、不写缓存状态、不改全局单例；`requestId`/`latencyMs` 仅存在于返回信封。
- **静态依赖隔离**：Provider 三模块的 `require` 目标白名单 = `providerContract`（互引）、`agentFirewall/contextContract`、`agentFirewall/contextFirewall`、`agentOutputValidator/outputContract`（仅为断言 FAIL_REASONS ⊆ FALLBACK_REASONS）、共享传输、`config/env`、`node:crypto`/`node:util` 标准库。出现任何 db/store/sync/repository 依赖即为架构违规——由测试强制。
- **输入不可变性**：适配器对 `context` 只读；测试以深冻结对象 + 深比较双重验证「调用前后输入逐字节一致」。

## 8. API Key Isolation（密钥隔离）

- 密钥解析顺序：`options.apiKey → config.agentLlmApiKey → config.aiApiKey`，只在服务端进程内存中存在。
- 密钥**绝不**出现在：返回信封（`validateProviderOutput` 敏感键扫描强制）、日志、Prompt 文本、错误消息、HTTP 响应体。
- 密钥以参数注入共享传输（`Authorization: Bearer` 请求头），传输层现有约定不变：不写日志、不进返回值、上游错误只透出状态码分类。
- 未配置密钥不是错误路径：`resolveAgentProvider()` 正常返回适配器，调用后映射 `llm_not_configured` → 确定性兜底。部署可以在无 Key 状态下安全运行整条 Agent 链路。
- 测试断言：ok/failed 信封与错误消息字符串中均无 `apiKey` 等敏感键值。

## 9. Validator Chain Integration（校验链集成）

### 9.1 全链数据流（27.6.3 完成后）

```
agentHomeService.buildAgentHomeContext({userId})        learning-context-v1
  → agentInsightService.buildInsights(context)          agent-insight-v1
  → reasoningEngine.buildReasoning({context, insights})  agent-reasoning-v1
  → contextFirewall.buildLlmContext({context, insights, reasoning, task})
                                                         agent-llm-context-v1（≤8KB，脱敏投影）
  → providerRegistry.resolveAgentProvider()
  → provider.generateExplanation({context, task})        raw envelope（本 Phase）
  → [status=ok] JSON.parse(envelope.reply)
  → outputContract.validateOutputContract(candidate)     agent-llm-output-v1 结构否决
  → evidenceBinding.validateEvidenceBinding({firewallContext, output, expectedSnapshotId})
                                                          引用真实性否决（快照 id + 逐引用回查）
  → semanticValidator.validateSemanticValidation({firewallContext, output})
                                                          数值/时间/范围/置信度一致性否决
  → USER（validated 输出 或 确定性 fallback）
```

### 9.2 集成契约要点

- Provider 与 Validator 链之间**没有共享可变状态**：`firewallContext` 原样同时交给 Provider（只读）与三个 Validator（只读），Evidence Binding 的 `expectedContextSnapshotId` 机制保证「校验的上下文 = 发给 LLM 的上下文」同一快照。
- Provider 返回的 `reply` 在被 Validators 接受前**不具备任何可信度**；任何一层否决都整链否决（fail-closed）。
- 本 Phase 的编排函数（把九步串起来的那个服务）**不属于 27.6.3**；但校验链的可用性由集成测试证明：用注入的 stub transport 返回一份合法 `agent-llm-output-v1` JSON，跑通 buildLlmContext → Provider → Output Contract → Evidence Binding → Semantic 全绿；再用传输失败路径验证 `reason` 直通 `FALLBACK_REASONS`。

### 9.3 测试计划（backend/test/agentProvider.test.js）

| # | 用例组 | 断言要点 |
|---|---|---|
| 1 | provider contract validation | 非法 version/task、metadata 违规、敏感键、超字节预算 → throw；合法输入通过；`validateProviderOutput` 拒绝未知字段/ok 带 reason/failed 带 reply/信封敏感键 |
| 2 | timeout fallback | transport 永不 resolve（timeoutMs=50）→ `{status:'failed', reason:'llm_timeout'}`，无 reply 字段，latencyMs ≥ timeout |
| 3 | provider failure | 网络异常 → `llm_unavailable`；`AI_NOT_CONFIGURED` → `llm_not_configured`；`upstreamStatus:429` → `llm_rate_limited`；未知异常 → `llm_unavailable` |
| 4 | malformed response | 传输成功但 reply 为空串/非字符串 → `llm_malformed`；合法非 JSON reply **原样透传**（Provider 不解析不改写） |
| 5 | provider isolation | 深冻结输入调用后深比较不变；信封无敏感键；Prompt 中不含 apiKey；适配器对同输入产出确定性 messages |
| 6 | no database access | 静态扫描三模块 `require` 目标 ∈ 白名单；断言无 db/sqlite/store/sync 依赖 |
| 7 | registry | 已知名返回适配器、未知名返回 null、注册形状校验、`FAIL_REASONS ⊆ FALLBACK_REASONS` |
| 8 | chain integration | stub transport 全链绿色；failed 信封 reason ∈ FALLBACK_REASONS |

---

## 10. 风险与开放问题

1. **Prompt 漂移**：Prompt 文本演进可能改变 LLM 输出分布 → `PROVIDER_PROMPT_VERSION` 入信封，Validator 链是最终守门人，风险受控。
2. **共享传输的附加式扩展**（temperature / upstreamStatus）触及 AI Coach 同一文件 → 均为条件附加、默认路径零变化，由全量后端测试回归保护。
3. **无重试策略**：瞬态抖动会直接落到确定性兜底。属有意取舍（尾延迟 > 完整性）；Orchestrator Phase 可在信封之上叠加策略。
4. **LLM JSON 解析归属**：parse 失败的兜底语义（`llm_malformed`）已约定，实际 parse 编排属于下一 Phase；本 Phase 不实现，避免扩大 Scope。

## 11. 验收标准

- [ ] `backend/src/services/agentProvider/` 三模块落地，依赖白名单成立。
- [ ] 新增测试组全绿；既有后端 162 测试不回归。
- [ ] `FAIL_REASONS ⊆ FALLBACK_REASONS` 锁定。
- [ ] 全链集成测试证明 Validator Chain 无旁路。
- [ ] 前端测试、构建、`git diff --check`、桌面 1920x1080 与移动 375x812 浏览器走查通过（本 Phase 无前端改动，走查为回归确认）。

**PHASE 27.6.3 READY_FOR_INDEPENDENT_REAUDIT**
