# GitHub Learning Agent Architecture Benchmark

## 1. Executive Summary

本报告比较六个公开 Personal Learning Agent / AI Tutor / Adaptive Learning 项目的架构模式，并判断哪些模式可以进入知行后续 Phase。

结论：

- 知行已经提前完成较完整的 **事实 → 证据 → 确定性推理 → Context Firewall → LLM → Validator** 安全链路。
- 最大缺口不是“有一个记忆模块”，而是缺少 **学习练习、迁移验证、复习调度与掌握度晋升闭环**。
- 最值得吸收的是 **共享 learner context、分层记忆生命周期、mastery evidence、review queue、read-only tool gate** 等边界清晰的模式。
- 不应导入 autonomous agent loop、LLM 写 Memory、unbounded RAG、LLM-as-Truth、tool-first planner 或 provider-specific orchestration。

本任务只做架构参考，不复制代码，不引入依赖，不执行第三方代码，不修改生产代码。

## 2. Projects Reviewed

| Project | Repository | Default Branch | Language | License | Review Date |
|---|---|---|---|---|---|
| Inno Agent | `hhyqhh/inno-agent` | `main` | TypeScript | MIT | 2026-09-21 |
| DeepTutor | `DorianGallo/DeepTutor` | `main` | Python | Apache-2.0 | 2026-09-21 |
| OpenTutor | `zijinz456/OpenTutor` | `main` | Python | MIT | 2026-09-21 |
| LLMTutor | `SwissLearningAnalytics/LLMTutor` | `main` | TypeScript | MPL-2.0 | 2026-09-21 |
| Learn Anything | `Nar101/learn-anything` | `main` | Python | MIT | 2026-09-21 |
| TuTor | `kevinnio/tutor` | `master` | Agent Skill | MIT | 2026-09-21 |

本报告使用 GitHub Repository / Git Tree / Raw File 只读接口检查关键文件，不 clone repository，不运行项目。

## 3. Methodology

审查步骤：

1. 读取 GitHub metadata、license 和 default branch。
2. 使用 Git Tree API 定位 README、architecture、memory、knowledge、retrieval、learner state、practice、feedback、security、tests 相关文件。
3. 使用 Raw File 只读读取关键实现或协议文件。
4. 将外部模式与知行冻结架构对照。
5. 按 `Adopt Now / Adopt After Current Phase / Future Architecture / Research Only / Reject` 分类。

Compatibility Gate：

```text
不破坏 Source of Truth
不绕过 Context Firewall
不绕过 Evidence Binding
不绕过 Output Validator
不绕过确定性推理
不破坏用户隔离
不引入不受控 Agent Loop
不引入 hidden write
不引入 Provider lock-in
不要求框架迁移
不破坏 backward compatibility
```

## 4. Architecture Comparison

| Project | Core Architecture | Main Strength | Main Risk |
|---|---|---|---|
| Inno Agent | 基于 coding-agent SDK 的个人学习 agent，三层记忆 + scheduler + Practice Lab | 长期学习上下文分层清晰 | 单人产品，无多用户 auth/tenant isolation；agent 可通过 tool 写记忆 |
| DeepTutor | Python + Next.js agent workspace，多模式共享 runtime | UnifiedContext、capability registry、memory/knowledge 可检视 | Agent loop 拥有 tool、MCP、RAG、代码执行、Memory 写入等较大权限面 |
| OpenTutor | 本地单用户课程学习系统，材料 ingestion + knowledge graph + practice/review | 学习闭环完整，测试面广 | 本地 owner 自动绑定与知行 JWT 多用户模型不同；agent/planner 侧权限较宽 |
| LLMTutor | YAML tutor 配置 + case-based tutor + feedback 存储 | 教学配置与研究型反馈结构简单清晰 | 缺少长期 learner state 与安全隔离，不适合直接作为多用户架构 |
| Learn Anything | Agent Skill 协议 + course package | mastery evidence 与 promotion gate 设计突出 | 依赖 Agent 直接读写 course/state 文件 |
| TuTor | 行为约束型 tutor skill | read-only verification gate 明确 | 无持久学习状态，仅适合作为行为模式参考 |

## 5. Context Selection Comparison

