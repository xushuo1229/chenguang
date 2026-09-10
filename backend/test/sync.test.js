/**
 * 晨光自律台 · syncService 单元测试（单快照表）
 * ============================================================
 * 覆盖：空用户拉取空结构、全量模式清洗未知字段、全量覆盖、增量 partial 合并、
 * 非法输入拒绝。
 * 运行：cd backend && NODE_ENV=test node --test test/sync.test.js
 */
'use strict';

require('./setup'); // 先初始化临时库环境
const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const authService = require('../src/services/authService');
const syncService = require('../src/services/syncService');

// 需要一个真实存在的 userId（user_data.user_id 有 FK REFERENCES users）
let userId;
before(async () => {
  const { user } = await authService.register({
    email: 'sync@chenguang.com',
    password: 'Abc123456',
  });
  userId = user.id;
  assert.ok(userId);
});

describe('syncService.getData', () => {
  test('无记录用户返回默认空结构', async () => {
    const data = await syncService.getData(userId);
    assert.equal(data.user.name, '');
    for (const k of ['checkins', 'sports', 'readings', 'courses', 'english', 'todos', 'focus']) {
      assert.ok(Array.isArray(data[k]));
      assert.equal(data[k].length, 0);
    }
  });
});

describe('syncService.saveData（全量模式）', () => {
  test('清洗未知字段，只保留白名单键', async () => {
    const saved = await syncService.saveData(userId, {
      user: { name: '张三', totalDays: 3 },
      courses: [{ id: 'c1', name: '高数', progress: 50 }],
      hacker: 'should-be-stripped', // 未知字段
    });
    assert.equal(saved.hacker, undefined);
    assert.equal(saved.user.name, '张三');
    assert.equal(saved.courses.length, 1);
    // 回读确认已持久化且仍是清洗后的结构
    const got = await syncService.getData(userId);
    assert.equal(got.hacker, undefined);
    assert.equal(got.courses[0].name, '高数');
  });

  test('全量覆盖：第二次保存只留白名单内的数据', async () => {
    await syncService.saveData(userId, { checkins: [{ date: '2026-09-09', status: 'done' }] });
    const got = await syncService.getData(userId);
    assert.equal(got.courses.length, 0);   // 上个测试的 courses 被覆盖清除
    assert.equal(got.checkins.length, 1);  // 只剩本次写入的集合
  });
});

describe('syncService.saveData（partial 增量模式）', () => {
  test('只合并传入集合，未提及集合保持不变，user 深合并', async () => {
    await syncService.saveData(userId, {
      courses: [{ id: 'c2', name: '英语', progress: 20 }],
      user: { name: '张三', totalDays: 3 },
    });
    // 增量：只更新 checkins 与 user 的部分字段
    const saved = await syncService.saveData(userId, {
      _syncMode: 'partial',
      checkins: [{ date: '2026-09-09', status: 'done' }],
      user: { continuousDays: 5 },
    });

    assert.equal(saved.courses.length, 1);           // courses 未被覆盖
    assert.equal(saved.user.name, '张三');            // user 深层字段保留
    assert.equal(saved.user.continuousDays, 5);       // 新字段合并进来
    assert.equal(saved.checkins.length, 1);           // checkins 更新
  });
});

describe('syncService.saveData（非法输入）', () => {
  test('数组输入 → 400 INVALID_INPUT', async () => {
    await assert.rejects(
      syncService.saveData(userId, [1, 2, 3]),
      (err) => err.status === 400 && err.code === 'INVALID_INPUT'
    );
  });
});