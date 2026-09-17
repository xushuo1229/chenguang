const express = require('express');
const service = require('../services/courseSpaceService');
const extractionService = require('../services/knowledgeExtractionService');
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

router.post('/extraction/jobs', authRequired, writeLimiter, async (req, res, next) => {
  try {
    const job = await extractionService.createJob({ userId: req.userId, body: req.body });
    res.status(201).success(job);
  } catch (err) { next(err); }
});

router.get('/extraction/jobs', authRequired, async (req, res, next) => {
  try {
    res.success(await extractionService.listJobs({ userId: req.userId, query: req.query }));
  } catch (err) { next(err); }
});

router.get('/extraction/jobs/:id', authRequired, async (req, res, next) => {
  try {
    res.success(await extractionService.getJob({ userId: req.userId, jobId: req.params.id }));
  } catch (err) { next(err); }
});

router.post('/extraction/jobs/:id/cancel', authRequired, writeLimiter, async (req, res, next) => {
  try {
    res.success(await extractionService.cancelJob({ userId: req.userId, jobId: req.params.id }));
  } catch (err) { next(err); }
});

router.get('/extraction/candidates', authRequired, async (req, res, next) => {
  try {
    res.success(await extractionService.listCandidates({ userId: req.userId, query: req.query }));
  } catch (err) { next(err); }
});

router.get('/extraction/candidates/:id/evidence', authRequired, async (req, res, next) => {
  try {
    res.success(await extractionService.listCandidateEvidence({ userId: req.userId, candidateId: req.params.id }));
  } catch (err) { next(err); }
});

router.post('/extraction/candidates/:id/review', authRequired, writeLimiter, async (req, res, next) => {
  try {
    res.success(await extractionService.reviewCandidate({ userId: req.userId, candidateId: req.params.id, body: req.body }));
  } catch (err) { next(err); }
});

router.post('/extraction/candidates/:id/accept', authRequired, writeLimiter, async (req, res, next) => {
  try {
    const candidate = await extractionService.reviewCandidate({
      userId: req.userId, candidateId: req.params.id, body: { ...req.body, action: 'accept' },
    });
    res.success(candidate);
  } catch (err) { next(err); }
});

router.post('/extraction/candidates/:id/reject', authRequired, writeLimiter, async (req, res, next) => {
  try {
    res.success(await extractionService.reviewCandidate({ userId: req.userId, candidateId: req.params.id, body: { action: 'reject' } }));
  } catch (err) { next(err); }
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