| Project | Context Selection Pattern | Compatible With Chenguang? |
|---|---|---|
| Inno Agent | 每轮从 learner profile 构建 context pack；L2 wiki 用 lexical BM25 + graph；L3 recall 设 threshold 和 limit | 模式兼容；但需要走知行 Context Selection / Firewall |
| DeepTutor | `UnifiedContext` 携带 user message、enabled tools、KB、memory snapshot、persona；capability 共享 context | 共享 context 模式兼容；agent tool loop 不兼容 |
| OpenTutor | intent 决定 memory type 优先级；RAG、memory、history 分预算 trim | 模式兼容；不能引入其 runtime |
| LLMTutor | YAML tutor prompt + messages | 不够充分 |
| Learn Anything | course package 中的 source manifest、learner state、review queue 组成 context | 模式兼容，适合未来 Practice / Review |
| TuTor | 每步只加载当前任务与 tool gate 规则 | 模式兼容，适合未来 Practice |

知行现有实现已经比多数项目更严格：27.7.4 Context Selection Engine 具备 source allowlist、scope filter、owner fail-closed、budget、deterministic ordering、authority preservation 和 evidence integrity。

## 6. Knowledge Architecture Comparison

| Project | Knowledge Organization | Chenguang Equivalent | Decision |
|---|---|---|---|
| Inno Agent | L2 native wiki，人可读 + agent-queryable，支持 graph 与 ingestion | Course Space / Course Knowledge / Document / Evidence | Partial equivalent |
| DeepTutor | versioned RAG libraries、LightRAG/GraphRAG/Obsidian、knowledge base manifest | Course Knowledge + Document + Evidence | Pattern compatible; runtime not importable |
| OpenTutor | LOOM knowledge graph、concept edges、prerequisite、confused_with | Course Knowledge / KnowledgeNode / KnowledgeRelation | Partial equivalent |
| LLMTutor | YAML tutor config | Prompt Template Contract | Partial equivalent |
| Learn Anything | source manifest + source claims + assessment source support | Document / Evidence / Course Knowledge | Strongly compatible contract pattern |
| TuTor | local reference files | No direct equivalent | Research only |

不应新建第二套 Knowledge Base。未来学习模式应把 Course Knowledge 作为 grounding layer，Evidence 仍然单独存在。

## 7. Memory Comparison

| Memory Pattern | Inno Agent | DeepTutor | OpenTutor | Learn Anything | Chenguang Current State |
|---|---|---|---|---|---|
| Short-term conversation | L3 threshold-gated recall | UnifiedContext / agent loop | history budget | session runtime | bounded conversation context exists |
| Learner profile | L1 profile | memory L1/L2/L3 | learner profile schema | learner-state.yaml | Personal Learning Agent architecture defined; not all selected by 27.7.4 |
| Course knowledge | L2 wiki | KB / RAG | LOOM graph | source manifest | Course Space exists |
| Student state | projected knowledge states | mastery path | ConceptMastery / BKT | mastery status | Student Knowledge State exists |
| Reflection | events / profile tools | memory consolidation | reflection agent | review queue | Reflection exists but 27.7.4 v1 not selectable |
| Interaction memory | session recall | memory graph | memory pipeline | evidence log | GrowthMemory / CoachMemory boundaries defined |
| Growth memory | not same concept | not same concept | analytics events | mastery evidence | GrowthMemory exists but not selectable in 27.7.4 v1 |
| Task state | scheduler jobs | capability state | agent task model | next_action | Not a v1 selectable source |

关键差异：

- Inno Agent 和 Learn Anything 把 mastery evidence 显式建模。
- DeepTutor 的 memory graph 强调 claim 可回查，但 agent 可以写 memory。
- OpenTutor 使用 BKT / FSRS 等学习科学模型。
- 知行应复用现有 GrowthMemory / Student Knowledge State / Evidence，不新建 Memory 系统。

## 8. Learner State Comparison

| Project | Learner State | Evidence Linkage | Assessment |
|---|---|---|---|
| Inno Agent | goals、knowledge states、misconceptions、preferences | `evidence_ids`；state confidence 不是校准概率 | exercise / evidence evaluator |
| DeepTutor | memory surfaces + mastery path | memory graph / RAG citation | quiz / mastery |
| OpenTutor | ConceptMastery、learning progress、FSRS fields | quiz / practice interactions | quiz / review |
| LLMTutor | only feedback messages | no persistent learner state | qualitative feedback |
| Learn Anything | `unknown → exposed → guided → independent → transferable → durable` | promotion evidence + evidence log | assessment freeze + preflight |
| TuTor | checklist of current step | verification result | user “done” is not trusted until verified |

Learn Anything 的 mastery state ladder 最适合未来 Practice Mode 参考，但必须通过后端 Contract 和 Evidence，而不是 Agent 文件写入。

## 9. Learning Loop Comparison

