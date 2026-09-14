import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import CGStore from '../js/store.js';
import CGSync from '../js/sync.js';

function okResponse(body, etag = null) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
    headers: { get: () => etag },
  };
}

function serverPayload(business, revision) {
  return {
    data: {
      data: business,
      revision,
      updatedAt: '2026-09-14T08:00:00.000Z',
      deviceId: 'device-cloud',
    },
  };
}

function emptyBusiness(extra = {}) {
  return Object.assign({
    user: { name: '' },
    checkins: [],
    sports: [],
    readings: [],
    courses: [],
    english: [],
    todos: [],
    focus: [],
    goals: [],
  }, extra);
}

beforeEach(() => {
  localStorage.clear();
  CGStore.resetData();
  CGStore.clearDirtyCategories();
  localStorage.setItem('cg_token', 'release-token');
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  delete globalThis.fetch;
  localStorage.removeItem('cg_token');
});

test('清空本地数据后重新拉取，可完整恢复云端数据', async () => {
  localStorage.clear();
  CGStore.resetData();
  localStorage.setItem('cg_token', 'release-token');
  const cloudData = emptyBusiness({
    user: { name: '云端用户' },
    todos: [{ id: 'todo-1', text: '云端待办', done: false }],
    readings: [{ id: 'reading-1', title: '云端阅读', pages: 20 }],
  });
  globalThis.fetch = vi.fn().mockResolvedValue(okResponse(serverPayload(cloudData, 9), 'etag-release'));

  await expect(CGSync.pull()).resolves.toBe(true);

  expect(CGStore.get().todos).toHaveLength(1);
  expect(CGStore.get().readings).toHaveLength(1);
  expect(CGStore.getRevision()).toBe(9);
  expect(CGStore.getMeta()).toMatchObject({
    revision: 9,
    updatedAt: '2026-09-14T08:00:00.000Z',
    deviceId: 'device-cloud',
  });
});

test('离线启动不覆盖本地数据，也不会标记为已同步', async () => {
  const localData = emptyBusiness({
    user: { name: '本机用户' },
    todos: [{ id: 'todo-local', text: '本机待办', done: false }],
  });
  CGStore.set(localData, { kind: 'REMOTE', revision: 12 });
  globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('network down'));

  await expect(CGSync.pull()).resolves.toBe(false);

  expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  expect(CGSync.getSyncStatus()).toBe('offline');
  expect(CGStore.get().todos).toEqual([{ id: 'todo-local', text: '本机待办', done: false }]);
  expect(CGStore.getRevision()).toBe(12);
});

test('离线修改在网络恢复后保留并成功重推', async () => {
  vi.useFakeTimers();
  const fetchMock = vi.fn()
    .mockRejectedValueOnce(new TypeError('network down'))
    .mockResolvedValueOnce(okResponse(serverPayload(emptyBusiness({
      todos: [{ id: 'todo-offline', text: '恢复后待办', done: false }],
    }), 2)));
  globalThis.fetch = fetchMock;
  CGStore.addTodo({ id: 'todo-offline', text: '恢复后待办', done: false });

  await expect(CGSync.push()).resolves.toBe(false);
  expect(CGStore.getTodos()).toHaveLength(1);
  expect(localStorage.getItem('chenguangSyncPending')).toBe('1');

  window.dispatchEvent(new Event('online'));
  await vi.advanceTimersByTimeAsync(0);

  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(localStorage.getItem('chenguangSyncPending')).toBe('0');
  expect(CGStore.getTodos()).toHaveLength(1);
  expect(CGStore.getRevision()).toBe(2);
});

test('设备 A 新增待办、设备 B 新增阅读，合并后互不丢失', () => {
  const deviceA = emptyBusiness({
    todos: [{ id: 'todo-a', text: '设备 A 待办', done: false }],
  });
  const deviceB = emptyBusiness({
    readings: [{ id: 'reading-b', title: '设备 B 阅读', pages: 30 }],
  });

  const merged = CGSync.mergeState(deviceA, deviceB, {});

  expect(merged.todos).toEqual([{ id: 'todo-a', text: '设备 A 待办', done: false }]);
  expect(merged.readings).toEqual([{ id: 'reading-b', title: '设备 B 阅读', pages: 30 }]);
});

test('同步记录合并去重，版本推进取双方最大版本加一', () => {
  const deviceA = emptyBusiness({
    todos: [{ id: 'todo-shared', text: '设备 A 更新', done: true, updatedAt: '2026-09-14T09:00:00.000Z' }],
  });
  const deviceB = emptyBusiness({
    todos: [{ id: 'todo-shared', text: '设备 B 旧版', done: false }],
  });

  const merged = CGSync.mergeState(deviceA, deviceB, {});

  expect(merged.todos).toHaveLength(1);
  expect(merged.todos[0]).toMatchObject({
    id: 'todo-shared',
    text: '设备 A 更新',
    done: true,
  });
  expect(CGSync.resolveMergeRevision(8, 10)).toBe(11);
});
