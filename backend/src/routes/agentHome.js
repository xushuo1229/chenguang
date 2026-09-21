'use strict';

const express = require('express');
const service = require('../services/agentHomeService');
const insightService = require('../services/agentInsightService');
const reasoningEngine = require('../services/agentReasoning/reasoningEngine');
const conversationRuntime = require('../services/agentLearningConversation/learningConversationRuntime');
const { authRequired } = require('../middleware/auth');
const { aiLimiter } = require('../middleware/rateLimit');

const router = express.Router();

router.get('/context', authRequired, async (req, res, next) => {
  try {
    const result = await service.buildAgentHomeContext({ userId: req.userId });
    res.success(result);
  } catch (err) {
    next(err);
  }
});

router.get('/insights', authRequired, async (req, res, next) => {
  try {
    const context = await service.buildAgentHomeContext({ userId: req.userId });
    const result = insightService.buildInsights(context);
    res.success(result);
  } catch (err) {
    next(err);
  }
});

router.get('/reasoning', authRequired, async (req, res, next) => {
  try {
    const context = await service.buildAgentHomeContext({ userId: req.userId });
    const insights = insightService.buildInsights(context);
    const result = reasoningEngine.buildReasoning({ context, insights });
    res.success(result);
  } catch (err) {
    next(err);
  }
});

router.post('/learning-conversation', authRequired, aiLimiter, async (req, res, next) => {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const result = await conversationRuntime.runLearningConversation({
      userId: req.userId,
      query: body.query,
      currentCourseLabel: body.currentCourseLabel,
    });
    res.success(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