| Loop Stage | Inno Agent | DeepTutor | OpenTutor | Learn Anything | TuTor |
|---|---|---|---|---|---|
| Learn | teaching / profile | Chat / Book | notes / tutor | lesson pack | step explanation |
| Practice | Practice Lab | Quiz / Solve | quiz / flashcards | practice | learner executes step |
| Feedback | evidence evaluator | capability feedback | quiz result / feedback | feedback strategies | verify result |
| Recall | profile projection | memory recall | FSRS | review queue | no persistence |
| Transfer | evidence kind `transfer` | mastery path | cognitive load / mastery | transfer task | next practical step |
| Review | scheduler + review concepts | mastery loop | review page / LECTOR | delayed review | repeat verification |
| Mastery | knowledge state | mastery path | BKT / FSRS | mastery promotion gate | verified step completion |

最成熟的学习闭环不是单独某个 UI，而是 `evidence → mastery change → next review → transfer test` 的闭环。

## 10. Tutor Comparison

| Project | Tutor Model | Strength | Risk |
|---|---|---|---|
| Inno Agent | tool-augmented personal teacher | profile-aware、practice-aware | agent 可执行工具 |
| DeepTutor | multi-mode agent tutor | shared context、modes | model/tool权限面大 |
| OpenTutor | block-based adaptive tutor | course grounded、adaptive | planner/agent 行为复杂 |
| LLMTutor | case-based tutor | institutional case learning | 状态少 |
| Learn Anything | source-grounded adaptive tutor | mastery contract | skill 依赖 Agent 写文件 |
| TuTor | learning-by-doing coach | 不替学生完成任务 | 只覆盖 step-by-step 场景 |

知行未来应保持：

```text
AI can inspect, explain, verify, suggest
AI cannot replace learner action
AI cannot directly write business data
```

## 11. Agent Permission Comparison

| Project | Read | Write | Plan | Act | Remember | Schedule | Search | Execute |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Inno Agent | Yes | Tool-gated | Yes | Tool-gated | Yes | Yes | Tool-gated | Tool-gated |
| DeepTutor | Yes | Agent tools | Yes | Tools / MCP | Yes | Partly | Yes | Partly |
| OpenTutor | Yes | Agent/backend tools | Yes | Tools / sandbox | Yes | Yes | Yes | Sandbox |
| LLMTutor | Yes | DB persistence | No | No | No | No | No | No |
| Learn Anything | Yes | Agent writes course files | Yes | No | Yes | Review queue | Yes | No |
| TuTor | Read-only verification | No | Step plan | Learner acts | Session only | No | No | Learner executes |

知行默认 Agent 必须保持 READ ONLY。任何写能力都必须是：

```text
AI proposal → user confirmation → authorized Store / backend write
```

## 12. Security Comparison

| Project | Auth / Isolation | Tool Boundary | Notable Control |
|---|---|---|---|
| Inno Agent | personal agent，无 multi-user auth | permission bridge + sandbox + hard deny | workspace path guard |
| DeepTutor | multi-user deployment、KB access、tool access | builtin tool whitelist、MCP filter | owner-scoped access |
| OpenTutor | local single-user auto owner | sandbox / security middleware | JWT、authz、security regressions |
| LLMTutor | pseudonym、institutional deployment | provider config only | production mode drops model override |
| Learn Anything | depends on host Agent | file write by Agent | source bounded policy |
| TuTor | depends on host Agent | read-only tool gate | explicit forbidden command list |

DeepTutor 的 owner-scoped KB/tool access 与知行方向一致；TuTor 的 read-only verification gate 值得吸收。

## 13. Privacy Comparison

| Project | Privacy Pattern | Compatible Decision |
|---|---|---|
| Inno Agent | local paths、pluggable providers、sandbox | compat pattern; not enough for multi-user SaaS |
| DeepTutor | workspace home、multi-user workspace、provider config | pattern useful, but provider payload must pass Firewall |
| OpenTutor | local-first、self-hosted、SQLite option | local-first value compatible, but owner model differs |
| LLMTutor | pseudonym instead of direct identity | useful for institutional analytics only |
| Learn Anything | course files owned by learner | pattern useful, not implementation |
| TuTor | host agent responsibility | not sufficient |

知行必须继续保证：owner identity 不进入 Provider payload，raw user content 不写入 logs，API key / token 不进入 Prompt。

## 14. Evaluation Comparison

| Project | Evaluation Mechanism | Chenguang Gap |
|---|---|---|
| Inno Agent | L2 retrieval eval、context usage tests | 缺少 learning outcome eval |
| DeepTutor | memory tests、KB tests、tool dispatch tests、mastery tests | 缺少 mastery/promotion eval |
| OpenTutor | unit、E2E、BKT、FSRS、LOOM、authz、security regression | 缺少完整 learning loop eval |
| LLMTutor | structured feedback questions | 可吸收 feedback schema |
| Learn Anything | mastery gate、transfer、delayed review evals | 最适合未来 Practice / Review |
| TuTor | session smoke test | 不适合系统级评估 |

