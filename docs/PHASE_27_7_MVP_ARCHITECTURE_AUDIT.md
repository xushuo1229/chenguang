# Phase 27.7 Personal Learning Agent MVP Architecture — 第一轮独立审计报告

审计对象：docs/PHASE_27_7_MVP_ARCHITECTURE.md（审计时状态 READY_FOR_INDEPENDENT_AUDIT，全文即被审对象；审计后仅状态行/Final Status/Freeze Gate 行更新为 ARCHITECTURE_REVIEW_REQUIRED，内容未改动——修正属决策后的修订步骤）

审计基线：HEAD 63f2e18（与文档基线声明一致核实）。审计方式：只读，逐项核对文档声明 vs 实际代码；后端测试套件实测复跑 228/228 通过。审计员未修改任何文件。

## 一、重点检查结论（13 项 + A-D）

| 项 | 判定 | 证据 |
|---|---|---|
| 1 Source of Truth | PASS | 九级层级与 v1.1 §4 / Agent Home v1.0 §2.1 / 27.2.2 §5 兼容；"引用可回查=不可创建"由 evidenceBindingContract.js:30-79 实质支撑 |
| 2 Permission Boundary | CONCERN | 3×GET 只读属实；§12 GrowthMemory "LLM 有界可见"与实际不投影不符（contextFirewall.js:58-68，见 L-1） |
| 3 Context Boundary | CONCERN | 约束（8192/6/3/6/240/160/12）与快照属实；§6 ownerUserId 剥离声明与 HEAD 相反（H-1） |
| 4 LLM Boundary | PASS | 五段保留链顺序即 runtimeGateway.js:95-178 实际调用序 |
| 5 Provider Boundary | PASS | FAIL_REASONS×5、信封、边界超时、密钥边界全属实 |
| 6 Validator Chain | CONCERN | 顺序与主要码映射一致；快照错配实际收敛 llm_evidence_mismatch（runtimeGateway.js:171-173），见 M-1 |
| 7 Evidence Provenance | PASS | sha256 快照 + M-1 整条治理 + 兜底锁死 reasoning |
| 8 User Isolation | PASS | 服务端重建 + 所有权硬抛 + SQL user_id=$1 + Validator 回查 |
| 9 Memory Boundary | PASS | derived_memory、CoachMemory/Reflection 双 unavailable、LLM 输出无写路径 |
| 10 Action Boundary | PASS | insight_only 贯穿、suggestion 无 action payload（outputContract.js:146-148） |
| 11 Fallback | CONCERN | 矩阵主体与 fail-closed 三分法属实；F10/F12 reason 码与实现不符（M-1） |
| 12 Observability | PASS | meta 字段=gatewayContract.js:25-36 白名单；GAP-3（token usage）诚实 |
| 13 Future extensibility | PASS | §21 与 v1.1 路线图衔接自洽；GAP-1~7 全部属实（GAP-4 经 grep 实证：runExplanation 零消费方） |
| A 阶段顺序注记 | PASS | 与 buildLlmContext 入参及 27.6.1 §6.2 一致，表述无歧义 |
| B 不变量 | PASS | §19 十三条与伞形 §28 A-N、v1.1 §4/§7 无冲突 |
| C 内部一致性 | CONCERN | 基线与 228/228 实测相符；§7/§9/§15 码表与 HEAD 存在失真（M-1/M-2） |
| D 契约缝 | PASS | 27.7.1 装配所需契约缝均已定义 |

## 二、Findings

### H-1（High，架构级，阻断 Freeze）——ownerUserId 实际进入 Provider payload

文档 §6 声称「ownerUserId 仅内部校验用，绝不进 Provider payload」「toProviderPayload() 剥离后交付」，HEAD 运行链路与此相反，完整证据链：

1. backend/src/services/agentFirewall/contextFirewall.js:160 —— buildLlmContext 产物含 `ownerUserId: context.userId`；
2. backend/src/services/agentGateway/runtimeGateway.js:134 —— 网关把完整 firewallContext 传给 `provider.generateExplanation({ context: firewallContext, task })`，从未调用 toProviderPayload（全仓 grep：toProviderPayload 仅 contextFirewall.js:177 定义、:200 导出、providerContract.js:67 注释三处引用，零调用点）；
3. backend/src/services/agentProvider/openaiCompatibleProvider.js:79,102 —— validateProviderInput 只校验并 return true；L102 `messages: buildProviderMessages(context)` 直接使用完整 context（与 providerContract.js:67 注释「返回投影 payload（toProviderPayload 产物）」自相矛盾，见 L-5）；
4. backend/src/services/agentPrompt/promptTemplates.js:44 —— user 消息 = `JSON.stringify(payload)` = 含 ownerUserId（及 constraints/metadata）的完整内部上下文，随每次调用发送给外部 LLM Provider；
5. 与冻结契约直接冲突：PHASE_27_6_1_CONTEXT_FIREWALL_CONTRACT.md §4.1（「ownerUserId……不会进入 Provider Payload」）与 §4.2；27.6.1 Re-Audit 的测试只锁了 toProviderPayload 函数输出本身（agentLlmContextFirewall.test.js:80-81），未锁接线；agentProvider.test.js:278-286 隔离测试断言无密钥但未断言无 ownerUserId——缺口因此穿透 27.6.1→27.6.5 全部审计与 golden 锁定；
6. 附带效应：payload=完整 context 使 §6「快照 id 使 LLM 看到的世界与校验世界逐字节一致」在现状下成立；若按文档描述接线剥离，该句将变假——修复时需一并修订。

