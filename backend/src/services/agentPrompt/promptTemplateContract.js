/**
 * Zeno · Agent Prompt Template Contract (Phase 27.6.5)
 * ============================================================
 * 【职责】
 * Prompt 模板的注册期契约校验（docs/PHASE_27_6_5 §2）：
 *   形状 → 版本格式 → System 段封闭性（payload 无关 + 非变异）
 *   → 五段必含语义 → 禁令扫描 → 敏感扫描 → Object.freeze
 *
 * 【边界】
 * 纯校验模块；无依赖、无 IO、无状态。校验通过返回冻结后的模板副本。
 * ============================================================
 */
'use strict';

const PROMPT_TEMPLATE_VERSION_PATTERN = /^agent-llm-provider-prompt-v\d+$/;
const TEMPLATE_FIELDS = new Set(['version', 'buildMessages']);

// 五段必含语义（§1.1.6 字面正则 = v1 自检基准）
const REQUIRED_SECTIONS = [
  { id: 'ROLE_BOUNDARY_READONLY', pattern: /read-only/ },
  { id: 'ROLE_BOUNDARY_INSIGHT_ONLY', pattern: /insight_only/ },
  { id: 'OUTPUT_SCHEMA', pattern: /agent-llm-output-v1/ },
  { id: 'GROUNDED_REFERENCES', pattern: /Never invent references/ },
  { id: 'BOUNDED_OUTPUT', pattern: /<=240/ },
  { id: 'JSON_ONLY', pattern: /Output JSON only/ },
];

// 禁令扫描（§2.3，best-effort 词形覆盖，新增词形随版本演进补充）
const FORBIDDEN_PATTERN = /\b(?:tools?|tooling|function[-_ ]?call\w*|execut\w*|code[-_ ]?interpreter|web[-_ ]?search\w*|retriev\w*|planner\w*|autonomous|memory[-_ ]?writ\w*|writ\w*[-_ ]?to)\b/i;

// 敏感键文本扫描（§1.1.5：大小写不敏感文本正则；
// 禁用防火墙 containsSensitiveKey —— 对象键扫描对纯字符串是 no-op）
const SENSITIVE_TEXT_PATTERN = /(?:jwt|authtoken|accesstoken|token|api[_-]?key|password|secret|credential|cookie|authorization|sessionid)/i;

function promptContractError(code) {
  const error = new Error(code);
  error.code = code;
  error.statusCode = 400;
  return error;
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** 双互异非平凡探针 payload（校验器自造，非用户数据） */
function probePayloads() {
  return [
    { probe: 'alpha', nested: { marker: 'A', values: [1, 2, 3] } },
    { probe: 'beta', nested: { marker: 'B', values: [4, 5, 6] } },
  ];
}

function systemContentOf(messages) {
  if (!Array.isArray(messages) || messages.length !== 2) return null;
  const [system, user] = messages;
  if (!system || system.role !== 'system' || typeof system.content !== 'string') return null;
  if (!user || user.role !== 'user' || typeof user.content !== 'string') return null;
  return system.content;
}

/**
 * System 段封闭性（§1.1.3，规则 7）：
 * - 双 payload 探针 + {} 冒烟：三次 system content 字节恒等；
 * - 每次调用后 payload 深比较不变（禁止变异）；
 * - user content === JSON.stringify(payload)（payload 封闭，§1.1.2）。
 * 返回 {} 冒烟的 system content；任一违反抛 PROMPT_TEMPLATE_NOT_CLOSED / PROMPT_TEMPLATE_INVALID。
 */
function checkClosedness(buildMessages) {
  const smoke = buildMessages({});
  const smokeSystem = systemContentOf(smoke);
  if (smokeSystem === null) throw promptContractError('PROMPT_TEMPLATE_INVALID');
  if (smoke[1].content !== JSON.stringify({})) throw promptContractError('PROMPT_TEMPLATE_NOT_CLOSED');

  for (const payload of probePayloads()) {
    const before = JSON.stringify(payload);
    const messages = buildMessages(payload);
    const system = systemContentOf(messages);
    if (system === null) throw promptContractError('PROMPT_TEMPLATE_INVALID');
    if (system !== smokeSystem) throw promptContractError('PROMPT_TEMPLATE_NOT_CLOSED');
    if (messages[1].content !== JSON.stringify(payload)) throw promptContractError('PROMPT_TEMPLATE_NOT_CLOSED');
    if (JSON.stringify(payload) !== before) throw promptContractError('PROMPT_TEMPLATE_NOT_CLOSED');
  }
  return smokeSystem;
}

/**
 * 注册期契约校验。通过 → 返回冻结模板副本 {version, buildMessages}。
 */
function validatePromptTemplate(template) {
  if (!isObject(template) || typeof template.buildMessages !== 'function') throw promptContractError('PROMPT_TEMPLATE_INVALID');
  const keys = Object.keys(template);
  if (keys.length !== TEMPLATE_FIELDS.size || !keys.every((key) => TEMPLATE_FIELDS.has(key))) {
    throw promptContractError('PROMPT_TEMPLATE_INVALID');
  }
  if (typeof template.version !== 'string' || !PROMPT_TEMPLATE_VERSION_PATTERN.test(template.version)) {
    throw promptContractError('PROMPT_TEMPLATE_VERSION_INVALID');
  }

  const smokeSystem = checkClosedness(template.buildMessages);

  const missing = REQUIRED_SECTIONS.filter((section) => !section.pattern.test(smokeSystem)).map((section) => section.id);
  if (missing.length) throw promptContractError('PROMPT_TEMPLATE_MISSING_SECTION');
  if (FORBIDDEN_PATTERN.test(smokeSystem)) throw promptContractError('PROMPT_TEMPLATE_FORBIDDEN_INSTRUCTION');
  if (SENSITIVE_TEXT_PATTERN.test(smokeSystem) || SENSITIVE_TEXT_PATTERN.test(template.version)) {
    throw promptContractError('PROMPT_TEMPLATE_SENSITIVE');
  }

  return Object.freeze({ version: template.version, buildMessages: template.buildMessages });
}

module.exports = { validatePromptTemplate, PROMPT_TEMPLATE_VERSION_PATTERN, REQUIRED_SECTIONS, FORBIDDEN_PATTERN, SENSITIVE_TEXT_PATTERN };
