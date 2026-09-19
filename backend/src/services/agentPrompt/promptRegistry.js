/**
 * 知行 · Agent Prompt Registry (Phase 27.6.5)
 * ============================================================
 * 【职责】
 * Prompt 模板注册表（docs/PHASE_27_6_5 §3）：
 *   - 注册：validatePromptTemplate 全量校验 → 版本查重 → 冻结入表（版本不可覆盖）
 *   - 活动版本：config.agentLlmPromptVersion，模块加载期固化
 *   - fail-fast：活动版本未注册 → 加载即抛 AGENT_PROMPT_ACTIVE_UNRESOLVED
 *     （当前布线实际触发点是链路模块首次 require；27.7 接线路由后即服务启动期）
 *
 * 【边界】
 * REGISTRY 容器模块私有，不导出（导出可变容器可绕过查重与 freeze 直接覆盖活动版本）。
 * 无 IO、无 DB；唯一依赖是 config/env 与同族契约模块。
 * ============================================================
 */
'use strict';

const config = require('../../config/env');
const { validatePromptTemplate } = require('./promptTemplateContract');
const { AGENT_LLM_PROVIDER_PROMPT_V1 } = require('./promptTemplates');

const REGISTRY = new Map();

function registerPromptTemplate(template) {
  const frozen = validatePromptTemplate(template);
  if (REGISTRY.has(frozen.version)) {
    const error = new Error('PROMPT_TEMPLATE_DUPLICATE');
    error.code = 'PROMPT_TEMPLATE_DUPLICATE';
    error.statusCode = 400;
    throw error;
  }
  REGISTRY.set(frozen.version, frozen);
  return frozen;
}

registerPromptTemplate(AGENT_LLM_PROVIDER_PROMPT_V1);

const ACTIVE_PROMPT_VERSION = config.agentLlmPromptVersion;

if (!REGISTRY.has(ACTIVE_PROMPT_VERSION)) {
  const error = new Error('AGENT_PROMPT_ACTIVE_UNRESOLVED');
  error.code = 'AGENT_PROMPT_ACTIVE_UNRESOLVED';
  error.statusCode = 500;
  throw error;
}

function getPromptTemplate(version) {
  return REGISTRY.get(version) || null;
}

function resolveActivePromptTemplate() {
  return REGISTRY.get(ACTIVE_PROMPT_VERSION);
}

function buildActiveMessages(payload) {
  return resolveActivePromptTemplate().buildMessages(payload);
}

module.exports = { registerPromptTemplate, getPromptTemplate, resolveActivePromptTemplate, buildActiveMessages };
