'use strict';

const crypto = require('node:crypto');
const ApiError = require('../utils/ApiError');
const model = require('../db/aiReflectionModel');

const ALLOWED_RATINGS = new Set(['helpful', 'not_helpful']);
const REFLECTION_ID_PATTERN = /^rf_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REFLECTION_ID_LENGTH = 39;

function createReflectionId() {
  return `rf_${crypto.randomUUID()}`;
}

function requireAuthenticatedUser(userId) {
  const parsed = Number(userId);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw ApiError.unauthorized('UNAUTHORIZED', '请先登录');
  }
  return parsed;
}

function validateReflectionId(reflectionId) {
  if (typeof reflectionId !== 'string' ||
      reflectionId.length !== REFLECTION_ID_LENGTH ||
      !REFLECTION_ID_PATTERN.test(reflectionId)) {
    throw ApiError.badRequest('INVALID_REFLECTION_ID', 'Reflection ID 格式不正确');
  }
  return reflectionId.toLowerCase();
}

async function recordReflectionGeneration(userId) {
  const owner = requireAuthenticatedUser(userId);
  const reflectionId = createReflectionId();
  await model.createReflection({ reflectionId, userId: owner });
  return reflectionId;
}

async function submitReflectionFeedback({ userId, reflectionId, rating }) {
  const owner = requireAuthenticatedUser(userId);
  const validReflectionId = validateReflectionId(reflectionId);
  if (!ALLOWED_RATINGS.has(rating)) {
    throw ApiError.badRequest('INVALID_RATING', '反馈类型不正确');
  }

  const reflection = await model.findReflectionByOwner({
    reflectionId: validReflectionId,
    userId: owner,
  });
  if (!reflection) {
    throw ApiError.forbidden('REFLECTION_FORBIDDEN', '无权反馈这条 Reflection');
  }

  const existing = await model.findFeedbackByOwner({
    reflectionId: validReflectionId,
    userId: owner,
  });
  if (existing) {
    return { success: true };
  }

  await model.createFeedback({
    reflectionId: validReflectionId,
    userId: owner,
    rating,
  });
  return { success: true };
}

module.exports = {
  ALLOWED_RATINGS,
  createReflectionId,
  recordReflectionGeneration,
  submitReflectionFeedback,
};
