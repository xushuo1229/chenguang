# Phase 27.6.5 Prompt Template Contract 架构文档

状态：FROZEN（2026-09-19，独立 Re-Audit READY_TO_FREEZE，见 PHASE_27_6_5_PROMPT_TEMPLATE_CONTRACT_INDEPENDENT_REAUDIT.md）
日期：2026-09-19
前置：27.6.3 LLM Provider Abstraction（FROZEN, a927aaa）、27.6.4 LLM Runtime Gateway（FROZEN, 7485352）

---

## 0. Phase 定位与范围

### 0.1 定位

27.6.3 适配器（openaiCompatibleProvider.buildProviderMessages）把 Prompt 以内联数组硬编码在
适配器内部。Prompt 是 LLM 行为的唯一确定性控制面，却是当前链路中唯一"不可独立审计、
不可独立演进、不可契约化校验"的构件。本 Phase 将其收编为**版本化、注册时校验、注册后
不可变**的模板契约模块，适配器改为消费注册表。

### 0.2 交付范围

1. 新模块 `backend/src/services/agentPrompt/`：
   - `promptTemplateContract.js` —— 模板契约校验（结构/必含语义段/禁令扫描/敏感扫描）
   - `promptTemplates.js` —— v1 模板定义（从适配器**逐字迁移**，字节等价）
   - `promptRegistry.js` —— 注册表 + 活动版本解析 + 启动期 fail-fast
2. `backend/src/config/env.js` 追加 `AGENT_LLM_PROMPT_VERSION`（默认
   `agent-llm-provider-prompt-v1`，additive）。
3. `openaiCompatibleProvider.buildProviderMessages` 改为委托注册表（输出**字节等价**，
   纯重构）；`agentProvider.test.js` 依赖白名单相应追加。
4. `backend/test/agentPrompt.test.js` 新测试文件。
5. **零改动**冻结面：providerContract（信封工厂签名与 promptVersion 取值不变）、
   gateway 三模块、firewall、三 Validator、路由层全部不动。

### 0.3 非目标（Non-Goals）

- 不做多任务模板路由（contextContract.TASKS 共用一个模板 v1；多模板属后续 Phase）。
- 不做 Prompt A/B、i18n 变体、few-shot 库、动态 few-shot 注入。
- 不把信封 promptVersion 改为动态流（见 §4.3 一致性锁）。
- 不实现 27.7 的上下文选择/查询理解（Prompt 模板只消费防火墙投影 payload）。

## 1. 边界与不变量

### 1.1 模板能力边界（铁律）

1. 模板唯一可变输入是 `payload`（防火墙投影对象）；`buildMessages(payload)` 不得读取
   payload 之外的任何数据源（无 config、无 DB、无 env、无时间、无随机）。
2. User 消息必须是且仅是 `JSON.stringify(payload)`——模板不得夹带/改写/增强 payload。
3. **System 段封闭性（审计 High-1 新增）**：system content 必须与 payload 无关——以两个
   互不相同的非平凡 payload（及 {} 冒烟）调用 buildMessages，三次 system content 字节恒等；
   每次调用后 payload 必须深比较不变（禁止变异，变异会同时破坏下游 evidence binding
   快照比对）。违反任一 → PROMPT_TEMPLATE_NOT_CLOSED。
4. 模板文本不得包含：工具调用指令（tools/tooling/function call/execute 类/executable/code
   interpreter）、检索指令（web search/retriev 类）、写操作指令（memory write 类/write to
   类）、Planner/自治行动词汇（planner 类/autonomous）——注册时禁令扫描强制。
5. 模板文本不得包含敏感键模式（jwt/authtoken/accesstoken/token/apikey/api_key/password/
   secret/credential/cookie/authorization/sessionid）。**扫描语义**：对拼接后的模板文本做
   大小写不敏感的正则扫描（防火墙 containsSensitiveKey 是对象键扫描，对纯字符串是
   no-op，禁用于文本扫描）。
6. 模板必须显式陈述五段语义（注册时必含段校验强制，字面正则即 v1 自检基准）：

| # | 语义段 | 字面正则 |
|---|---|---|
| 1 | 角色边界 | /read-only/ 且 /insight_only/ |
| 2 | 输出 Schema | /agent-llm-output-v1/ |
| 3 | 证据锚定 | /Never invent references/ |
| 4 | 输出界限 | /<=240/ |
| 5 | 纯 JSON 指令 | /Output JSON only/ |

### 1.2 核心链路（不变）

DATA→FACT→INSIGHT→EVIDENCE→REASONING→**[Prompt Template v1]**→Provider→VALIDATOR→USER。
本 Phase 不改变链路顺序、不新增信封字段、不新增路由、不新增任何 LLM 调用点。

