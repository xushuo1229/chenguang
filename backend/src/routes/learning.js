'use strict';

const express = require('express');
const practiceService = require('../services/studentPracticeService');
const reviewService = require('../services/learningReviewService');
const assessmentService = require('../services/learningAssessmentService');
const adaptiveReviewService = require('../services/adaptiveReviewService');
const plannerService = require('../services/learningPlannerService');
const actionService = require('../services/learningActionService');
const personalLearningAgentService = require('../services/personalLearningAgentService');
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

router.get('/assessment/:courseId/:knowledgeNodeId', authRequired, async (req, res, next) => {
  try {
    const result = await assessmentService.buildAssessment({
      userId: req.userId,
      courseId: req.params.courseId,
      knowledgeNodeId: req.params.knowledgeNodeId,
    });
    res.success(result);
  } catch (err) {
    next(err);
  }
});

router.post('/assessment/attempts', authRequired, writeLimiter, async (req, res, next) => {
  try {
    const result = await assessmentService.recordAssessment({ userId: req.userId, body: req.body });
    res.status(201).success(result);
  } catch (err) {
    next(err);
  }
});

router.get('/assessment/attempts', authRequired, async (req, res, next) => {
  try {
    res.success(await assessmentService.listAssessmentAttempts({
      userId: req.userId,
      query: req.query,
    }));
  } catch (err) {
    next(err);
  }
});

router.get('/adaptive-review/:courseId', authRequired, async (req, res, next) => {
  try {
    res.success(await adaptiveReviewService.buildAdaptiveReview({
      userId: req.userId,
      courseId: req.params.courseId,
      query: req.query,
    }));
  } catch (err) {
    next(err);
  }
});

router.get('/planner/:courseId', authRequired, async (req, res, next) => {
  try {
    res.success(await plannerService.buildLearningPlan({
      userId: req.userId,
      courseId: req.params.courseId,
      query: req.query,
    }));
  } catch (err) {
    next(err);
  }
});

router.post('/actions/confirm', authRequired, writeLimiter, async (req, res, next) => {
  try {
    const result = await actionService.confirmProposal({ userId: req.userId, body: req.body });
    res.success(result);
  } catch (err) {
    next(err);
  }
});

router.post('/actions/:proposalId/complete', authRequired, writeLimiter, async (req, res, next) => {
  try {
    const result = await actionService.completeProposal({
      userId: req.userId,
      proposalId: req.params.proposalId,
      body: req.body,
    });
    res.success(result);
  } catch (err) {
    next(err);
  }
});

router.get('/actions', authRequired, async (req, res, next) => {
  try {
    res.success(await actionService.listProposals({
      userId: req.userId,
      query: req.query,
    }));
  } catch (err) {
    next(err);
  }
});

router.get('/agent/:courseId/overview', authRequired, async (req, res, next) => {
  try {
    res.success(await personalLearningAgentService.buildOverview({
      userId: req.userId,
      courseId: req.params.courseId,
      query: req.query,
    }));
  } catch (err) {
    next(err);
  }
});

router.post('/agent/:courseId/next-action', authRequired, writeLimiter, async (req, res, next) => {
  try {
    res.success(await personalLearningAgentService.confirmNextAction({
      userId: req.userId,
      courseId: req.params.courseId,
      body: req.body,
    }));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
