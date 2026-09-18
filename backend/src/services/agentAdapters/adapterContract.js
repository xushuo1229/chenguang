'use strict';

const ADAPTER_VERSION = 'adapter-v1';
const MAX_TEXT = 160;

function boundedText(value, maxLength = MAX_TEXT) {
  if (value == null) return '';
  return String(value)
    .split('')
    .filter((character) => {
      const charCode = character.charCodeAt(0);
      return charCode >= 32 && charCode !== 127;
    })
    .join('')
    .trim()
    .slice(0, maxLength);
}

function boundedNumber(value, max = 1000000) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.min(parsed, max);
}

function boundedConfidence(value, fallback = 1) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) return fallback;
  return parsed;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function createAdapter({
  adapter,
  source,
  authority,
  type,
  data,
  confidence = 1,
}) {
  return {
    adapter,
    version: ADAPTER_VERSION,
    source,
    authority,
    type,
    data,
    confidence: boundedConfidence(confidence),
    readOnly: true,
  };
}

module.exports = {
  ADAPTER_VERSION,
  asArray,
  boundedConfidence,
  boundedNumber,
  boundedText,
  createAdapter,
};