## 2. 模板契约（promptTemplateContract.js）

### 2.1 模板对象形状

```text
{ version: 'agent-llm-provider-prompt-v1', buildMessages: (payload) => [{role:'system',content},{role:'user',content}] }
```

仅此两个字段；多余字段注册时拒绝。

### 2.2 校验规则（validatePromptTemplate，注册时执行，任一失败抛 400）

| # | 规则 | 失败码 |
|---|---|---|
| 1 | isObject 且字段集恰为 {version, buildMessages} | PROMPT_TEMPLATE_INVALID |
| 2 | version 匹配 /^agent-llm-provider-prompt-v\d+$/ | PROMPT_TEMPLATE_VERSION_INVALID |
| 3 | buildMessages 为函数；以 {} 冒烟调用返回长度 2 的数组，roles 为 system/user，user content === JSON.stringify({}) | PROMPT_TEMPLATE_INVALID |
| 4 | system content 五段必含语义（§1.1.6 字面正则表） | PROMPT_TEMPLATE_MISSING_SECTION |
| 5 | system content 禁令扫描（§2.3）无命中 | PROMPT_TEMPLATE_FORBIDDEN_INSTRUCTION |
| 6 | system content + version 敏感键扫描（§1.1.5 文本正则）无命中 | PROMPT_TEMPLATE_SENSITIVE |
| 7 | §1.1.3 System 段封闭性：双 payload 探针 system 字节恒等 + payload 深比较非变异 | PROMPT_TEMPLATE_NOT_CLOSED |
| 8 | 校验通过后 Object.freeze(template) | — |

执行序注记（Re-Audit Low-2）：实现按 形状(1)→版本(2)→封闭性(3+7 合并于 checkClosedness，
冒烟 user-content 不匹配亦归 NOT_CLOSED)→五段(4)→禁令(5)→敏感(6)→freeze(8) 顺序短路
执行；多违例模板以先触发者为准，八条规则均强制、freeze 殿后。

### 2.3 禁令扫描正则（forbidden，best-effort 词形覆盖，新增词形随版本演进补充）

```text
/\b(?:tools?|tooling|function[-_ ]?call\w*|execut\w*|code[-_ ]?interpreter|web[-_ ]?search\w*|retriev\w*|planner\w*|autonomous|memory[-_ ]?writ\w*|writ\w*[-_ ]?to)\b/i
```

（v1 现文已逐字核对 0 命中；"code fence" 不匹配 "code[-_ ]?interpreter"。探针核实的
词形缺口 writes to/memory writes/retrievals/planners/tooling/executable 已由 \w* 词形
扩展覆盖。）

## 3. 注册表（promptRegistry.js）

```text
REGISTRY（模块内 Map）
registerPromptTemplate(t)   → validatePromptTemplate → 版本查重 → 冻结注册
模块加载时：注册 v1 → ACTIVE = config.agentLlmPromptVersion
            → 若 !REGISTRY[ACTIVE] 抛 AGENT_PROMPT_ACTIVE_UNRESOLVED（加载期 fail-fast；
              坏配置不允许通过）。触发时机注记：当前布线无路由消费方，实际触发点是
              链路模块（provider/gateway）首次 require 时；27.7 接线路由后即服务
              启动期。
getPromptTemplate(version)  → REGISTRY[version] || null
resolveActivePromptTemplate() → REGISTRY[ACTIVE]（加载期已验证，必存在）
buildActiveMessages(payload)  → resolveActivePromptTemplate().buildMessages(payload)
```

**REGISTRY 容器模块私有，不导出**（审计 Low-7；导出可变容器可绕过查重与 freeze
直接覆盖活动版本——勿复制 27.6.3 providerRegistry 导出 REGISTRY 的先例）。

### 3.1 版本演进规则

- 新版本 = 新模板对象注册（注册时全量校验）+ env 切换 ACTIVE + 重启生效。
- 已注册版本**不可覆盖**（重复版本抛 PROMPT_TEMPLATE_DUPLICATE）——版本即不可变承诺。
- 模板措辞演进必须 bump 版本号；v1 与 27.6.3 内联 Prompt 字节等价，故版本号保持 v1。

### 3.2 依赖白名单（静态扫描测试强制）

promptTemplateContract → 无依赖；promptTemplates → 无依赖；
promptRegistry → ./promptTemplateContract、./promptTemplates、../../config/env。
（禁 db/sqlite/store/sync/repository/memory 等，测试同 27.6.4 §6 模式。）

## 4. 适配器集成（openaiCompatibleProvider.js）

### 4.1 重构（纯委托，行为保持）

```js
const promptRegistry = require('../agentPrompt/promptRegistry');
function buildProviderMessages(payload) {
  return promptRegistry.buildActiveMessages(payload);   // 字节等价于原内联实现
}
```