知行已有强 engineering regression，需要增加 learning outcome / mastery progression 的架构评估，而不是把模型回答当作学习证据。

## 15. Inno Agent Analysis

Repository: `https://github.com/hhyqhh/inno-agent`

Inspected paths:

```text
README.md
apps/inno-agent/src/memory/learner/context-pack.ts
apps/inno-agent/src/memory/learner/types.ts
apps/inno-agent/src/memory/learner/evidence.ts
apps/inno-agent/src/memory/l2/l2-search.ts
apps/inno-agent/src/memory/l3/recall.ts
apps/inno-agent/src/agent/permission-bridge.ts
docs/PERMISSIONS_AND_SANDBOX.md
```

### Current Architecture

Inno Agent 将长期学习上下文拆成三层：

```text
L1 learner profile
  goals / knowledge states / misconceptions / preferences
        ↓
L2 native wiki knowledge base
  pages / lexical BM25 / graph links
        ↓
L3 session recall
  SQLite FTS / threshold-gated cross-conversation recall
```

它把每轮教学上下文压缩为 context pack，并注入 system prompt。L1 profile 可被人检视和编辑；mastery score 明确标注为 heuristic，不是校准概率；knowledge state 和 misconception 都连接 `evidence_ids`。

Learning evidence 使用 kind、result、score、hint level、delay、transfer distance、evaluator confidence 等字段。

### Strengths

- 三层生命周期清晰：profile、knowledge、session。
- context pack 有边界，不是全量 dump。
- L3 recall 使用 threshold、limit、snippet 限制。
- learner state 可检视、可纠正。
- mastery evidence 类型化，优于“AI 说过用户学过”。

### Risks

- 它是 single-learner 架构，README 明确无 multi-user auth、tenant isolation、horizontal scaling。
- Durable facts 通过 agent tools 写入 L1/L2，对知行必须改为 proposal → confirmation → authorized write。
- proactive scheduler 和 Practice Lab 属于未来 Action / Planner 阶段。
- sandbox / permission mode 提供边界，但知行不能引入同等宽度的 coding-agent tool 面。

### Chenguang Mapping

| Inno Pattern | Chenguang Equivalent | Decision |
|---|---|---|
| L1 learner profile | Personal Data / GrowthMemory / Reflection architecture | Partial equivalent |
| L2 wiki | Course Space / Course Knowledge / Document | Partial equivalent |
| L3 session recall | bounded conversation context | Existing bounded version |
| context pack | Context Selection + Context Firewall | Existing, stricter |
| learning evidence | Evidence / Student Knowledge State | Partial equivalent |
| evidence taxonomy | Chenguang Evidence Contract | Future compatible pattern |
| proactive scheduler | Planner / Action future | Future / Requires Architecture Review |
| agent memory writer | prohibited under current Agent rules | Reject / Incompatible |

## 16. DeepTutor Analysis

Repository: `https://github.com/DorianGallo/DeepTutor`

Inspected paths:

```text
README.md
deeptutor/core/context.py
deeptutor/agents/chat/agent_loop.py
deeptutor/services/memory/ops.py
deeptutor/tools/rag_tool.py
deeptutor/multi_user/tool_access.py
deeptutor/multi_user/knowledge_access.py
deeptutor/capabilities/mastery/loop.py
deeptutor/learning/mastery.py
```

### Current Architecture

DeepTutor 用同一个 agent runtime 承载 Chat、Quiz、Research、Solve、Visualize、Mastery Path 等模式。核心共享层是 `UnifiedContext`，其中包含：

```text
user_message
enabled_tools
allowed_builtin_tools
active_capability
knowledge_bases
memory_context
persona_context
skills_manifest
```

Knowledge Base 使用版本化 RAG library；Memory 提供 L1/L2/L3 可检视界面；Memory Graph 将 claim 回连 evidence；RAG 工具要求 explicit `kb_name`，multi-user 场景检查当前用户是否可访问该 KB。

### Strengths

- “switch the objective, not the engine” 的多模式共享上下文设计有价值。
- capability registry 适合未来扩展 Learning Mode。
- memory surface 可检视、可编辑。
- owner-scoped KB / tool access 方向正确。
- Mastery Path 是一个集中学习闭环入口。

### Risks

