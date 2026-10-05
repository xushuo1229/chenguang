'use strict';

const router = require('express').Router();
const { authRequired, adminRequired } = require('../middleware/auth');
const userModel = require('../db/userModel');

// 所有 /api/admin/* 仅管理员可访问（只读用户列表，供后台管理）
router.get('/users', authRequired, adminRequired, async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const [users, total] = await Promise.all([
      userModel.listUsersAdmin({ limit, offset }),
      userModel.countUsers(),
    ]);
    res.json({ users, total, limit, offset });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
