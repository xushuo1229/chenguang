/**
 * 晨光自律台 · Provider Adapter 注册表
 * ============================================================
 * Phase 13 第一版只有 openaiCompatible（DeepSeek 走此协议）。
 * 以后接入新 Provider：在本目录新增适配器并注册进 REGISTRY，
 * 通过环境变量 AI_PROVIDER 切换，aiService / 路由层零改动。
 * ============================================================
 */
'use strict';

const openaiCompatible = require('./openaiCompatible');

const REGISTRY = {
  openaiCompatible: openaiCompatible,
};

/** getProvider(name) —— 按名称取适配器；未知名称返回 null（调用方给友好错误） */
function getProvider(name) {
  return Object.prototype.hasOwnProperty.call(REGISTRY, name) ? REGISTRY[name] : null;
}

module.exports = { getProvider, REGISTRY };
