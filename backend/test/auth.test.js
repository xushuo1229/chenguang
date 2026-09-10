/**
 * 晨光自律台 · authService 单元测试
 * ============================================================
 * 覆盖：注册（成功/非法邮箱/弱密码/重复邮箱）、登录（正确/错误密码/不存在用户）、
 * 资料查询。
 * 运行：cd backend && NODE_ENV=test node --test test/auth.test.js
 */
'use strict';

require('./setup'); // 先初始化临时库环境（必须在 require src 之前）
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const authService = require('../src/services/authService');

describe('authService.register', () => {
  test('合法输入注册成功，返回 token 与不含密码的用户信息', async () => {
    const { token, user } = await authService.register({
      email: 'demo@chenguang.com',
      nickname: '测试',
      password: 'Abc123456',
    });
    assert.ok(token && typeof token === 'string');
    assert.equal(user.email, 'demo@chenguang.com');
    assert.equal(user.nickname, '测试');
    assert.ok(user.id);
    assert.equal(user.password_hash, undefined); // 绝不下发密码哈希
  });

  test('邮箱格式非法 → 400', async () => {
    await assert.rejects(
      authService.register({ email: 'not-an-email', password: 'Abc123456' }),
      (err) => err.status === 400
    );
  });

  test('密码过弱 → 400', async () => {
    await assert.rejects(
      authService.register({ email: 'weak@chenguang.com', password: '123' }),
      (err) => err.status === 400
    );
  });

  test('重复注册同一邮箱 → 409 且 code 为 EMAIL_EXISTS', async () => {
    await authService.register({ email: 'dup@chenguang.com', password: 'Abc123456' });
    await assert.rejects(
      authService.register({ email: 'dup@chenguang.com', password: 'Abc123456' }),
      (err) => err.status === 409 && err.code === 'EMAIL_EXISTS'
    );
  });
});

describe('authService.login', () => {
  test('正确密码登录成功', async () => {
    await authService.register({ email: 'log@chenguang.com', password: 'Abc123456' });
    const { token, user } = await authService.login({
      email: 'log@chenguang.com',
      password: 'Abc123456',
    });
    assert.ok(token);
    assert.equal(user.email, 'log@chenguang.com');
  });

  test('错误密码 → 401 且不暴露是否已注册', async () => {
    await authService.register({ email: 'bad@chenguang.com', password: 'Abc123456' });
    for (const email of ['bad@chenguang.com', 'ghost@chenguang.com']) {
      await assert.rejects(
        authService.login({ email, password: 'wrong-password' }),
        (err) => err.status === 401 && err.message === '邮箱或密码错误'
      );
    }
  });
});

describe('authService.getProfile', () => {
  test('已存在用户返回安全资料', async () => {
    const { user } = await authService.register({
      email: 'prof@chenguang.com',
      password: 'Abc123456',
    });
    const got = await authService.getProfile(user.id);
    assert.equal(got.email, 'prof@chenguang.com');
    assert.equal(got.password_hash, undefined);
  });

  test('不存在的用户 → 404', async () => {
    await assert.rejects(
      authService.getProfile(999999),
      (err) => err.status === 404 && err.code === 'USER_NOT_FOUND'
    );
  });
});