影响：内部用户标识（含内部约束/元数据结构）每次 LLM 调用越界发送给第三方 Provider，违背本档 Context Boundary / Provider 隔离声明与冻结 27.6.1 契约。属 27.7 §17 原则所述「现有代码与目标架构冲突」情形——按规记录，不擅自修改。

**修复路径（须人工决策，二选一）**：
- 方案 (a)（文档侧）：修订 27.7 档 §6/§13/§4.1 如实描述现状，把「toProviderPayload 未接线」登记为 Gap（27.7.1 前置整改项）；后续以独立 additive Phase 接线。
- 方案 (b)（代码侧）：在 Provider/网关链路接线 toProviderPayload——触及 27.6.3/27.6.5 冻结面与 golden 字节锁（payload 变化 → user 消息字节变化），须走契约级变更 + 独立 Re-Audit，并补「链路级无 ownerUserId 泄漏」测试。

### M-1（Medium，文档级验收表，建议修正后再 Freeze）

§9 称快照错配映射 llm_context_mismatch、§15 F12 称超大输出映射 llm_output_too_large；实际网关对 Evidence Binding 失败一律回退 llm_evidence_mismatch、对 Output Contract 失败一律回退 llm_schema_invalid（runtimeGateway.js:161-173）。llm_context_mismatch / llm_output_too_large 存在于 FALLBACK_REASONS（outputContract.js:26-27）但运行链路不可达。fail-closed 属性不受影响；但 §22 明言「每类失败的确定性结果以 §15 矩阵为验收表」——按现矩阵写 27.7.1 测试必然失败，须先修正矩阵（建议改文档，不改冻结代码）。

### M-2（Medium，文档级）

§7 规则名「task-completion / weak-knowledge / strong-knowledge / focus-summary」与 HEAD 不符——实际 insight type 为 focus_increase / focus_decline / consistency_stable / consistency_drop / knowledge_gap_detected / course_progress_status（backend/src/services/agentInsights/rules/{focusTrend,learningConsistency,knowledgeGap,courseProgress}Rule.js）；「动作仅 review/navigate」不实——insights 无 action 字段，仅 actionLevel（ruleSupport.js:71），实际比文档更严格。机制性声明（每条 ≥1 evidence、缺数据=无洞察、≤10 条）准确。

### Low（5 项）

- L-1：§12「读 GrowthMemory 投影 → LLM 有界可见」过度声明——防火墙只投影 sources(courses/courseKnowledge/knowledgeStates/behavior)+insights+reasoning（contextFirewall.js:58-68），GrowthMemory 实际不进 LLM 上下文（偏安全侧失真，仍须修正）。
- L-2：§24「仅新增 2 个 docs 文件」与审计时工作树（1 个）不符；冻结时将为 3 个（架构档+审计档+review-required 修订）。
- L-3：§21 阶段 29「AI Tutor」与 v1.1 §13「安全操作与反馈」存在继承性分歧（Agent Home v1.0 §12 支持前者）；建议加取舍注记。
- L-4：§17 允许记录的 contextBytes / reasoningVersion 无现成字段（meta 白名单无、firewallContext 无字节计数），27.7.1 需路由层采集或调整字段表。
- L-5：providerContract.js:67-68 注释与实现不符（见 H-1 第 3 条）。

## 三、Verdict

**ARCHITECTURE_REVIEW_REQUIRED**

存在 1 项 High（H-1，架构级，阻断 Freeze）。按 Phase 27.7 规程：不得进入 Freeze，须创建/更新 docs/ARCHITECTURE_REVIEW_REQUIRED.md 并停止，等待 H-1 修复路径（a/b）的人工决策。架构设计本体（SoT 层级、权限、边界、失败架构、不变量、未来延伸）经核实自洽且可延伸——完成 ①创建 review-required ②修正验收表（M-1）③修正 §7 表述（M-2）④清理 L-1~L-5 及 H-1 决策落地后，本架构可进入 Freeze（届时按决策路径可能需要契约级 Re-Audit）。