- `generateExplanation` 调用点不变；导出签名不变（27.6.3 测试 determinism/no-sensitive
  直接继续通过）。
- `agentProvider.test.js` 依赖白名单追加 `../agentPrompt/promptRegistry`。

### 4.2 为什么必须字节等价（golden 字节基线，审计 High-2）

27.6.4 冻结的 Gateway/Validator 链路对 Prompt 的语义输出有隐式依赖（schema 指令、
fallback 指令、上限数字）。迁移前内联 System 文本（openaiCompatibleProvider.js L49-67）
硬编码为 **golden 字节串**保留在测试中（**永久保留，不随重构删除**），同时断言：
adapter 输出 === registry 输出 === golden。由此"字节等价迁移"与"措辞演进必须 bump 版本、
不得原位改 v1"（§3.1）获得机械强制——任何 v1 文本漂移都会击穿 golden 断言。

### 4.3 信封 promptVersion（一致性锁）

providerContract 信封工厂继续取 PROVIDER_PROMPT_VERSION 常量（冻结面零改动）。由于
当前注册表仅有 v1 且 v1.version === PROVIDER_PROMPT_VERSION === env 默认值，三者恒等。
测试加一致性锁；未来 v2 落地时才允许为信封工厂加可选 promptVersion 参数（additive）。

## 5. 安全边界汇总

1. 模板注册时禁令扫描 + 敏感扫描（§2.2）——Prompt 成为被审计的契约构件。
2. payload 封闭性（§1.1.1-1.1.3）——模板不能成为数据外泄或注入的旁路。
3. 注册后 Object.freeze + 重复版本拒绝——防运行时篡改 Prompt。
4. 启动期 fail-fast——活动版本缺失即刻暴露，而非首次 LLM 调用时。
5. 无新增网络/文件/DB 访问面。

## 6. 测试计划（backend/test/agentPrompt.test.js，9 组）

1. 契约校验：坏版本格式 / 缺必含段 / 含禁令 / buildMessages 形状非法 / 含敏感词 /
   重复注册 / **payload 插值进 system（封闭性破坏）** / **变异 payload** → 对应错误码。
2. 注册表：v1 已注册且冻结；未知版本 → null；active 解析为 v1；同一冻结对象。
3. 确定性与 payload 封闭性：同 payload 两次调用字节相等；user content ===
   JSON.stringify(payload)；**两个不同 payload → system content 彼此字节恒等且与 {}
   冒烟输出恒等；调用后 payload 深比较不变（非变异）**。
4. 不可变性：Object.isFrozen(template)；严格模式赋值抛 TypeError。
5. 适配器集成 + **golden 字节基线（永久保留）**：迁移前内联 System 文本硬编码为
   golden，断言 adapter 输出 === registry 输出 === golden；27.6.3 既有 adapter 测试
   全绿（回归）。
6. 一致性锁：PROVIDER_PROMPT_VERSION === active template version === env 默认值。
7. 静态依赖白名单扫描 agentPrompt 三模块。
8. 配置：config.agentLlmPromptVersion 默认值存在且为 v1。
9. **fail-fast**：清 require.cache + 覆写 AGENT_LLM_PROMPT_VERSION 为未知版本 →
   重新 require promptRegistry 抛 AGENT_PROMPT_ACTIVE_UNRESOLVED（finally 恢复 env
   与缓存）。**require.cache 失效集必须包含 ../../config/env**——env 在模块加载时
   读取 process.env，若只清 promptRegistry 不清 env，覆写不会被观察到（假绿）。

## 7. 风险

| # | 风险 | 缓解 |
|---|---|---|
| 1 | 迁移非字节等价导致 LLM 行为漂移 | 逐字迁移 + **golden 字节基线**（adapter/registry/golden 三方相等，永久保留）+ 全量回归 |
| 2 | 禁令/必含段正则过宽误伤未来合法模板 | 正则表集中于契约模块并文档化；v1 已逐字核对通过 |
| 3 | 冻结面意外变动 | git diff 审查仅 3 个新文件 + env 1 行 + adapter 纯委托 + 测试白名单 1 行 |
| 4 | env 配错版本导致启动失败 | 预期行为（fail-fast），文档 §3.1 明示 |

## 8. 验收标准

- 9 组测试全绿；后端全量（211 基线 + 新增）全绿；前端 609 不动全绿；build PASS。
- **golden 字节基线断言通过**（adapter ≡ registry ≡ 迁移前内联文本，永久保留）。
- adapter 与注册表输出字节相等（确定性、无敏感键回归全过）。
- git diff 范围与 §0.2 完全一致；无路由/写路径/冻结面改动。
- 双视口浏览器回归零异常（后端-only 变更，回归确认）。
