const express = require('express');
const service = require('../services/courseSpaceService');
const { authRequired } = require('../middleware/auth');
const { writeLimiter } = require('../middleware/rateLimit');

const router = express.Router();

router.get('/', authRequired, async (req, res, next) => {
  try {
    const result = await service.getCourseSpace({ userId: req.userId, courseId: req.query.courseId });
    res.success(result);
  } catch (err) {
    next(err);
  }
});

router.get('/search', authRequired, async (req, res, next) => {
  try {
    const result = await service.search({
      userId: req.userId,
      query: req.query.q,
      courseId: req.query.courseId,
      limit: req.query.limit,
    });
    res.success(result);
  } catch (err) {
    next(err);
  }
});

router.post('/documents', authRequired, writeLimiter, async (req, res, next) => {
  try {
    const document = await service.createDocument({ userId: req.userId, body: req.body });
    res.status(201).success(document);
  } catch (err) {
    next(err);
  }
});

router.post('/nodes', authRequired, writeLimiter, async (req, res, next) => {
  try {
    const node = await service.createNode({ userId: req.userId, body: req.body });
    res.status(201).success(node);
  } catch (err) {
    next(err);
  }
});

router.post('/relations', authRequired, writeLimiter, async (req, res, next) => {
  try {
    const relation = await service.createRelation({ userId: req.userId, body: req.body });
    res.status(201).success(relation);
  } catch (err) {
    next(err);
  }
});

router.post('/evidence', authRequired, writeLimiter, async (req, res, next) => {
  try {
    const evidence = await service.createEvidence({ userId: req.userId, body: req.body });
    res.status(201).success(evidence);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
