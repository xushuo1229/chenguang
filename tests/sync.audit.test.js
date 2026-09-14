import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import CGStore from '../js/store.js';
import CGSync from '../js/sync.js';

function okResponse(body) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
    headers: { get: () => null },
  };
}

function serverPayload(business, revision) {
  return { data: { data: business, revision, updatedAt: '2026-09-14T00:00:00.000Z', deviceId: 'audit-server' } };
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
  localStorage.setItem('cg_token', 'audit-token');
  vi.useFakeTimers();
  vi.clearAllTimers();
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  delete globalThis.fetch;
  localStorage.removeItem('cg_token');
});

test('七个业务集合的每次本机写入 revision 恰好 +1', () => {
  expect(CGStore.getRevision()).toBe(0);
  CGStore.addCheckin();
  CGStore.addSport({});
  CGStore.addReading({});
  CGStore.addCourse({});
  CGStore.addEnglish({});
  CGStore.addTodo({});
  CGStore.addFocus({});
  expect(CGStore.getRevision()).toBe(7);
});

test('REMOTE 应用不进入推送队列，避免远端回环', async () => {
  const fetchMock = vi.fn();
  globalThis.fetch = fetchMock;
  CGStore.set(emptyBusiness({ todos: [{ id: 'remote', text: '云端待办', done: false }] }), {
    kind: 'REMOTE',
    revision: 8,
    updatedAt: '2026-09-14T00:00:00.000Z',
    deviceId: 'audit-server',
  });

  await vi.advanceTimersByTimeAsync(1000);

  expect(fetchMock).not.toHaveBeenCalled();
  expect(CGStore.getDirtyCategories()).toEqual([]);
  expect(CGStore.getRevision()).toBe(8);
});

test('本机修改只推送一次，远端结果不触发第二次推送', async () => {
  const fetchMock = vi.fn().mockResolvedValue(okResponse(serverPayload(emptyBusiness(), 1)));
  globalThis.fetch = fetchMock;
  CGStore.addTodo({ text: '本地待办' });
  expect(CGStore.getRevision()).toBe(1);

  await expect(CGSync.push()).resolves.toBe(true);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls[0][1].method).toBe('PUT');

  await vi.advanceTimersByTimeAsync(1200);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(CGStore.getRevision()).toBe(1);
  expect(CGStore.getDirtyCategories()).toEqual([]);
});

test('离线修改保留在本地，网络恢复后自动重推一次', async () => {
  const fetchMock = vi.fn()
    .mockRejectedValueOnce(new TypeError('network down'))
    .mockImplementationOnce(() => Promise.resolve(
      okResponse(serverPayload(emptyBusiness({ todos: CGStore.getTodos().slice() }), 1))
    ));
  globalThis.fetch = fetchMock;
  CGStore.addTodo({ text: '离线待办' });

  await expect(CGSync.push()).resolves.toBe(false);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(CGStore.getTodos()).toHaveLength(1);
  expect(localStorage.getItem('chenguangSyncPending')).toBe('1');

  window.dispatchEvent(new Event('online'));
  await vi.advanceTimersByTimeAsync(0);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(localStorage.getItem('chenguangSyncPending')).toBe('0');
  expect(CGStore.getTodos()).toHaveLength(1);
});
