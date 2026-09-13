'use strict';

const PROD_API_BASE = '/api';
const DEV_API_BASE = __CHENGUANG_DEV_API_BASE__;

function normalizeApiBase(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || !/^(https?:\/\/[^\s]+|\/[^\s]*)$/i.test(trimmed)) return null;
  return trimmed.replace(/\/+$/, '');
}

function readMetaApiBase(documentRef) {
  if (!documentRef || typeof documentRef.querySelector !== 'function') return null;
  const element = documentRef.querySelector('meta[name="api-base"]');
  return normalizeApiBase(element && element.getAttribute('content'));
}

function resolveApiBase(options) {
  const { documentRef, env } = options || {};
  const runtimeEnv = env || (typeof import.meta !== 'undefined' ? import.meta.env : {});
  return readMetaApiBase(documentRef || globalThis.document) ||
    (runtimeEnv && runtimeEnv.PROD ? PROD_API_BASE : DEV_API_BASE);
}

let currentApiBase = resolveApiBase();

function getApiBase() {
  return currentApiBase;
}

function setApiBase(value) {
  const normalized = normalizeApiBase(value);
  if (normalized) currentApiBase = normalized;
}

export {
  DEV_API_BASE,
  PROD_API_BASE,
  getApiBase,
  normalizeApiBase,
  readMetaApiBase,
  resolveApiBase,
  setApiBase
};
