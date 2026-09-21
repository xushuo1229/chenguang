'use strict';

const express = require('express');
const practiceService = require('../services/studentPracticeService');
const reviewService = require('../services/learningReviewService');
const { authRequired } = require('../middleware/auth');
const { writeLimiter } = require('../middleware/rateLimit');

const router = express.Router();

router.post('/practice/attempts', authRequired, writeLimiter, async (req, res, next) => {
  try {
    const result = await practiceService.recordPracticeAttempt({ userId: req.userId, body: req.body });
    res.status(201).success(result);
  } catch (err) {
    next(err);
  }
});

router.get('/practice/attempts', authRequired, async (req, res, next) => {
  try {
    const result = await practiceService.listPracticeAttempts({
      userId: req.userId,
      query: req.query,
    });
    res.success(result);
  } catch (err) {
    next(err);
  }
});

router.get('/mastery-promotion/:courseId', authRequired, async (req, res, next) => {
  try {
    const result = await reviewService.evaluateMasteryPromotion({
      userId: req.userId,
      courseId: req.params.courseId,
    });
    res.success(result);
  } catch (err) {
    next(err);
  }
});

router.get('/review-queue/:courseId', authRequired, async (req, res, next) => {
  try {
    const result = await reviewService.buildReviewQueue({
      userId: req.userId,
      courseId: req.params.courseId,
    });
    res.success(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
