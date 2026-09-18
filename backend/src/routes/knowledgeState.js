'use strict';

const express = require('express');
const service = require('../services/studentKnowledgeStateService');
const { authRequired } = require('../middleware/auth');

const router = express.Router();

router.get('/course/:courseId', authRequired, async (req, res, next) => {
  try {
    const result = await service.listCourseStates({
      userId: req.userId,
      courseId: req.params.courseId,
      query: req.query,
    });
    res.success(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
