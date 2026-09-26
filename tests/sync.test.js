/**
 * Zeno · 前端同步层 sync.js 单元测试
 * ============================================================
 * 覆盖：envelope 信封、pull 采纳服务器版本、push 成功采纳服务器融合结果、
 * 离线队列 + 指数退避、409 冲突自动合并重推、afterLogin Case A/B、
 * 墓碑防复活、多标签防循环。通过 mock 全局 fetch 隔离网络。
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
  // 全文件统一走 fake timers：任何防抖推送 / 指数退避定时器都在受控时钟下排队，
  // 每个测试开始先清掉上一个测试的残留，彻底杜绝"真实残留 timer 在测试窗口内
  // 意外触发 push 污染 fetch 计数"的跨测试耦合。
  vi.useRealTimers();
  vi.useFakeTimers();
  vi.clearAllTimers();
});

afterEach(() => {
  // 清理可能遗留的防抖推送 / 退避定时器，避免跨测试干扰
  vi.clearAllTimers();
  vi.useRealTimers();
  delete globalThis.fetch;
  // 移除 token，保证任何残留的退避定时器触发 push 时直接短路返回
  localStorage.removeItem('cg_token');
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

/** 失败响应（如 409 冲突，携带服务器数据） */
function conflictResponse(serverRevision, serverData) {
  return {
    ok: false,
    status: 409,
    json: () => Promise.resolve({
      data: null,
      error: { code: 'SYNC_CONFLICT', message: 'revision conflict', serverRevision, serverData },
    }),
    headers: { get: () => null },
  };
}

/** 服务器返回的业务快照 + revision（新 envelope 结构） */
function serverPayload(business, revision = 1) {
  return { data: { data: business, revision, updatedAt: '2026-09-11T00:00:00.000Z', deviceId: 'srv' } };
}

function emptyBusiness(extra = {}) {
  return Object.assign(
    { user: { name: '' }, checkins: [], sports: [], readings: [], courses: [], english: [], todos: [], focus: [], goals: [] },
    extra
  );
}

