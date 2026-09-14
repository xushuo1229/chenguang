/**
 * 知行 · Phase 8 版本化同步后端测试
 * ============================================================
 * 覆盖：revision 递增、落后版本拒绝（409 SYNC_CONFLICT + 服务器数据）、
 * 幂等（内容一致不 bump）、envelope 契约、deviceId 持久化。
 * 运行：cd backend && NODE_ENV=test node --test test/syncVersion.test.js
 */
'use strict';

require('./setup');
const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const authService = require('../src/services/authService');
const syncService = require('../src/services/syncService');

let userId;
before(async () => {
  const { user } = await authService.register({
    email: 'ver@chenguang.com',
    password: 'Abc123456',
  });
  userId = user.id;
});

describe('Phase 8：revision 递增', () => {
  test('初始 version=1，每次保存恰好 +1', async () => {
    assert.equal((await syncService.getData(userId)).revision, 1);

    const r2 = await syncService.saveData(userId, { courses: [{ id: 'c1', name: '高数', progress: 10 }] });
    assert.equal(r2.revision, 2);

    const r3 = await syncService.saveData(userId, { courses: [{ id: 'c1', name: '高数', progress: 20 }] });
    assert.equal(r3.revision, 3);
    assert.equal(r3.data.courses[0].progress, 20);
  });
});

describe('Phase 8：落后版本拒绝（乐观并发）', () => {
  test('baseRevision 落后服务器 → 409 SYNC_CONFLICT，携带 serverRevision/serverData', async () => {
    // 建立 server version 当前值（刚才 r3 → rev 3）
    const current = await syncService.getData(userId);
    assert.equal(current.revision, 3);

    // 客户端还停留在版本 1，想推新数据 → 必须拒绝
    await assert.rejects(
      syncService.saveData(userId, {
        data: { courses: [{ id: 'c1', name: '高数', progress: 5 }] },
        baseRevision: 1,
      }),
      (err) => {
        assert.equal(err.status, 409);
        assert.equal(err.code, 'SYNC_CONFLICT');
        assert.equal(err.details.serverRevision, 3);          // 服务器最新版本
        assert.ok(err.details.serverData);                    // 服务器最新数据（合并用）
        assert.ok(err.details.serverData.courses);
        return true;
      }
    );
    // 拒绝后服务器数据未被污染
    const after = await syncService.getData(userId);
    assert.equal(after.revision, 3);
    assert.equal(after.data.courses[0].progress, 20);
  });

  test('baseRevision 等于服务器版本 → 正常保存，newRev = baseRevision + 1', async () => {
    const saved = await syncService.saveData(userId, {
      data: { courses: [{ id: 'c1', name: '高数', progress: 30 }] },
      baseRevision: 3,
      deviceId: 'device-A',
    });
    assert.equal(saved.revision, 4);
    assert.equal(saved.data.courses[0].progress, 30);
    assert.equal(saved.deviceId, 'device-A');
  });

  test('错误版本来源被持久化到 DB，随 getData 返回', async () => {
    const got = await syncService.getData(userId);
    assert.equal(got.deviceId, 'device-A');
  });
});

describe('Phase 8：幂等（内容一致不 bump 版本）', () => {
  test('相同内容重复保存 → 返回当前数据，revision 不增加', async () => {
    const beforeRev = (await syncService.getData(userId)).revision; // = 4

    // 原样重放最后一次保存的内容（内容一致）
    const again = await syncService.saveData(userId, {
      data: { courses: [{ id: 'c1', name: '高数', progress: 30 }] },
      baseRevision: 4,
      deviceId: 'device-A',
    });
    assert.equal(again.idempotent, true);
    assert.equal(again.revision, beforeRev);   // 版本不加
    assert.equal((await syncService.getData(userId)).revision, beforeRev);
  });

  test('内容一致但 baseRevision 落后 → 也按幂等返回（不误判冲突）', async () => {
    // 用更旧的 baseRevision 重放完全相同内容：内容没差异 → 无需冲突，幂等返回
    const again = await syncService.saveData(userId, {
      data: { courses: [{ id: 'c1', name: '高数', progress: 30 }] },
      baseRevision: 1,
      deviceId: 'device-old',
    });
    assert.equal(again.idempotent, true);
    assert.equal((await syncService.getData(userId)).revision, 4);
  });
});

describe('Phase 8：envelope 与 partial 版本行为', () => {
  test('partial 增量以服务器当前为基础合并，版本号照常推进', async () => {
    // current rev=4（courses progress 30）
    const saved = await syncService.saveData(userId, {
      data: {
        _syncMode: 'partial',
        checkins: [{ date: '2026-09-11', status: 'done' }],
        user: { continuousDays: 2 },
      },
      baseRevision: 4,
    });
    assert.equal(saved.revision, 5);
    assert.equal(saved.data.courses[0].progress, 30);   // 未提及集合保留服务器值
    assert.equal(saved.data.user.continuousDays, 2);     // 深合并
    assert.equal(saved.data.checkins.length, 1);
  });
});