- agent loop 同时拥有 RAG、Memory、Web、MCP、代码执行等能力，权限面远大于知行当前边界。
- LLM/tool 可写 memory，不符合知行“AI proposal → user confirmation → Store write”规则。
- RAG 结果若直接进入 prompt，必须依赖 Citation / Evidence Binding，否则 Retrieval 会变成事实。
- 多 provider / MCP / partner 模式增加不可控输出路径。

### Chenguang Mapping

| DeepTutor Pattern | Chenguang Equivalent | Decision |
|---|---|---|
| shared learner context | Context Selection / Agent Context | Already partially solved |
| capability registry | future Learning Mode registry | Future Architecture |
| mode-specific objective | Query Understanding `queryType` | Partially solved |
| inspectable memory | GrowthMemory / CoachMemory boundaries | Partial equivalent |
| memory graph evidence trace | Evidence Binding | Existing, stricter |
| owner-scoped KB access | user/course isolation | Existing |
| unified agent loop | not allowed | Reject / Incompatible |
| agent memory write | not allowed | Reject / Incompatible |

## 17. OpenTutor Analysis

Repository: `https://github.com/zijinz456/OpenTutor`

Inspected paths:

```text
README.md
docs/architecture-decisions.md
docs/local-single-user.md
SECURITY.md
apps/api/services/agent/context_builder.py
apps/api/services/agent/context_sources.py
apps/api/services/agent/context_trimming.py
apps/api/services/knowledge/graph_ops.py
apps/api/services/learning_science/knowledge_tracer.py
apps/api/services/agent/verifier.py
```

### Current Architecture

OpenTutor 是 local-first 单用户课程系统。Course Material ingestion 后生成 notes、quiz、flashcards，并通过 adaptive tutor、知识图谱、FSRS、BKT、认知负荷、review 等组成学习闭环。

Context Builder 并行或顺序加载 preference、memory、RAG、history，然后按 budget trim。Intent 决定 memory type 优先级，例如 review 优先 knowledge/profile，quiz 优先 knowledge，learn 优先 profile/knowledge。

Knowledge graph 使用 prerequisite、related、confused_with、reinforces、part_of 等关系；mastery 使用 BKT / ConceptMastery；review 使用 FSRS。

### Strengths

- Course Material 是长期学习系统的 grounding source。
- context budget 是一等公民。
- intent-aware memory type selection 值得参考。
- knowledge graph 关系类型清晰。
- mastery / review 闭环比普通 Chat 更接近学习发生。

### Risks

- local single-user owner 自动绑定与知行 JWT multi-user 架构不一致。
- LLM-extracted graph 必须保留 Document / Evidence provenance，否则生成内容会污染 Course Knowledge。
- ambient planner、agent tools、code execution 属于未来 Planner / Action 阶段，不能提前进入 Learning Conversation。

### Chenguang Mapping

| OpenTutor Pattern | Chenguang Equivalent | Decision |
|---|---|---|
| course material ingestion | Course Space / Document / Course Knowledge | Existing foundation |
| structured notes / quiz / flashcards | not full equivalent | Future Architecture |
| intent-aware memory selection | Query Understanding + Context Selection | Partially solved |
| context trimming | budget policy | Existing |
| knowledge graph | KnowledgeNode / KnowledgeRelation | Existing schema foundation |
| BKT / FSRS mastery | Student Knowledge State | Missing capability |
| adaptive practice | not equivalent | Future Architecture |
| local owner binding | rejected for SaaS model | Reject / Incompatible |

## 18. LLMTutor Analysis

Repository: `https://github.com/SwissLearningAnalytics/LLMTutor`

Inspected paths:

```text
README.md
src/lib/ai/chat.ts
src/lib/db/schema.ts
src/lib/feedback/feedback.ts
src/lib/types/tutor.ts
tutors/tutors/tutor-schema.json
src/lib/pseudonymStore.ts
```

### Current Architecture

LLMTutor 使用 YAML 定义 tutor、prompt 和 optional learning objectives，把对话保存到数据库，并通过结构化 feedback 问用户是否使用外部资料、回答是否正确、是否完整。

### Strengths

- tutor configuration 是显式 schema。
- feedback 区分 study / non-study，并记录外部资料使用。
- 适合教学研究场景。

### Risks

- 没有完整 learner state、mastery evidence 或 course grounding。
- feedback 是用户主观输入，不能自动成为事实。
- pseudonym 模型不能替代知行 auth / owner isolation。

### Chenguang Mapping

| LLMTutor Pattern | Chenguang Equivalent | Decision |
|---|---|---|
| tutor YAML contract | Prompt Template Contract | Existing, stricter |
| case-based tutor | future Learning Conversation mode | Future Architecture |
| structured feedback | Feedback Loop | Partial equivalent |
| external-source question | Evidence Binding | Partially solved |
| pseudonym privacy | not sufficient | Research Only |