describe('pull()（信封 + 采纳服务器版本）', () => {
  test('登录且服务器正常时，全量采纳服务器数据与版本号（不 bump）', async () => {
    CGStore.addCourse({ id: 'local1', name: '本地课', progress: 5 }); // rev=1
    globalThis.fetch = vi.fn(() =>
      Promise.resolve(okResponse(serverPayload(
        emptyBusiness({ user: { name: '云端用户' }, courses: [{ id: 'c1', name: '高数', progress: 10 }] }),
        7
      ), 'etag-abc'))
    );

    const ok = await CGSync.pull();
    expect(ok).toBe(true);
    expect(CGStore.get().user.name).toBe('云端用户');
    expect(CGStore.get().courses[0].name).toBe('高数');
    // 服务器版本被采纳，而不是在本地版本基础上继续累加
    expect(CGStore.getRevision()).toBe(7);

    const [url, opts] = globalThis.fetch.mock.calls[0];
    expect(url).toContain('/data');
    expect(opts.method).toBe('GET');
    expect(opts.headers.Authorization).toBe('Bearer ' + TOKEN);
  });

  test('服务器 revision 与本地相同 → 跳过应用（已同步）', async () => {
    CGStore.set(emptyBusiness({ courses: [{ id: 'c1', name: '高数', progress: 10 }] }), { kind: 'REMOTE', revision: 3 });
    globalThis.fetch = vi.fn(() => Promise.resolve(okResponse(serverPayload(
      emptyBusiness({ courses: [{ id: 'c1', name: '高数', progress: 10 }] }), 3
    ))));
    const ok = await CGSync.pull();
    expect(ok).toBe(true);
    // 数据没变化，merge/set 不应被调用 —— 通过版本不变且只有一次 GET 验证
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(CGStore.getRevision()).toBe(3);
  });

  test('未登录（无 token）直接跳过，返回 false', async () => {
    localStorage.removeItem('cg_token');
    globalThis.fetch = vi.fn();
    const ok = await CGSync.pull();
    expect(ok).toBe(false);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

describe('push()（信封 + 采纳服务器融合结果）', () => {
  test('发送 envelope { data, baseRevision, deviceId }，成功后采纳服务器版本', async () => {
    CGStore.addCourse({ id: 'c1', name: '英语', progress: 20 }); // rev=1，仅 courses 脏
    globalThis.fetch = vi.fn(() =>
      Promise.resolve(okResponse(serverPayload(
        emptyBusiness({ courses: [{ id: 'c1', name: '英语', progress: 20 }] }), 2
      )))
    );

    const ok = await CGSync.push();
    expect(ok).toBe(true);

    const [url, opts] = globalThis.fetch.mock.calls[0];
    expect(url).toContain('/data');
    expect(opts.method).toBe('PUT');
    const body = JSON.parse(opts.body);
    expect(body.baseRevision).toBe(1);
    expect(body.deviceId).toBeTruthy();
    expect(body.data._syncMode).toBe('partial'); // 少量脏集合走增量
    expect(body.data.courses).toHaveLength(1);

    // 采纳服务器返回的最终数据与版本号
    expect(CGStore.getRevision()).toBe(2);
    expect(CGStore.getDirtyCategories()).toHaveLength(0);
  });

  test('离线（fetch 网络错误）→ false、数据保留、进入待同步队列、状态 offline', async () => {
    CGStore.addSport({ id: 's1', name: '跑步' });
    globalThis.fetch = vi.fn(() => Promise.reject(new TypeError('network down')));

    const ok = await CGSync.push();
    expect(ok).toBe(false);
    expect(CGStore.get().sports).toHaveLength(1); // 离线数据不丢失
    expect(localStorage.getItem('chenguangSyncPending')).toBe('1'); // 单槽离线队列
    expect(CGSync.getSyncStatus()).toBe('offline');
  });

  test('推送期间本地又修改 → 保留本地新改动，不覆盖，待下一轮', async () => {
    CGStore.addSport({ id: 's1', name: '跑步' }); // rev=1
    let resolvePut;
    globalThis.fetch = vi.fn((url, opts) => {
      // 让 PUT 慢一点，等待期间本地又新增
      return new Promise((r) => { resolvePut = r; });
    });
    const p = CGSync.push();
    // 模拟在 push 在途时本地新操作：dirty courses + bump 版本
    CGStore.addCourse({ id: 'c2', name: '新课' });
    resolvePut(okResponse(serverPayload(
      emptyBusiness({ sports: [{ id: 's1', name: '跑步' }] }), 5
    )));
    await p;
    // 本地新改动保留（没有采纳服务器覆盖掉 courses）
    expect(CGStore.get().courses).toHaveLength(1);
    expect(CGStore.getDirtyCategories()).toContain('courses');
  });
});

describe('409 冲突：自动合并重推（防线式）', () => {
  test('本地推分落后 → 409 → 合并服务器数据 → 以服务器版本为基准重推', async () => {
    CGStore.set(
      emptyBusiness({
        user: { name: '本地用户', totalDays: 3 },
        courses: [{ id: 'c1', name: '高数', progress: 80 }],      // 本地更新
        todos: [{ id: 't1', text: '本地新待办', done: false }],   // 服务器没有
      }),
      { kind: 'REMOTE', revision: 1 }
    );
    CGStore.addCourse({ id: 'c1', name: '高数', progress: 90 }); // rev=2（本地新操作）

    const serverData = emptyBusiness({
      user: { name: '云端用户', totalDays: 30 },
      courses: [{ id: 'c1', name: '高数', progress: 85 }],        // 服务器也改了
      focus: [{ id: 'f1', minutes: 20 }],                          // 服务器独有
    });

    // 第一次 PUT → 409；第二次 PUT → 成功（服务器接受合并结果，rev 6）
    let putCount = 0;
    globalThis.fetch = vi.fn((url, opts) => {
      if (opts.method === 'GET') return Promise.resolve(okResponse(serverPayload(serverData, 5)));
      putCount++;
      if (putCount === 1) return Promise.resolve(conflictResponse(5, serverData));
      return Promise.resolve(okResponse(serverPayload(
        emptyBusiness({
          user: { name: '本地用户', totalDays: 3 },   // 合并后 user 本地优先
          courses: [{ id: 'c1', name: '高数', progress: 90 }],
          todos: [{ id: 't1', text: '本地新待办', done: false }],
          focus: [{ id: 'f1', minutes: 20 }],
        }), 6
      )));
    });

    const ok = await CGSync.push();
    expect(ok).toBe(true);
    expect(globalThis.fetch.mock.calls.filter(([, o]) => o.method === 'PUT')).toHaveLength(2);
    // 第二次 PUT 的基准是服务器 revision 5（不是覆盖式把本地 rev 2 当基准）
    const putBodies = globalThis.fetch.mock.calls
      .filter(([, o]) => o.method === 'PUT')
      .map(([, o]) => JSON.parse(o.body));
    expect(putBodies[1].baseRevision).toBe(5);
    // 合并结果：本地优先 + 服务器独有记录并入 + 服务器字段保留（totalDays 30 被本地 3 覆盖？→ 本地优先）
    expect(CGStore.get().courses[0].progress).toBe(90);
    expect(CGStore.get().todos.find((x) => x.id === 't1')).toBeTruthy();
    expect(CGStore.get().focus.find((x) => x.id === 'f1')).toBeTruthy();
  });

  test('冲突响应缺服务器数据 → 保守挂起（不 pull、不覆盖本地）', async () => {
    CGStore.set(emptyBusiness({ courses: [{ id: 'c1', name: '高数', progress: 10 }] }), { kind: 'REMOTE', revision: 1 });
    CGStore.addCourse({ id: 'c2', name: '新课' }); // rev=2
    let putCalled = false;
    globalThis.fetch = vi.fn((url, opts) => {
      if (opts.method === 'GET') return Promise.resolve(okResponse(serverPayload(emptyBusiness(), 4)));
      putCalled = true;
      return Promise.resolve({ ok: false, status: 409, json: () => Promise.resolve({ error: { code: 'SYNC_CONFLICT' } }), headers: { get: () => null } });
    });
    const ok = await CGSync.push();
    expect(putCalled).toBe(true);
    expect(ok).toBe(false);
    // 保守处理：不 pull 覆盖、不丢失本地离线数据，进入冲突状态等待下一次机会
    expect(CGStore.get().courses).toHaveLength(2);
    expect(localStorage.getItem('chenguangSyncPending')).toBe('1');
    expect(CGSync.getSyncStatus()).toBe('conflict');
  });
});

describe('afterLogin()：Case A / Case B（修正方案）', () => {
  test('Case A：无待同步 → 只拉取不推送', async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve(okResponse(serverPayload(emptyBusiness({ user: { name: '云端' } }), 3)))
    );
    await CGSync.afterLogin();
    // 只发了一次请求（GET pull），没有先 push
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(globalThis.fetch.mock.calls[0][1].method).toBe('GET');
  });

  test('Case B：有待同步修改 → 先 GET 再合并再 PUT（绝不先推旧数据覆盖云端）', async () => {
    // 模拟离线攒下的本地修改
    localStorage.setItem('chenguangSyncPending', '1');
    CGStore.set(
      emptyBusiness({
        user: { name: '本地用户', startDate: '2026-01-01' },
        sports: [{ id: 's1', name: '跑步', calories: 100 }], // 本地离线新增
      }),
      { kind: 'REMOTE', revision: 4 }
    );
    CGStore.markDirty('sports'); // 离线期间改的集合

    const server = emptyBusiness({
      user: { name: '云端用户', startDate: '2025-12-01' },
      sports: [{ id: 's2', name: '游泳', calories: 50 }],  // 服务器独有
    });

    let methodLog = [];
    globalThis.fetch = vi.fn((url, opts) => {
      methodLog.push(opts.method);
      if (opts.method === 'GET') return Promise.resolve(okResponse(serverPayload(server, 5)));
      // PUT：服务器接受合并结果，返回 revision 6
      return Promise.resolve(okResponse(serverPayload(
        emptyBusiness({
          user: { name: '本地用户', startDate: '2026-01-01' },
          sports: [server.sports[0], { id: 's1', name: '跑步', calories: 100 }],
        }), 6
      )));
    });

    const ok = await CGSync.afterLogin();
    expect(ok).toBe(true);
    // 绝对禁止"先 push 覆盖云端再 pull"：第一个请求必须是 GET
    expect(methodLog[0]).toBe('GET');
    expect(methodLog.join(',')).toBe('GET,PUT');
    // 合并吸收：本地离线改的跑步保留 + 服务器游泳也进
    const sports = CGStore.get().sports;
    expect(sports.find((x) => x.id === 's1')).toBeTruthy();
    expect(sports.find((x) => x.id === 's2')).toBeTruthy();
    // 合并版本 = max(4,5)+1 = 6
    expect(CGStore.getRevision()).toBe(6);
    expect(localStorage.getItem('chenguangSyncPending')).toBe('0');
  });
});

describe('mergeState()：墓碑防复活（Test7）', () => {
  test('墓碑 id 在服务器仍存在 → 合并后必须剔除（不复活）', () => {
    const local = emptyBusiness({
      courses: [{ id: 'dead', name: '已删课', progress: 0 }, { id: 'alive', name: '活课', progress: 1 }],
    });
    // 注意：mergeState 的本地是"合并基准快照"，墓碑记录单独传入
    const remote = emptyBusiness({
      courses: [{ id: 'dead', name: '已删课', progress: 50 }, { id: 'remote-only', name: '云端课', progress: 99 }],
    });
    const tombstones = { courses: ['dead'] };
    const merged = CGSync.mergeState(local, remote, tombstones);
    expect(merged.courses.find((x) => x.id === 'dead')).toBeUndefined(); // 墓碑 > 服务器
    expect(merged.courses.find((x) => x.id === 'alive')).toBeTruthy();
    expect(merged.courses.find((x) => x.id === 'remote-only')).toBeTruthy();
  });

  test('同 id 合并为字段级：本地改的字段赢，服务器独有字段保留（不丢云端数据）', () => {
    const local = emptyBusiness({
      courses: [{ id: 'c1', name: '高数', progress: 90 }], // 本地只改了 progress
    });
    const remote = emptyBusiness({
      courses: [{ id: 'c1', name: '高数', progress: 50, teacher: '王老师', room: 'A302' }],
    });
    const merged = CGSync.mergeState(local, remote, {});
    const c1 = merged.courses.find((x) => x.id === 'c1');
    expect(c1.progress).toBe(90);          // 本地覆盖
    expect(c1.teacher).toBe('王老师');      // 服务器独有字段保留
    expect(c1.room).toBe('A302');
  });

  test('goals 按 id 合并（Phase 12）：本地改的字段赢，服务器独有目标保留', () => {
    const local = emptyBusiness({
      goals: [{ id: 'g1', title: '本周专注', type: 'focus', metric: 'minutes', targetValue: 700 }],
    });
    const remote = emptyBusiness({
      goals: [
        { id: 'g1', title: '本周专注', type: 'focus', metric: 'minutes', targetValue: 600 },
        { id: 'g2', title: '云端目标', type: 'reading', metric: 'pages', targetValue: 100 },
      ],
    });
    const merged = CGSync.mergeState(local, remote, {});
    const g1 = merged.goals.find((x) => x.id === 'g1');
    expect(g1.targetValue).toBe(700);           // 本地覆盖
    expect(merged.goals.find((x) => x.id === 'g2')).toBeTruthy(); // 服务器独有保留
  });

  test('goals 墓碑优先：本地归档/删除的 id 不复活', () => {
    const local = emptyBusiness({ goals: [] });
    const remote = emptyBusiness({
      goals: [{ id: 'g-dead', title: '已删', targetValue: 100 }],
    });
    const merged = CGSync.mergeState(local, remote, { goals: ['g-dead'] });
    expect(merged.goals.find((x) => x.id === 'g-dead')).toBeUndefined();
  });

  test('checkins 按 date 合并，同日期本地优先', () => {
    const local = emptyBusiness({ checkins: [{ date: '2026-09-10', status: 'done' }] });
    const remote = emptyBusiness({
      checkins: [
        { date: '2026-09-10', status: 'missed' }, // 服务器同一天是 missed
        { date: '2026-09-11', status: 'done' },
      ],
    });
    const merged = CGSync.mergeState(local, remote, {});
    expect(merged.checkins).toHaveLength(2);
    const d10 = merged.checkins.find((x) => x.date === '2026-09-10');
    expect(d10.status).toBe('done'); // 本地优先
  });

  test('两设备同一天打卡（各自带 id）→ 按 date 合并为一条，不重复', () => {
    // 本地 _add 会给打卡生成 id；若不按 date 而按 id 合并，跨设备同日打卡会成两条
    const local = emptyBusiness({ checkins: [{ id: 'a1', date: '2026-09-11', status: 'done' }] });
    const remote = emptyBusiness({ checkins: [{ id: 'b1', date: '2026-09-11', status: 'done' }] });
    const merged = CGSync.mergeState(local, remote, {});
    expect(merged.checkins).toHaveLength(1);
    expect(merged.checkins[0].date).toBe('2026-09-11'); // 合并后仍按日期唯一
  });

  test('空/undefined/非对象参数不崩溃', () => {
    const merged = CGSync.mergeState(undefined, null, undefined);
    expect(merged).toBeTruthy();
    COLLECTIONS_ARR_FOR_UNDEF.forEach((k) => expect(Array.isArray(merged[k])).toBe(true));
  });
});

const COLLECTIONS_ARR_FOR_UNDEF = ['checkins', 'sports', 'readings', 'courses', 'english', 'todos', 'focus', 'goals'];

describe('墓碑全链条：本地删除 → push → 服务器吸收后清理（Test8）', () => {
  test('服务器返回数据不再含墓碑 id → 清空该集合墓碑', async () => {
    const c = CGStore.addCourse({ id: 'c1', name: '要删', progress: 0 });
    CGStore.removeCourse(c.id); // 记录墓碑
    expect(CGStore.getTombstones('courses')).toContain('c1');

    // push 成功后服务器返回的数据里已没有 c1（删除被吸收）
    const serverData = emptyBusiness(); // courses 空数组
    globalThis.fetch = vi.fn(() => Promise.resolve(okResponse(serverPayload(serverData, 2))));

    const ok = await CGSync.push();
    expect(ok).toBe(true);
    expect(CGStore.getTombstones('courses')).toEqual([]); // 已安全清理
  });

  test('服务器数据仍含墓碑 id（另一设备保留了）→ 墓碑保留不清理', async () => {
    const c = CGStore.addCourse({ id: 'c1', name: '要删', progress: 0 });
    CGStore.removeCourse(c.id);
    expect(CGStore.getTombstones('courses')).toContain('c1');

    // 服务器返回的数据里仍含 c1（说明删除没被吸收，不确定安全性 → 保守不清）
    const serverData = emptyBusiness({ courses: [{ id: 'c1', name: '要删', progress: 0 }] });
    globalThis.fetch = vi.fn(() => Promise.resolve(okResponse(serverPayload(serverData, 2))));

    // 注意：push 成功采纳服务器数据后，c1 又回到本地（服务器恢复），但墓碑保留，
    // 下一次合并仍会剔除它 —— 防止"复活—删除—复活"抖动
    await CGSync.push();
    expect(CGStore.getTombstones('courses')).toContain('c1');
  });
});

describe('跨标签页：storage 事件不触发本页 push（Test5 防循环）', () => {
  test('另一页签写 localStorage → 本页刷新缓存但不产生额外网络请求', () => {
    CGStore.addSport({ id: 's1', name: '跑步' });
    globalThis.fetch = vi.fn(() => Promise.resolve(okResponse(serverPayload(emptyBusiness(), 1))));

    // 模拟另一标签页把同份数据写回 localStorage
    localStorage.setItem(CGStore.KEY, JSON.stringify(CGStore.get()));
    window.dispatchEvent(new StorageEvent('storage', { key: CGStore.KEY }));

    expect(CGStore.get().sports).toHaveLength(1); // 缓存已刷新
    expect(globalThis.fetch).not.toHaveBeenCalled(); // 没有无谓 push
  });
});

describe('pull 成功后防自激推送（B1 回归）', () => {
  test('pull 采纳服务器数据后，越过 persist+防抖窗口也不出现第二次请求', async () => {
    // 全局 fake timers 已由 beforeEach 启好，无需在本测试内再切换
    // 本地已同步（无 pending / 无脏集合），走 Case A 语义的显式拉取
    CGStore.set(emptyBusiness({ user: { name: '云端用户' } }), { kind: 'REMOTE', revision: 5 });
    globalThis.fetch = vi.fn(() =>
      Promise.resolve(okResponse(serverPayload(
        emptyBusiness({ user: { name: '云端新数据', totalDays: 9 } }), 6
      ), 'etag-zz'))
    );

    const ok = await CGSync.pull();
    expect(ok).toBe(true);
    // 只发出 GET（rev6 > 本地 5 → 采纳服务器数据 = REMOTE 应用）
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);

    // 让 100ms persist 与 400ms push 防抖都过去 —— 若 remote 标记丢失，
    // 每次采纳服务器数据后都会排出新一轮 push（自激循环）
    await vi.advanceTimersByTimeAsync(800);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(globalThis.fetch.mock.calls[0][1].method).toBe('GET');
  });
});
