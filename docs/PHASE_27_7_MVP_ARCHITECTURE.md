# Phase 27.7 Personal Learning Agent MVP Architecture

状态：READY_FOR_INDEPENDENT_REAUDIT（H-1 已按方案 B 完成代码级修复：Provider 链路已接入 toProviderPayload，并新增链路级身份隔离回归。独立 Re-Audit 结果见 PHASE_27_7_H1_REMEDIATION_INDEPENDENT_REAUDIT.md）
日期：2026-09-19
性质：**ARCHITECTURE-ONLY**（本阶段零业务代码、零 API、零前端、零 Provider/Prompt/Validator/存储修改）
基线：63f2e18 docs: freeze phase 27.6.5 prompt template contract（27.6.1→27.6.5 全链 FROZEN）

本档基于当前 HEAD 与实际代码撰写，阅读基础：

| 阅读对象 | 载体 |
|---|---|
| 总架构 | PERSONAL_LEARNING_AGENT_ARCHITECTURE_V1_1.md（FROZEN） |
| Agent Home | PERSONAL_LEARNING_AGENT_HOME_ARCHITECTURE_V1_0.md（FROZEN） |
| 27.1 Context Builder | PHASE_27_1_AGENT_CONTEXT_BUILDER_FINAL.md + CONTEXT_BOUNDARY_REMEDIATION |
| 27.2 / 27.2.1 / 27.2.2 | PRODUCTIZATION_ARCHITECTURE / INSIGHT_CONTRACT_FOUNDATION_FINAL / PRODUCT_ADAPTER_ARCHITECTURE |
| 27.3 UI | PHASE_27_3_AGENT_HOME_UI_FOUNDATION（只读 Dashboard 已冻结） |
| 27.4 / 27.5 | DETERMINISTIC_INSIGHT_ARCHITECTURE / REASONING_LAYER_ARCHITECTURE + 契约/实现文档 |
| 27.6 伞形 | PHASE_27_6_LLM_REASONING_ARCHITECTURE（ARCHITECTURE_REVIEWED） |
| 27.6.1→27.6.5 | 各契约/实现/独立 Re-Audit 文档（全部 FROZEN） |
| 实际代码 | routes/agentHome.js、agentHomeService、agentInsightService、agentReasoning/*、agentFirewall/*、agentOutputValidator/*、agentEvidenceBinding/*、agentSemanticValidator/*、agentProvider/*、agentPrompt/*、agentGateway/* |
| 知识/课程 SoT | STUDENT_KNOWLEDGE_STATE_ARCHITECTURE_V1_0、PHASE_24_COURSE_SPACE_FOUNDATION_FINAL |

---

## 1. Product Goal

知行 MVP 的目标：把已冻结的确定性学习事实链（DATA→FACT→INSIGHT→EVIDENCE→REASONING）与已冻结的 LLM 治理链（Firewall→Prompt→Provider→Validator×3）装配成一个**安全、可审计、有边界**的个人学习代理最小可用形态：

```text
学生提问 / 请求解释
  → 代理用确定性事实回答"你现在学得怎么样、为什么"
  → 每句话可回溯到证据
  → LLM 只负责把事实说得更清楚
  → 一切失败退向确定性兜底，绝不退向编造
```

MVP 不追求"什么都能答"，而追求"答的每一句都有出处、每一层都可审计、每一种失败都有确定性行为"。

## 2. Agent Responsibility（MVP 允许）

Agent（Phase 27.7 MVP，actionLevel = `insight_only`）允许：

1. **learning state explanation** —— 解释当前学习状态（今日/近期行为事实）。
2. **evidence-backed analysis** —— 基于确定性 Evidence 的分析（每条事实引用可解析）。
3. **course knowledge explanation** —— 解释课程知识结构（仅投影字段，不含正文）。
4. **knowledge state explanation** —— 解释掌握状态（mastery/confidence/state/evidenceCount）。
5. **deterministic insight explanation** —— 解释确定性洞察为什么成立、为什么重要。
6. **bounded learning question answering** —— 有界学习问答（任务枚举内；自由文本问答属 27.7.3，见 §23 GAP-1）。

允许的全部输出形态：对已有事实的解释（fact）、显式声明的解释（interpretation）、明确标注的建议（suggestion）、不确定性提示（uncertainty）——全部经 §9 校验链后才可呈现。

## 3. Agent Non-Responsibility（MVP 禁止）

Agent（含 LLM）在 MVP 中**不存在**以下职责：

- write business data（todo/course/goal/CGStore/Analytics/Sync 任何写）
- modify todo / course / goal
- memory write（GrowthMemory/CoachMemory/Reflection 写入永久禁止）
- autonomous action / autonomous loop
- planner execution（计划提议属 Phase 28，且必须用户确认，MVP 不实现）
- tool execution / function calling
- Chat（自由对话；自由文本问答契约属 27.7.3）
- 充当 Tutor（Phase 29）
- 创建/修改 Evidence、Insight、Reasoning、Knowledge State、Mastery
- 输出 mutation command、代码、SQL、内部路径、Provider 信息

## 4. Runtime Architecture

### 4.1 组件地图（当前 HEAD 实况）

```text
┌─────────────────── Presentation Layer（已冻结, 27.3）───────────────────┐
│  agent-home.html（只读 Dashboard：今日状态/洞察/薄弱项/趋势）              │
└──────────────┬─────────────────────────────────────────────────────┘
               ↓ GET /api/agent-home/{context,insights,reasoning}
┌──────────────┴─────────────────────────────────────────────────────┐
│  Agent Read Layer（27.1/27.2.1/27.2.2/27.4/27.5, FROZEN）            │
│  agentHomeService → learning-context-v1                             │
│  agentInsightService → agent-insight-v1                             │
│  agentReasoning/reasoningEngine → agent-reasoning-v1                │
├────────────────────────────────────────────────────────────────────┤
│  LLM Governance Chain（27.6.1→27.6.5, FROZEN）                       │
│  agentFirewall（agent-llm-context-v1, ≤8192B, 快照 id）              │
│  agentPrompt（模板注册表 v1, golden 锁定）                            │
│  agentProvider（信封契约, FAIL_REASONS×5）                            │
│  agentGateway（agent-runtime-gateway-v1, 全函数编排）                 │
│  agentOutputValidator / agentEvidenceBinding / agentSemanticValidator│
├────────────────────────────────────────────────────────────────────┤
│  Source of Truth 层（本阶段不重定义，只读）                            │
│  CGStore/Sync · Analytics · GoalEngine · Course Space ·              │
│  Student Knowledge State · Reflection(不可用) · GrowthMemory(投影) ·  │
│  CoachMemory(不可用)                                                │
└────────────────────────────────────────────────────────────────────┘
```

### 4.2 核心 Runtime 链（目标逻辑链 × 实际装配映射）

```text
User Request
  ↓
Request Contract          —— 任务枚举请求契约（27.6 伞形 §6.1；自由文本禁止）
  ↓
Query Understanding       —— 【27.7.3 计划，未实现】MVP 阶段由固定任务枚举替代
  ↓
Context Selection         —— 【27.7.2 计划，未实现】MVP 阶段为"全量有界投影"（防火墙预算兜底）
  ↓
Deterministic Insight     —— agentInsightService（确定性规则，事实边界）
  ↓
Deterministic Reasoning   —— agentReasoning/reasoningEngine（确定性解释 + 兜底来源）
  ↓
Context Firewall          —— buildLlmContext（allowlist 投影/敏感过滤/8192B/快照 id）
  ↓
Prompt Contract           —— agentPrompt 注册表 v1（golden 字节锁定）
  ↓
Provider                  —— agentProvider（信封契约，可替换）
  ↓
LLM                       —— Explanation Generator（唯一职责：把给定事实说清楚）
  ↓
Output Contract           —— agent-llm-output-v1 结构校验
  ↓
Evidence Binding          —— 快照绑定 + 引用可回查
  ↓
Semantic Validation       —— 数值/时间/范围/置信度一致性
  ↓
Validated Explanation     —— {status:'validated', output, meta} 结果信封
  ↓
User                      —— 安全文本渲染，AI Insight 与确定性事实区分展示
```

**阶段顺序注记（重要，避免歧义）**：上表是目标逻辑链。实际数据流中，Deterministic
Insight/Reasoning 在 Context Firewall **上游**生成（27.6.1 冻结定义：防火墙是"LLM 调用前
的唯一受控边界"，消费 insight/reasoning 投影）；Query Understanding 与 Context Selection
（27.7.2/27.7.3）未来装配时位于上下文组装之前，决定哪些来源进入确定性管线。MVP 以固定
任务枚举 + 全量有界投影运行该链，两处计划位在 §23 记录为 Architecture Gap，不阻塞 MVP
边界成立。

## 5. Request Lifecycle

MVP 请求生命周期（契约级；路由装配属 27.7.1）：

1. **Authentication**：现有 `authRequired`（JWT）；身份仅来自 `req.userId`，客户端提交
   的任何 userId 一律忽略。
2. **Request Contract**：请求体只允许 `{version:'agent-llm-reasoning-v1', task}`，
   `task ∈ {explain_daily, explain_insights, summarize_learning_context}`；禁止字段：
   context/insights/evidence/reasoning/messages/history/systemPrompt/provider/model/
   temperature/apiKey（27.6 伞形 §6.1 冻结）。自由文本问题在 27.7.3 Question Contract
   落地前不被任何端点接受。
3. **服务端重建**：Context/Insight/Reasoning 一律由服务端按 `req.userId` 从 Source of
   Truth 重新构建；不接受任何客户端提交的上下文（27.6 伞形 §6.2）。
4. **编排**：交由 agentGateway `runExplanation`（结构上不可绕过防火墙——防火墙在网关
   内部构建，调用方无法传入现成上下文）。
5. **响应**：结果信封或确定性兜底信封；失败不破坏既有三条 GET 端点。

## 6. Context Lifecycle

```text
Source of Truth（CGStore/Sync、Course Space、Knowledge State、Analytics、Memory）
  ↓ agentHomeService.buildAgentHomeContext({userId})   【服务端, 只读适配器组合】
learning-context-v1（courses/courseKnowledge/knowledgeStates/behavior/
  reflections=unavailable/memories.growth=derived_memory/memories.coach=unavailable）
  ↓ 契约校验（validateContext/validateInsights/validateReasoning：版本/所有权/只读/写权限空）
  ↓ agentFirewall.buildLlmContext({context, insights, reasoning, task})
agent-llm-context-v1：
  - 内部 Firewall Context 使用 allowlist 字段投影；ownerUserId 不进入本层
  - 敏感键全树拒绝（SENSITIVE_FIREWALL_INPUT）
  - 有界：≤8192 bytes、insights≤6、evidence/insight≤3、reasoning≤6、
    text≤240 chars、evidence 文本≤160 chars、source refs≤12
  - 确定性排序 + 字节压力从尾部整条丢弃（截断记录 truncated=true）
  - 快照 id = computeContextSnapshotId（sha256，绑定校验锚点）
  ↓ toProviderPayload()（严格 allowlist；继续剥离 userId/permissions.write/内部元数据）
Provider payload —— LLM 可见世界的全部；严格排除 ownerUserId/userId/sessionId/
  permissions.write/内部元数据/敏感键
```

Context 生命周期保证：每次请求现算现用、不落库、不缓存第二份。`computeContextSnapshotId`
锁定的是用于所有权校验与引用回查的内部 Firewall Context；`toProviderPayload()` 从该
Context 生成只读数据面投影，并强制排除控制面身份。所有权身份由 Gateway 在 Validator 阶段另行传入，Provider 收到的 payload 与 Validator
消费的 insights/reasoning/evidence 数组同源，但内部控制字段不会进入 Prompt。

## 7. Reasoning Lifecycle

```text
learning-context-v1
  ↓ agentInsightService.buildInsights(context)   确定性规则输出六类 insight type：
  |   focus_increase / focus_decline / consistency_stable / consistency_drop /
  |   knowledge_gap_detected / course_progress_status
  |   （每条洞察必须 ≥1 条 evidence{source,authority,field,value}；缺数据=无洞察，
  |    绝不臆造；无 action 字段，仅 actionLevel=insight_only）
agent-insight-v1
  ↓ agentReasoning/reasoningEngine.buildReasoning({context, insights})
agent-reasoning-v1：
  - explanations[{insightId, title, why, evidenceRefs[{insightId,index,metric,period}],
    confidence, actionLevel}]（evidenceRefs 引用数组位置，天然稠密）
  - available=false 时输出空解释 + 显式 reason
```

Reasoning 是两条链路的交汇点：对上（确定性侧）它是"事实边界的解释层"；对下（LLM 侧）
它是**确定性兜底的唯一内容来源**——LLM 不可用时代理仍然有话可说，说的全是这一层的
确定性文本。

## 8. LLM Lifecycle

```text
Provider payload（agent-llm-context-v1 数据面投影）
  ↓ agentPrompt 注册表（活动版本 v1 = agent-llm-provider-prompt-v1，golden 字节锁定，
  |   System 段与 payload 封闭：system 三探针恒等、user ≡ JSON.stringify(payload)）
messages = [{role:'system', content: 模板}, {role:'user', content: JSON.stringify(payload)}]
  ↓ toProviderPayload（Provider 边界再次执行 allowlist 投影）
  ↓ validateProviderInput（版本/任务/元数据/敏感键/字节预算）——契约违规向上抛
  ↓ agentProvider.openaiCompatible.generateExplanation
  |   共享传输层（不引入第二套 HTTP）→ 边界级超时（Promise.race）→ 信封
信封：{status:'ok', reply, provider, model, promptVersion, requestId, latencyMs}
     |{status:'failed', reason ∈ FAIL_REASONS×5, ...}
  - reply 原样透传：不 parse、不修补、不截断（修补权只在 Validator 侧的"拒绝"）
  - operational 失败收敛 FAIL_REASONS，未知错误 → llm_unavailable
  ↓ 交回 agentGateway 进入 §9 校验链
```

Provider 隔离：配置只在服务端 env 读取；前端不可选 provider/model/baseUrl；密钥不进
上下文/Prompt/信封/日志/错误响应；Provider 原始错误体不出网关。

## 9. Validation Lifecycle

```text
信封 status='ok'
  ↓ JSON.parse(reply)                    失败 → fallback(llm_malformed)
agent-llm-output-v1 结构校验（outputContract）
  |   顶层字段严格白名单、status∈{validated,partial,fallback}、claim type 枚举、
  |   explanations≤5 / suggestions≤3 / uncertainties≤2、id≤120、总量≤8192 bytes、
  |   fact 需 evidenceRefs+reasoningRefs、interpretation 需 generationConfidence≤
  |   引用 reasoning 置信度、fallback 仅 deterministic reasoning 结构
  |                                      失败 → fallback(llm_schema_invalid)
  ↓ validateEvidenceBinding({firewallContext, output, expectedSnapshotId})
  |   - 快照 id 一致（CONTEXT_SNAPSHOT_MISMATCH → llm_context_mismatch 级失败）
  |   - 每个 evidenceRefs 在防火墙上下文中可回查到真实 insight.evidence
  |   - fact 必须有可解析引用；引用漂移/伪造 → 硬失败
  |                                      失败 → fallback(llm_evidence_mismatch)
  ↓ validateSemanticValidation({firewallContext, output})
  |   - 数值一致性：文本数字 ∈ 引用 evidence 值/周期集合（NUMERIC_MISMATCH）
  |   - 时间一致性：不得引入上下文中不存在的日期/相对周期
  |   - 范围一致性：绝对化能力/人格断言 → SEMANTIC_SCOPE_VIOLATION
  |   - 置信度：interpretation 不得高于引用 reasoning 置信度
  |                                      失败 → fallback(llm_unsafe /
  |                                               llm_unsupported_claim)
  ↓ 全绿 → {status:'validated', output, meta.validators 全 true}
```

规则：**任何非法 LLM 输出不允许"修补后"当作成功**；校验只有通过/退向确定性兜底两种
出口；三道 Validator 为网关常驻真实模块，不可注入（测试侧打桩例外，生产无 patch 路径）。

## 10. Response Lifecycle

```text
agent-runtime-gateway-v1 结果信封（网关返回前自检 validateGatewayResult）：
  {status:'validated', output, meta{gatewayVersion, task, requestId,
    contextSnapshotId, provider, model, promptVersion, latencyMs, validators}}
  {status:'fallback',  output(fallback), meta{...同上, fallbackReason}}
  ↓ 路由层（27.7.1 装配）res.success —— 信封即 API 响应，无二次加工
  ↓ 前端（27.7.1 装配展示区）
  - 安全文本渲染（禁止 HTML 拼接）
  - AI Insight / AI Suggestion 与确定性事实区分展示并标注
  - suggestion 永远标注"建议"，不带 action payload
  - fallback 时继续展示确定性 Insight/Reasoning，说明 AI 解释暂不可用
  - 不显示 mutation/execute/planner 控件
```

既有三条 GET 端点（context/insights/reasoning）的响应与行为不受 LLM 链路任何失败影响
（LLM unavailable 不得破坏 Agent Home——27.6 伞形不变量 I）。

## 11. Source of Truth Hierarchy

权威层级自上而下（上层不可被下层覆盖）：

| # | 层 | Source of Truth 载体 | authority 标记 | 权威范围 |
|---|---|---|---|---|
| 1 | System Facts | 后端 DB（账号/身份/同步状态） | source | 系统事实 |
| 2 | Deterministic Analytics | Analytics（行为统计唯一可信源） | deterministic_projection | 行为统计 |
| 3 | Course Knowledge | Course Space（Course/Document/Node/Relation/Evidence） | source | 课程知识结构 |
| 4 | Student Knowledge State | student_knowledge_states（Evidence + 确定性聚合） | source | 掌握状态 |
| 5 | Evidence | 确定性投影证据（agent-insight-v1 evidence / firewall 上下文 evidence） | source / deterministic_projection | 证据 |
| 6 | Insight | agent-insight-v1（确定性规则产物） | deterministic | 洞察 |
| 7 | Reasoning | agent-reasoning-v1（确定性解释） | deterministic | 解释 |
| 8 | User Input | 请求体（task/未来 question） | — | **仅意图**：用户问什么由用户权威；客户端提交的行为事实不覆盖服务端事实 |
| 9 | LLM Generated Explanation | 本次响应 output | **零权威**（interpretation/suggestion 标注） | 表达 |

**LLM 铁律**：

1. LLM 永远不是 Source of Truth（层级 9 = 零权威，任何字段不得提升 authority）。
2. LLM 不得创建 Evidence、Insight、Reasoning、Knowledge State、Memory（输出只能引用
   已存在记录；创建路径只存在于确定性层）。
3. LLM 不得提升任何数据的 authority（authority 标记由确定性层设定；Validator 强制
   引用指向真实权威记录）。
4. 禁止旁路链路（27.6 伞形 §4 全部继承）：User Data→LLM→Facts、Course Data→LLM→
   Knowledge State、GrowthMemory→LLM→Behavior Fact、LLM Output→Evidence/Mastery/
   Analytics/Memory/Reflection。

## 12. Agent Capability Contract 与 Permission Matrix

**actionLevel = `insight_only`**（Action Boundary Level 0，PERSONAL_LEARNING_AGENT_HOME
v1.0 §8；Level 1 suggestion 仅作为输出形态、无 action payload；Level 2/3 禁止）。

Permission Matrix（读 = 经防火墙有界投影；写 = 一律拒绝）：

| 操作 | 确定性服务层 | Agent MVP 编排（路由/网关） | LLM 模型 | 说明 |
|---|---|---|---|---|
| 读 Course Knowledge 投影 | read（≤10 节点） | 经防火墙消费 | 有界可见 | 仅投影字段，无正文 |
| 读 Knowledge State | read（弱/强项≤10） | 经防火墙消费 | 有界可见 | 不重算 Mastery |
| 读 Behavior Summary | read（确定性投影） | 经防火墙消费 | 有界可见 | 复用 Analytics helpers |
| 读 GrowthMemory 投影 | read（≤10, derived_memory） | 不投影进 LLM Context | 不可见 | MVP 防火墙不接收 Memory 正文或记忆投影 |
| 读 CoachMemory / Reflection | unavailable | unavailable | 不可见 | 显式不可用，不冒充 |
| 调用 LLM Provider | — | read-only 调用（唯一调用点=网关） | — | 前端禁止直连 |
| 写 todo/course/goal | deny | deny | deny | 永久 |
| 写 CGStore/Analytics/Sync | deny | deny | deny | 永久 |
| 写 Knowledge State/Mastery | deny | deny | deny | 永久 |
| 写 GrowthMemory/CoachMemory/Reflection | deny | deny | deny | 永久（Memory Writer 禁止） |
| Evidence/Insight/Reasoning 创建 | **仅确定性层** | deny | deny | LLM 不可创建 |
| Tool/Function 执行 | deny | deny | deny | 永久 |
| Planner 执行 | deny | deny | deny | Phase 28 另立契约 |
| 自主循环/自主 Action | deny | deny | deny | Level 3 = 新架构版本 |

## 13. Context Boundary

**什么数据可以进入 LLM**（穷尽白名单）：防火墙 allowlist 投影后的 learning-context
确定性投影字段、agent-insight-v1 投影（≤6 条洞察 × ≤3 evidence）、agent-reasoning-v1
投影（≤6 条解释）、任务标识、只读元数据（readOnly/actionLevel/providerIndependent）。
总量 ≤8192 字节。

**什么数据绝对不能进入 LLM**（继承 27.6 伞形 §7.2 并冻结）：raw CGStore dump / raw
user_data / localStorage / JWT / cookie / password / API key / provider secret / DB row /
SQL / request object / provider client / 跨用户数据 / 内部安全元数据 / 环境变量 / 服务
日志 / CoachMemory 原始对话 / Reflection unavailable 占位 / 完整课程文档正文。

**user isolation**：三段输入全部由服务端按 `req.userId` 重建；所有权校验
（FIREWALL_OWNERSHIP_MISMATCH 硬失败）；SQL 层 `user_id = $1`；Validator 侧引用不可
回查即失败；跨用户引用 = 硬安全失败。

**bounded context**：字段级（文本 240/160）、集合级（6/3/6/12）、字节级（8192）、
输出级（≤8192 bytes / max_tokens 1200）；超限确定性截断（尾部整条丢弃），不允许动态
扩预算。

**provenance**：每条 evidence 携带 source/authority/field/value；快照 id（sha256）把
"LLM 看到的世界"钉死；Evidence Binding 强制每条事实引用可回查到快照内真实证据。

**课程资料只是 DATA 不是 INSTRUCTION**：MVP 中课程知识仅以投影字段（id/title/kind/
status/confidence）进入上下文，正文不进入——物理上不存在"资料变成指令"的通道。未来
27.7.4 若引入资料内容，必须用显式数据边界包裹（`<context_data>` 类定界契约，27.6 伞形
§8.3）并保持 Prompt 信任层级 System > Authoritative Context > Retrieval Evidence >
Memory > User Message（v1.1 §7）。该契约在 27.7.4 落地前冻结为本节文字。

## 14. LLM Boundary

LLM = **Explanation Generator**（唯一身份）。它不是：

| 禁止身份 | 禁止原因 |
|---|---|
| Fact Generator | 事实只来自确定性层（§9 数值/时间/范围校验强制） |
| Evidence Generator | 引用只能指向既有证据（Evidence Binding 强制） |
| Decision Maker | 决策归用户；输出只有 suggestion 形态且无 action payload |
| Action Executor | 无工具、无 mutation、无执行通道（Prompt 禁令 + 输出白名单双重封死） |
| Memory Writer | 无任何写路径（§12 永久 deny） |

必须保留（不得绕过、不得裁剪）的治理链：**Prompt Contract**（模板注册表，禁令扫描，
payload 封闭）→ **Provider Contract**（信封全函数，FAIL_REASONS 收敛）→ **Output
Contract**（结构白名单）→ **Evidence Binding**（快照 + 引用回查）→ **Semantic
Validation**（数值/时间/范围/置信度）。五者顺序固定，逐层留痕于 meta.validators。

## 15. Failure Architecture 与 Failure Matrix

失败总原则：**安全相关失败一律 FAIL CLOSED**（响亮失败，绝不降级展示）；操作性失败
退向确定性兜底（§16）。错误信封只含 code/message，不透出 Provider 原始错误、内部路径、
上游状态码。

| # | Failure | 检测点 | 行为 | code / reason | 用户可见 |
|---|---|---|---|---|---|
| F1 | Context Failure（输入契约/版本/只读/写权限非空） | 防火墙 validate* | **FAIL CLOSED throw** | INVALID_LEARNING_CONTEXT / INVALID_CONTEXT_PERMISSIONS 等 | 友好错误（调用方 bug） |
| F2 | 敏感键进入输入 | 防火墙 containsSensitiveKey | **FAIL CLOSED throw** | SENSITIVE_FIREWALL_INPUT | 友好错误 |
| F3 | Cross User Reference（所有权错配） | 防火墙 ownership 校验 + Validator 引用回查 | **FAIL CLOSED throw / 校验失败** | FIREWALL_OWNERSHIP_MISMATCH / 引用不可回查 | 硬失败，**不允许降级展示**（伞形 §23） |
| F4 | Provider Timeout | 适配器边界 Promise.race | fallback | llm_timeout | 确定性 Insight/Reasoning |
| F5 | Provider Error（5xx/网络/未知） | 适配器 mapTransportError / 网关防御性 catch | fallback | llm_unavailable | 确定性内容 |
| F6 | Provider 未配置 / 配置名未知 | providerRegistry | fallback | llm_not_configured | 确定性内容 |
| F7 | Rate Limit（上游） | 适配器 | fallback | llm_rate_limited | 确定性内容 |
| F8 | Malformed Output（非 JSON） | 网关 parse | fallback | llm_malformed | 确定性内容 |
| F9 | Schema Violation（结构/超限/未知字段） | Output Contract | fallback | llm_schema_invalid | 确定性内容 |
| F10 | Evidence Binding Failure（伪造引用/快照不一致） | Evidence Binding | fallback | llm_evidence_mismatch | 确定性内容 |
| F11 | Semantic Validation Failure（数值/时间/范围/置信度） | Semantic Validator | fallback | llm_unsafe / llm_unsupported_claim | 确定性内容 |
| F12 | Output Too Large | Runtime 网关只接受 ≤32000 字符的 Provider reply，超限由 Provider 侧按传输异常收敛 | fallback | llm_unavailable | 确定性内容 |
| F13 | Prompt Failure（模板缺失/禁令/封闭性破坏） | promptRegistry 加载期 | **FAIL CLOSED**（加载即抛） | AGENT_PROMPT_ACTIVE_UNRESOLVED / PROMPT_TEMPLATE_* | 服务拒绝启动（坏配置不放行） |
| F14 | Configuration Failure（provider 注册表/活动模板） | registry 加载期 fail-fast | **FAIL CLOSED** | AGENT_PROMPT_ACTIVE_UNRESOLVED / registry 抛错 | 启动期暴露 |
| F15 | 注入形状非法 Provider（调用方违约） | 网关 options 校验 | **FAIL CLOSED throw** | GATEWAY_PROVIDER_INVALID | 友好错误 |
| F16 | 不可能状态（确定性兜底自检失败） | 网关兜底自检 | **FAIL CLOSED throw 500** | GATEWAY_INVARIANT_BROKEN | 友好错误（编程错误防线） |
| F17 | 非 CONTRACT provider 返回非法 reason | （残余路径，27.6.4 Re-Audit M-1 声明） | fail-closed 500 | GATEWAY_INVARIANT_BROKEN | 27.7 装配禁止注入非契约 provider；或装配前加 reason 白名单守卫 |

## 16. Fallback Strategy

```text
LLM unavailable（任一 F4~F12）
  ↓
Deterministic Reasoning（agent-reasoning-v1 投影 → buildFallbackOutput：
  deterministic_reasoning 结构、≤5 条、M-1 整条治理、≤8192 字节、零 LLM 痕迹）
  ↓
Safe Explanation（available=false + fallbackReason + 确定性解释继续展示；
  无确定性 reasoning 时输出空解释信封——仍然合法、仍然诚实）
```

**什么情况允许 fallback**：仅 §15 F4~F12 的 LLM 操作性失败与校验失败；且兜底内容只
能来自防火墙投影内的确定性 reasoning（M-1 整条治理：引用不可回查/稀疏/漂移 → 条目
整条丢弃）。

**什么情况必须返回 unavailable（不可用而非兜底内容）**：确定性 reasoning 本身为空
（无洞察→无解释）时，兜底信封 explanations=[]，available=false，fallbackReason 保留——
系统诚实声明"本次没有 AI 解释"，同时 Agent Home 的确定性洞察区照常展示。

**什么情况绝对不能 fallback**：

1. 输入契约违规（F1/F2/F3/F15）——调用方 bug，必须响亮失败；
2. 跨用户引用（F3）——安全硬失败，禁止降级展示；
3. 兜底自检失败（F16/F17）——不可能状态，宁可 500 不可交付坏信封；
4. 以"再试一次 LLM"作为 fallback——禁止（fallback 唯一方向是确定性层）；
5. 以放宽校验/截断后放行作为 fallback——禁止（非法输出不修补）；
6. 跨用户数据、编造内容、未投影数据作为兜底内容——禁止（兜底来源锁死为
   firewallContext.reasoning）。

## 17. Observability

允许记录（结构化字段，信封 meta 已承载大部分）：

```text
requestId            —— 网关每次调用生成（uuid）
task                 —— 任务枚举
contextSnapshotId    —— sha256（快照指纹；非原始上下文）
contextVersion / truncated / contextBytes —— 投影元数据
reasoningVersion     —— agent-reasoning-v1
promptVersion        —— 信封 promptVersion（= 注册表活动版本，一致性锁）
provider / model     —— 信封元数据（非 baseUrl/非 headers）
validators results   —— meta.validators {outputContract, evidenceBinding, semantic}
fallbackReason       —— ∈ FALLBACK_REASONS×11
latencyMs            —— 网关实测
```

禁止记录：prompt 全文、raw context、LLM output 全文、API key、token、user email、
课程文档正文、provider raw body、secrets（27.6 伞形 §24 继承）。

**Token usage**：当前 Provider 信封不含 token 计数字段——记为 GAP-3（§23），未来以
additive 信封字段补齐（属 27.9.1 Agent Observability 或独立 additive Phase），本阶段
不改信封。

## 18. Security Model

| # | 边界 | 机制（当前 HEAD 已冻结实现） |
|---|---|---|
| 1 | Authentication | 现有 authRequired（JWT）；身份仅 req.userId |
| 2 | Authorization | 只读端点（现 3×GET；未来 LLM 端点同为鉴权 + 用户隔离）；actionLevel=insight_only 贯穿全部契约 |
| 3 | User Isolation | 服务端重建三段输入；所有权校验硬失败；SQL user_id 绑定；Validator 引用回查 |
| 4 | Context Isolation | 防火墙 allowlist + 敏感键全树拒绝 + 8192B 有界 + 快照 id |
| 5 | Provider Isolation | 密钥仅服务端 env；前端不可选 provider/model/baseUrl；原始错误体不出网关；Provider 可替换（注册表） |
| 6 | Prompt Injection Boundary | 禁自由 prompt（任务枚举；自由问答待 27.7.3 独立契约）；System 封闭（payload 只进 user 段）；Prompt 模板禁令扫描；输出白名单 + 语义校验拦截"新指令/权限要求" |
| 7 | Output Validation | agent-llm-output-v1 严格结构（不修补） |
| 8 | Evidence Validation | 快照绑定 + 引用可回查（伪造 = 校验失败） |
| 9 | Semantic Validation | 数值/时间/范围/置信度（幻觉含容，伞形 §13） |
| 10 | Memory Boundary | GrowthMemory/CoachMemory/Reflection 不进入 MVP Provider payload；LLM 输出禁止写回任何 Memory/Reflection/Evidence |
| 11 | Action Boundary | insight_only；无写端点、无工具、无 mutation；suggestion 无 action payload |
| 12 | Presentation Safety | 安全文本渲染；AI Insight 与确定性事实区分；错误友好化（27.3 已冻结 UI + 27.7.1 扩展时继承） |

## 19. Architecture Invariants（冻结）

1. **LLM never becomes Source of Truth.**（§11 层级 9 零权威）
2. **Raw LLM output never directly reaches user.**（必须过三道 Validator + 结果信封）
3. **LLM cannot create Evidence.**
4. **LLM cannot create Insight.**
5. **LLM cannot create Reasoning.**
6. **LLM cannot write Memory.**（GrowthMemory/CoachMemory/Reflection/新记忆）
7. **LLM cannot execute Actions.**（无工具/无 mutation/自主循环禁止）
8. **Provider cannot bypass Firewall.**（防火墙在网关内部构建，结构不可绕过）
9. **Provider cannot bypass Validators.**（三道 Validator 网关常驻、顺序固定、不可注入）
10. **Cross-user references are hard failures.**（F3，禁止降级展示）
11. **Validation is fail-closed.**（非法输出只有拒绝/兜底两出口，不修补）
12. **Agent MVP remains insight_only.**（Action Level 0；suggestion 仅输出形态）
13. **All external model providers remain replaceable.**（注册表 + 信封契约 + provider-neutral 校验链；更换/新增 Provider 不改 Validator/Gateway）

以上 13 条为 Phase 27.7 MVP 冻结不变量；任何后续阶段（27.7.1→30）违反任一条即架构
违规，需新架构版本评审。

## 20. 与现有系统关系

| 分类 | 系统/模块 | 关系 |
|---|---|---|
| Source of Truth | CGStore/Sync、Analytics、GoalEngine、Course Space、Student Knowledge State、Reflection(存储未建)、GrowthMemory、CoachMemory | 只读引用；本阶段与可预见未来**不重定义**（v1.1 §4 + Agent Home v1.0 §2.1 继承） |
| Read Adapter | agentHomeService + 五适配器（behavior/courseKnowledge/knowledgeState/growthMemory/reflection=unavailable） | 有界只读投影，authority 标记唯一入口 |
| Derived Layer | agentInsightService（27.4 规则）、agentReasoning（27.5）、Student Knowledge State 聚合 | 确定性派生；是全部"事实边界"的所在 |
| Validation Layer | agentFirewall + agentOutputValidator + agentEvidenceBinding + agentSemanticValidator + agentPrompt（契约校验）+ agentGateway（编排自检） | 治理链；全函数、fail-closed |
| Presentation Layer | agent-home.html（27.3 冻结）+ 未来 27.7.1 解释展示区 | 只读渲染；AI 输出标注展示 |
| 不重定义清单 | CGStore、Analytics、Goals、Sync、Course System、Course Knowledge、Student Knowledge State、GrowthMemory、CoachMemory、Reflection | schema、写路径、统计口径全部维持现状 |

## 21. Future Boundary

| 未来 Phase | 能力 | 与 MVP 的边界 |
|---|---|---|
| 27.7.1 Learning Conversation | 请求契约路由装配 + 解释展示区 + 会话式交互壳 | 仅装配已冻结链路；无自由 prompt（等 27.7.3） |
| 27.7.2 Context Selection | 按任务/问题的确定性上下文选择引擎 | 选择规则确定性、可审计；不扩大预算 |
| 27.7.3 Query Understanding | 有界学习问题的理解契约（Question Contract） | 用户文本仅作意图解析输入；不得进入 System 段；解析结果仍走防火墙链 |
| 27.7.4 Evidence Graph | 课程知识/证据图谱进入可解释范围 | 资料内容必须 DATA-not-INSTRUCTION 包裹（§13 契约）；引用回查扩展 |
| 27.8 Memory（Read Adapter / Evaluation） | 记忆只读适配进上下文 + Agent 评估框架 | 仍无 Memory Writer；评估不写业务数据 |
| 28 Adaptive Planning | 计划提议（Level 1→2 需独立授权 + 用户确认） | MVP 内禁止；不自动写 Goals/Today Plan |
| 29 AI Tutor | 课程知识与掌握状态之上的辅导 | 不得改 Mastery、不得绕 Evidence |
| 30 Full Personal Learning Agent | 洞察/计划/辅导/记忆/确认行动整合 | 全部写路径仍需用户确认；不变量 §19 继续有效 |

**明确不属于 Phase 27.7 MVP**：自由对话 Chat、Planner、任何 Action 执行、Memory 写入、
工具调用、RAG/Vector DB/Embedding、Multi-Agent、自主循环、课程正文进入 Prompt、
前端直连 Provider、AI 输出写回任何存储、二级统计引擎。

## 22. Test and Verification Strategy

本阶段（Architecture-only）baseline verification：

1. Backend tests 全绿（当前基线 228/228）；
2. Frontend tests 全绿（609/609）；
3. Build PASS；
4. `git diff --check` PASS；
5. 工作树安全检查（git status 仅本阶段文档）。

后续实现阶段（27.7.1 起）必须继承的测试义务（继承 27.6 伞形 §25 + 各冻结 Phase 惯例）：
contract tests（请求/信封/权限/快照）、security tests（跨用户/未认证/注入/伪造引用/
secret 泄露）、fallback tests（每类失败矩阵行的确定性结果）、regression（既有 GET 端点
与 UI 不受影响）、browser（双视口 0 异常 + 无 action 控件）。每类失败的"确定性结果"
以 §15 矩阵为验收表。

## 23. Architecture Gaps（记录在案，本阶段不修）

| # | Gap | 影响 | 归属 |
|---|---|---|---|
| GAP-1 | Query Understanding 未实现：MVP 只接受固定任务枚举，自由文本问题无入口 | 有界问答能力受限 | 27.7.3 |
| GAP-2 | Context Selection 未实现：MVP 为全量有界投影（防火墙预算兜底），无按任务精选 | 上下文利用效率（非安全）问题 | 27.7.2 |
| GAP-3 | Provider 信封无 token usage 字段 | Observability 缺 token 维度 | 27.9.1 / additive 信封变更 |
| GAP-4 | Gateway 链路无路由消费方（27.6.4 基础设施先行），观测字段当前为契约级 | MVP 装配前置条件 | 27.7.1 |
| GAP-5 | 课程知识仅投影字段，资料正文/证据图谱未进入可解释范围 | 课程知识解释深度受限 | 27.7.4（附 DATA-not-INSTRUCTION 包裹契约） |
| GAP-6 | 兜底信封（空解释）的用户呈现文案契约未定义 | 呈现一致性 | 27.7.1 |
| GAP-7 | 27.6.4 Re-Audit M-1 残余路径（非契约 provider 非法 reason → invariant） | 仅注入场景可达 | 27.7 装配前：方案 ② 声明（本档 §15 F17）或加一行 reason 白名单守卫 |

按用户原则（§十七）：以上 Gap 一律记录、不擅自修改现有系统。

## 24. Freeze Gate Checklist

| Gate | 状态 |
|---|---|
| Architecture PASS | H-1 修复后待独立 Re-Audit 终审 |
| Source of Truth PASS | §11（首轮审计 PASS） |
| Context Boundary PASS | §13；toProviderPayload 已接线并由链路级测试锁定 |
| LLM Boundary PASS | §14（审计 PASS） |
| Security PASS | §18；ownerUserId 与注入字段无法进入 Provider payload |
| Permission PASS | §12；GrowthMemory 已更正为不进入 MVP Provider payload |
| Fallback PASS | §15/§16；failure reason 码表已与运行链路对齐 |
| Provider Independence PASS | §19-13（审计 PASS） |
| Validator Chain PASS | §9/§14；快照与引用回查语义保持 fail-closed |
| Memory Boundary PASS | §12/§18-10（审计 PASS） |
| Action Boundary PASS | §12/§18-11（审计 PASS） |
| Working Tree Safety PASS | 本阶段仅修改 H-1 修复面、安全回归与本阶段文档 |

## Final Status

**READY_FOR_INDEPENDENT_REAUDIT** —— H-1 已按方案 B 完成代码级修复：Gateway 与 Provider
边界均通过现有 `toProviderPayload()` 执行 allowlist 投影；Provider Contract 不再要求控制面
身份；新增链路级身份隔离、恶意字段剥离、跨用户 spoofing 与 Prompt 边界回归。最终 Freeze
以 `PHASE_27_7_H1_REMEDIATION_INDEPENDENT_REAUDIT.md` 结论为准。不进入 27.7.1。