## 19. Learn Anything Analysis

Repository: `https://github.com/Nar101/learn-anything`

Inspected paths:

```text
SKILL.md
templates/learner-state.yaml
templates/review-queue.yaml
templates/assessment.yaml
references/assessment-integrity.md
references/feedback-strategies.md
rubrics/mastery-rubric.md
evals/mastery-promotion-gate.md
evals/transfer-test.md
evals/delayed-review.md
```

### Current Architecture

Learn Anything 是 source-grounded adaptive tutor protocol。课程包包含 source manifest、learner state、review queue、assessment、sources 等。

其 learner state 明确区分：

```text
unknown
exposed
guided
independent
transferable
durable
```

每次状态变化需要 promotion evidence。assessment 在展示前冻结，并要求 source support、答案/rubric 冻结、选项互斥和真实行为。若 assessment 无法判分，必须撤销旧分数并重写，不能保留错误 mastery。

### Strengths

- 明确回答“什么证明学习发生”：不是回答过问题，而是可观察的 recall / application / transfer / durable evidence。
- mastery ladder 清晰。
- assessment freeze / preflight 适合未来 Practice Mode。
- review queue 和 delayed review 支持长期学习。
- “Saying I understand does not count as mastery” 是重要产品边界。

### Risks

- 它依赖 Agent 直接读写 course/state 文件。
- mastery 判断部分依赖 model / rubric，需要知行后端 deterministic gate。
- source bounded / source augmented 语义必须接入 Evidence Contract。

### Chenguang Mapping

| Learn Anything Pattern | Chenguang Equivalent | Decision |
|---|---|---|
| learning goal / capability map | Goals / Course Knowledge | Partial equivalent |
| mastery state ladder | Student Knowledge State | Future compatible schema idea |
| promotion evidence | Evidence / Evidence Binding | Future compatible contract |
| transfer test | Practice Mode future | Future Architecture |
| review queue | not full equivalent | Future Architecture |
| assessment freeze | Output Validator / Evidence Binding | Compatible pattern |
| agent file writes | prohibited | Reject / Incompatible |

## 20. TuTor Analysis

Repository: `https://github.com/kevinnio/tutor`

Inspected paths:

```text
SKILL.md
references/tool-gate.md
README.md
AGENTS.md
```

### Current Architecture

TuTor 是一个行为约束型 tutor skill。它的规则是：

```text
one action per turn
user executes the work
AI verifies with read-only tools
AI never creates, edits, builds, installs, commits, or runs the learner's deliverable
```

Tool gate 将命令分为 allowed verification 和 forbidden work。验证失败时不进入下一步。

### Strengths

- 把“AI 教学”和“AI 代做”分开。
- read-only verification gate 清晰。
- verification failure 必须阻止推进。
- 与知行 Agent READ ONLY / user confirmation 原则一致。

### Risks

- 没有持久 learner state。
- tool gate 是 prose-enforced，不是系统级 API enforcement。
- 覆盖范围主要是 coding-style learning-by-doing。

### Chenguang Mapping

| TuTor Pattern | Chenguang Equivalent | Decision |
|---|---|---|
| one step per turn | future Practice Mode UX | Future Architecture |
| learner executes | user control principle | Adopt as product principle |
| read-only verification | Agent READ ONLY | Strongly compatible |
| verification before advance | mastery promotion gate | Future compatible pattern |
| tool gate contract | future tool/action boundary | Adopt after current phase |

## 21. Chenguang Mapping

### Current Frozen Chain

```text
DATA
 ↓
DETERMINISTIC FACTS
 ↓
INSIGHT
 ↓
EVIDENCE
 ↓
DETERMINISTIC REASONING
 ↓
LLM EXPLANATION
 ↓
VALIDATION
 ↓
USER
```

### Current Architecture Assets

| Chenguang Layer | Current State |
|---|---|
| CGStore / Analytics | Source of Truth |
| Course Space | Course / Document / KnowledgeNode / KnowledgeRelation foundation |
| Student Knowledge State | user-owned state and evidence-backed schema |
| Context Firewall | field allowlist、user isolation、provider payload boundary |
| LLM Runtime Gateway | provider failure / fallback / validator envelope |
| Evidence Binding | prevents fabricated references |
| Semantic Validation | numerical / temporal / confidence / scope checks |
| Prompt Template Contract | bounded prompt contract |
| Query Understanding | deterministic interpretation、scope、ambiguity、clarification |
| Context Selection Engine | source allowlist、budget、owner fail-closed、evidence integrity |
| GrowthMemory / CoachMemory / Reflection | defined modules; 27.7.4 v1 does not select them |

