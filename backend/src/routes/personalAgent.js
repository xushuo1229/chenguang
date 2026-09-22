'use strict';

const express = require('express');
const runtime = require('../services/personalAgentRuntime');
const { authRequired } = require('../middleware/auth');
const { aiLimiter } = require('../middleware/rateLimit');

const router = express.Router();

router.get('/context', authRequired, async (req, res, next) => {
  try {
    res.success(await runtime.buildDisplayContext({ userId: req.userId }));
  } catch (err) {
    next(err);
  }
});

router.post('/chat', authRequired, aiLimiter, async (req, res, next) => {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    res.success(await runtime.chat({
      userId: req.userId,
      message: body.message,
      mode: body.mode,
      conversationId: body.conversationId,
    }));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
