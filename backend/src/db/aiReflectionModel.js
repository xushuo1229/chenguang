'use strict';

const { query } = require('./index');

async function createReflection({ reflectionId, userId }) {
  await query(
    `INSERT INTO ai_reflections (reflection_id, user_id)
     VALUES ($1, $2)`,
    [reflectionId, userId]
  );
}

async function findReflectionByOwner({ reflectionId, userId }) {
  const result = await query(
    `SELECT reflection_id, user_id, created_at
       FROM ai_reflections
      WHERE reflection_id = $1 AND user_id = $2`,
    [reflectionId, userId]
  );
  return result.rows[0] || null;
}

async function findFeedbackByOwner({ reflectionId, userId }) {
  const result = await query(
    `SELECT id, user_id, reflection_id, rating, created_at
       FROM ai_reflection_feedback
      WHERE reflection_id = $1 AND user_id = $2`,
    [reflectionId, userId]
  );
  return result.rows[0] || null;
}

async function createFeedback({ reflectionId, userId, rating }) {
  const result = await query(
    `INSERT INTO ai_reflection_feedback (user_id, reflection_id, rating)
     VALUES ($1, $2, $3)`,
    [userId, reflectionId, rating]
  );
  return result.rowCount > 0;
}

module.exports = {
  createFeedback,
  createReflection,
  findFeedbackByOwner,
  findReflectionByOwner,
};
