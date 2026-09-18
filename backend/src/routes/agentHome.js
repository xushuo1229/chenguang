'use strict';

const express = require('express');
const service = require('../services/agentHomeService');
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

module.exports = router;
