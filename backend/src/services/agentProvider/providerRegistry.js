/**
 * Zeno · Agent LLM Provider 注册表 (Phase 27.6.3)
 * ============================================================
 * 【职责】
 * 与 services/providers/index.js 同构的注册表模式：
 * - 按名称取适配器；未知名称返回 null（由调用方决定兜底，不在本层抛错）。
 * - 注册时校验适配器形状（name + generateExplanation 函数），坏适配器启动期暴露。
 * - resolveAgentProvider() 读取 config.agentLlmProvider（AGENT_LLM_PROVIDER）。
 *
 * 【边界】
 * 本模块不做配置兜底决策、不做网络调用、不感知业务数据——只做查找与形状校验。
 * ============================================================
 */
'use strict';

const config = require('../../config/env');
const openaiCompatibleProvider = require('./openaiCompatibleProvider');

const REGISTRY = {
  openaiCompatible: openaiCompatibleProvider,
};

/** 校验适配器形状：name 非空字符串 + generateExplanation 为函数 */
function isWellFormedAdapter(adapter) {
  return Boolean(adapter)
    && typeof adapter === 'object'
    && typeof adapter.name === 'string'
    && adapter.name.length > 0
    && typeof adapter.generateExplanation === 'function';
}

Object.keys(REGISTRY).forEach((key) => {
  if (!isWellFormedAdapter(REGISTRY[key])) {
    throw new Error(`AGENT_PROVIDER_ADAPTER_INVALID: ${key}`);
  }
});

/** getAgentProvider(name) —— 按名称取适配器；未知名称返回 null */
function getAgentProvider(name) {
  if (typeof name !== 'string' || !name) return null;
  return Object.prototype.hasOwnProperty.call(REGISTRY, name) ? REGISTRY[name] : null;
}

/** resolveAgentProvider() —— 按配置选择适配器；未配置/未知/形状非法 → null */
function resolveAgentProvider() {
  const name = (config && config.agentLlmProvider) || 'openaiCompatible';
  const adapter = getAgentProvider(name);
  return adapter && isWellFormedAdapter(adapter) ? adapter : null;
}

module.exports = { REGISTRY, getAgentProvider, resolveAgentProvider };
