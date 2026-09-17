'use strict';

const config = require('../config/env');
const { getProvider } = require('./providers');
const ApiError = require('../utils/ApiError');

const PROMPT_VERSION = 'knowledge-extraction-v1';

function extractJson(reply) {
  const text = String(reply || '').trim();
  const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const source = fenced ? fenced[1] : text;
  try {
    return JSON.parse(source);
  } catch (_) {
    throw ApiError.internal('AI_INVALID_RESPONSE', 'AI 提取结果不可用，请稍后再试');
  }
}

async function extract({ document }) {
  const providerName = config.aiProvider;
  const provider = getProvider(providerName);
  if (!provider || !config.aiApiKey) {
    throw ApiError.internal('AI_NOT_CONFIGURED', 'AI 提取服务未配置，请稍后再试');
  }

  const messages = [
    {
      role: 'system',
      content: [
        'You extract course knowledge from a document.',
        'Return only JSON: {"candidates":[{"type":"concept|definition|fact|procedure|formula|example|warning|summary","title":"...","content":"...","confidence":0.0,"evidence":{"locator":"...","excerpt":"..."}}]}.',
        'Use only information in the document data. Do not add facts. Maximum 10 candidates. Confidence must be 0 to 1.',
      ].join(' '),
    },
    {
      role: 'user',
      content: JSON.stringify({ document: { title: document.title, content: document.content, version: document.version }, instruction: 'Extract candidates' }),
    },
  ];

  try {
    const result = await provider.chatCompletion({
      messages,
      maxTokens: 2000,
      temperature: 0.1,
    });
    return {
      provider: providerName,
      model: result.model || config.aiModel,
      payload: extractJson(result.reply),
    };
  } catch (err) {
    if (err && err.name === 'ApiError') throw err;
    throw ApiError.internal('AI_EXTRACTION_FAILED', 'AI 提取服务暂时不可用，请稍后再试');
  }
}

module.exports = { PROMPT_VERSION, extract };