## 22. Already Solved

以下能力已在知行提前完成或已有冻结边界，不应重复建设：

1. **User isolation**：owner fail-closed 已在 Context Firewall 和 Context Selection 中明确。
2. **Context Firewall**：数据进入 Provider 前已有 allowlist 和脱敏边界。
3. **Evidence Binding**：LLM 不能引用不存在的 evidence。
4. **Output Validator**：schema、semantic、numerical、temporal validation 已有合同。
5. **Prompt Template Contract**：prompt 不应自由拼凑。
6. **Deterministic Query Understanding**：intent、scope、ambiguity、clarification 已有 closed contract。
7. **Context Selection Engine**：source allowlist、budget、authority、provenance、evidence integrity 已实现。
8. **Course Space foundation**：Course、Document、KnowledgeNode、KnowledgeRelation 已存在。
9. **Student Knowledge State foundation**：user-owned、course/node-bound state 已存在。
10. **Reflection / Feedback / Growth Context**：已有产品与数据边界，不需要外部项目重写。

## 23. Missing Capabilities

| Capability | Current State | Source Inspiration |
|---|---|---|
| Practice Mode | missing | Learn Anything / TuTor / OpenTutor |
| Mastery promotion gate | partial Student Knowledge State, no full loop | Learn Anything |
| Transfer task | missing | Learn Anything |
| Review queue | missing | Learn Anything / OpenTutor |
| FSRS / spaced review | missing | OpenTutor |
| BKT / mastery inference | Student Knowledge State exists but no BKT loop | OpenTutor |
| Quiz / flashcards | missing | OpenTutor / DeepTutor |
| Learning outcome evaluation | engineering tests exist, learning-loop eval missing | Learn Anything / OpenTutor |
| Multi-mode shared learning runtime | Context Selection exists, mode registry missing | DeepTutor |
| Context usage transparency | architecture metadata exists, user-facing explanation missing | Inno Agent / DeepTutor |

## 24. Compatible Patterns

### 24.1 Shared Learner Context

不同学习模式应共享同一个 Context Selection / Context Builder，而不是各自拼 prompt。

最小兼容方式：

```text
Learning Mode
 ↓
mode-specific Query Understanding contract
 ↓
same Context Selection source allowlist
 ↓
same Context Firewall
 ↓
mode-specific Prompt / Validator
```

### 24.2 Course Knowledge as Grounding Layer

Course Knowledge 应成为 Learning Conversation、Practice、Review 的共同 grounding layer。

约束：

```text
Course Knowledge ≠ LLM generated answer
Document text ≠ Evidence
KnowledgeNode ≠ generated explanation
```

### 24.3 Layered Memory Lifecycles

不应新建 Memory 系统，而应继续区分：

```text
short-term conversation
learner profile
course knowledge
student knowledge state
reflection
growth memory
coach memory
```

每层都必须有 lifecycle、authority、write condition 和 read condition。

### 24.4 Evidence-Typed Learning Evidence

未来 Practice / Mastery 应使用类型化 evidence：

```text
exposure
guided recall
independent recall
application
transfer
review
self-report
```

self-report 只能作为 low-authority signal，不能自动成为 mastery。

### 24.5 Mastery Promotion Gate

外部 mastery ladder 可映射为：

```text
unknown
exposed
guided
independent
transferable
durable
```

晋升必须有 promotion evidence；迁移失败必须保留历史 independent evidence，但不能升级为 transferable。

### 24.6 Review Queue

Review Queue 只应引用已有 Student Knowledge State / Evidence，不应创建第二套 mastery 数据。

### 24.7 Read-Only Verification Gate

未来 Practice Mode 应继承 TuTor 的边界：

```text
AI can inspect and verify
AI can explain next step
AI cannot perform the learner's task
AI cannot write business data without confirmation
```

### 24.8 Intent-Aware Source Priority

OpenTutor 的 intent-specific memory priority 可以映射到 Context Selection hints。

示例：

```text
review       → student state + evidence + review history
practice     → course knowledge + student state + evidence
quiz         → course knowledge + evidence
diagnose     → deterministic facts + student state + insight
reflection   → reflection + growth context
```

## 25. Incompatible Patterns

