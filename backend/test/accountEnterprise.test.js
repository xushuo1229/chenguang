/**
 * Zeno · 企业级账号体系回归
 * 覆盖：登出所有设备（token_version 吊销）、密码重置令牌、注册开关、管理员守卫。
 */
'use strict';

require('./setup');
const { test, describe, afterEach } = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');

const authService = require('../src/services/authService');
const ent = require('../src/config/enterprise');
const userModel = require('../src/db/userModel');
const { signToken, verifyToken, adminRequired } = require('../src/middleware/auth');

async function makeUser(email) {
  return authService.register({ email, password: 'Abc123456' });
}

describe('登出所有设备（token_version）', () => {
  test('logoutAllDevices 推进版本并返回新令牌，旧令牌的 tv 不再匹配', async () => {
    const { user, token } = await makeUser('tv@zeno.dev');
    assert.equal(verifyToken(token).tv, 0);

    const next = await authService.logoutAllDevices(user.id);
    const fresh = verifyToken(next.token);
    assert.equal(fresh.tv, 1);
    assert.equal(verifyToken(token).tv, 0); // 旧令牌仍可解码，但版本已落后

    const dbUser = await userModel.findUserById(user.id);
    assert.equal(Number(dbUser.token_version), 1);
  });
});

describe('重置密码令牌', () => {
  test('无效/过期令牌被拒绝；有效令牌重置密码并推进版本', async () => {
    const { user } = await makeUser('reset@zeno.dev');

    await assert.rejects(
      authService.resetPassword('not-a-real-token', 'NewPass1'),
      (e) => e.status === 400 && e.code === 'INVALID_RESET_TOKEN'
    );

    // 直接构造一枚有效令牌（与 service 内部相同的哈希与过期口径）
    const raw = crypto.randomBytes(32).toString('hex');
    const hash = crypto.createHash('sha256').update(raw).digest('hex');
    await userModel.saveHashedToken(
      'password_reset_tokens',
      user.id,
      hash,
      new Date(Date.now() + 3600 * 1000).toISOString()
    );
    await authService.resetPassword(raw, 'NewPass1');

    // 新密码可登录
    const relogin = await authService.login({ email: 'reset@zeno.dev', password: 'NewPass1' });
    assert.ok(relogin.token);
    // 重置密码使旧会话失效 → 版本已推进
    const dbUser = await userModel.findUserById(user.id);
    assert.ok(Number(dbUser.token_version) >= 1);

    // 令牌一次性：再次使用应无效
    await assert.rejects(
      authService.resetPassword(raw, 'Another1'),
      (e) => e.status === 400
    );
  });
});

describe('注册开关', () => {
  const original = ent.allowRegistration;
  afterEach(() => {
    ent.allowRegistration = original;
  });

  test('关闭公开注册后注册被 403 拒绝', async () => {
    ent.allowRegistration = false;
    await assert.rejects(
      authService.register({ email: 'closed@zeno.dev', password: 'Abc123456' }),
      (e) => e.status === 403 && e.code === 'REGISTRATION_DISABLED'
    );
  });
});

describe('管理员守卫', () => {
  test('非管理员 → next(403 FORBIDDEN)；管理员 → next()', () => {
    let captured;
    adminRequired({ user: { isAdmin: false } }, {}, (err) => { captured = err; });
    assert.equal(captured.status, 403);
    assert.equal(captured.code, 'FORBIDDEN');

    let passed = false;
    adminRequired({ user: { isAdmin: true } }, {}, () => { passed = true; });
    assert.ok(passed);
  });

  test('JWT 携带 tv 字段', () => {
    const t = signToken({ id: 1, email: 'a@b.c', token_version: 2 });
    assert.equal(verifyToken(t).tv, 2);
  });
});
