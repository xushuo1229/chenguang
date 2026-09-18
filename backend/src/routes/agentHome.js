'use strict';

const express = require('express');
const service = require('../services/agentHomeService');
const insightService = require('../services/agentInsightService');
const reasoningEngine = require('../services/agentReasoning/reasoningEngine');
const { authRequired } = require('../middleware/auth');

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

module.exports = router;