| External Pattern | Reason |
|---|---|
| Autonomous Agent Loop | 知行当前 Agent 必须默认 READ ONLY |
| Agent writes Memory directly | hidden writes，绕过用户确认与 Store 边界 |
| Agent writes Course Knowledge | 会混淆 generated content 与 source knowledge |
| LLM-as-Truth | 违反 Analytics / Evidence source of truth |
| Retrieval-as-Truth | 检索结果必须经 evidence/provenance 约束 |
| Unbounded RAG | token、scope、隐私和 prompt injection 风险 |
| MCP / unrestricted tools | 权限面过大，必须另行架构阶段 |
| Planner-first architecture | 知行当前阶段禁止提前 autonomous planning |
| Provider-specific orchestration | 破坏 Provider Gateway 抽象 |
| Second Memory / second Store | 破坏 CGStore / Analytics / GrowthMemory 边界 |
| Local owner auto-binding | 与知行 JWT multi-user 模型冲突 |

## 26. Recommended Future Imports

### Immediate

当前 27.7.4 Context Selection Engine 已冻结，本阶段不修改。Immediate 是下一小步可考虑的模式：

1. Context Usage Transparency Contract（metadata-only）。
2. Learning Mode → Context Selection hint mapping。
3. Course Knowledge as common grounding layer 的显式 architecture note。

### Near Future

1. **Practice Mode Contract**
   - Course Knowledge + Student Knowledge State + Evidence 输入。
   - learner action 与 AI explanation 分离。
   - assessment freeze / ungradable 状态。

2. **Mastery Promotion Contract**
   - evidence type、promotion evidence、status ladder。
   - deterministic gate，不由 LLM 晋升。

3. **Review Queue Contract**
   - 基于 Student Knowledge State + Evidence。
   - 支持 delayed review，不引入第二套数据。

### Long Term

1. **BKT / FSRS Learning Science Layer**
   - 输入必须来自 practice / review evidence。
   - 输出仍是 Student Knowledge State projection，不是新 truth。

2. **Learning Planner**
   - 只能基于 deterministic state 生成 proposal。
   - 需要 user confirmation。

3. **Memory Consolidation / Decay**
   - 必须保持 authority 和 deletion/audit path。
   - 不得让 LLM 直接改写 Memory。

4. **Action Proposal**
   - 只能 propose。
   - 必须用户确认后由授权层执行。

## 27. Explicit Non-Imports

以下模式不应导入：

```text
Inno Agent agent tool writer
Inno Agent proactive scheduler as-is
DeepTutor unified agent loop
DeepTutor MCP / partner / external CLI integration
OpenTutor local owner auto-binding
OpenTutor ambient planner as-is
LLMTutor pseudonym-only identity model
Learn Anything agent file writes
TuTor prose-only enforcement as sole safety boundary
```

## 28. Architecture Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Generated mastery text becomes truth | High | Promotion gate must be deterministic |
| Practice feedback pollutes knowledge | High | Separate Course Knowledge, Evidence, Learner State |
| Review becomes second store | High | Review Queue only references existing state |
| Multi-mode prompts bypass Firewall | High | All modes share Context Firewall |
| Planner suggests writes directly | High | Planner only proposes; user confirms |
| Semantic retrieval expands scope | Medium | Future retrieval must preserve owner/course scope |
| Context transparency exposes internals | Medium | Only bounded metadata, no raw context |
| Learning analytics creates user pressure | Low | Keep growth framing, no coercive streaks |

## 29. License Notes

| Repository | License | Architectural Reference | Code Import |
|---|---|---|---|
| `hhyqhh/inno-agent` | MIT | Allowed | Do not import |
| `DorianGallo/DeepTutor` | Apache-2.0 | Allowed | Do not import; Apache attribution/notice rules would apply if code copied |
| `zijinz456/OpenTutor` | MIT | Allowed | Do not import |
| `SwissLearningAnalytics/LLMTutor` | MPL-2.0 | Allowed | Do not import; file-level copyleft rules would apply if code copied |
| `Nar101/learn-anything` | MIT | Allowed | Do not import |
| `kevinnio/tutor` | MIT | Allowed | Do not import |

本报告只引用架构思想和公开文件路径，不复制代码。因此当前不产生 attribution obligation。

## 30. Conclusions

知行不需要追赶这些项目的 Agent 自由度；相反，知行的 Context Firewall、Evidence Binding、Output Validator 和 Context Selection 更符合长期多用户成长 OS。

当前最重要的缺口是 **学习效果证明与练习反馈闭环**。

下一阶段的正确方向不是扩大 Agent 能力，而是把已有 Context Selection 扩展到：

```text
Learning Mode
 ↓
Practice
 ↓
Evidence
 ↓
Mastery
 ↓
Review
 ↓
New Evidence
```

同时保持：

```text
Data truth
Architecture stability
AI understanding
User control
```
