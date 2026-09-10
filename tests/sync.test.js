/**
 * 晨光自律台 · 前端同步层 sync.js 单元测试
 * ============================================================
 * 覆盖：pull 全量合并、push 增量/全量模式分派、无 token 跳过、
 * 离线时保留本地数据。通过 mock 全局 fetch 隔离网络。
 * 运行：npm test（Vitest，jsdom 环境）
 */
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import CGStore from '../js/store.js';
import CGSync from '../js/sync.js';

const TOKEN = 'tjwt-test';

beforeEach(() => {
  localStorage.clear();
  CGStore.resetData();
  CGStore.clearDirtyCategories();
  localStorage.setItem('cg_token', TOKEN);
  vi.restoreAllMocks();
});

afterEach(() => {
  // 清理可能遗留的防抖推送，避免测试结束后触发意外网络调用
  delete globalThis.fetch;
});

/** 构造一个最小可用 fetch 响应（sync.js req 只用到 ok/status/json/headers.get） */
function okResponse(body, etag = null) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
    headers: { get: (h) => (h === 'ETag' ? etag : null) },
  };
}

describe('pull()', () => {
  test('登录且服务器正常时，全量快照合并到本地', async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve(okResponse({
        data: {
          user: { name: '云端用户', totalDays: 7 },
          courses: [{ id: 'c1', name: '高数', progress: 10 }],
          checkins: [], sports: [], readings: [], english: [], todos: [], focus: [],
        },
      }, 'etag-abc'))
    );

    const ok = await CGSync.pull();
    expect(ok).toBe(true);
    expect(CGStore.get().user.name).toBe('云端用户');
    expect(CGStore.get().courses[0].name).toBe('高数');

    // 校验请求：GET /data、带 Bearer token、带上次 ETag 条件请求头
    const [url, opts] = globalThis.fetch.mock.calls[0];
    expect(url).toContain('/data');
    expect(opts.method).toBe('GET');
    expect(opts.headers.Authorization).toBe('Bearer ' + TOKEN);
  });

  test('未登录（无 token）直接跳过，返回 false', async () => {
    localStorage.removeItem('cg_token');
    globalThis.fetch = vi.fn();
    const ok = await CGSync.pull();
    expect(ok).toBe(false);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

describe('push()', () => {
  test('少量脏集合以 partial 增量模式发送', async () => {
    CGStore.addCourse({ id: 'c1', name: '英语', progress: 20 }); // 仅 courses 脏
    globalThis.fetch = vi.fn(() => Promise.resolve(okResponse({ data: {} })));

    const ok = await CGSync.push();
    expect(ok).toBe(true);

    const [url, opts] = globalThis.fetch.mock.calls[0];
    expect(url).toContain('/data');
    expect(opts.method).toBe('PUT');
    const body = JSON.parse(opts.body);
    expect(body.data._syncMode).toBe('partial');
    expect(body.data.courses).toHaveLength(1);
  });

  test('离线（fetch 网络错误）时返回 false 且本地数据保留', async () => {
    CGStore.addSport({ id: 's1', name: '跑步' });
    globalThis.fetch = vi.fn(() => Promise.reject(new TypeError('network down')));

    const ok = await CGSync.push();
    expect(ok).toBe(false);
    expect(CGStore.get().sports).toHaveLength(1); // 离线数据不丢失
  });

  test('推送成功后清空脏标记', async () => {
    CGStore.addSport({ id: 's1', name: '游泳' });
    globalThis.fetch = vi.fn(() => Promise.resolve(okResponse({ data: {} })));
    expect(CGStore.getDirtyCategories()).toContain('sports');
    await CGSync.push();
    expect(CGStore.getDirtyCategories()).toHaveLength(0);
  });
});

describe('afterLogin()', () => {
  test('本地为空 → 只拉取不推送', async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve(okResponse({
        data: {
          user: { name: '云端' }, courses: [], checkins: [], sports: [],
          readings: [], english: [], todos: [], focus: [],
        },
      }))
    );
    await CGSync.afterLogin();
    // 只发了一次请求（GET pull），没有先 push
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });
});