/**
 * 晨光自律台 · 前端数据层 store.js 单元测试
 * ============================================================
 * 覆盖：空数据结构、各集合 CRUD、打卡/待办切换、统计汇总、
 * 旧版 cg_* 键迁移、set vs merge 语义、脏集合追踪。
 * 运行：npm test（Vitest，jsdom 环境）
 */
import { describe, test, expect, beforeEach } from 'vitest';
import CGStore from '../js/store.js';

// 每个测试前重置本地存储与内存缓存，避免相互污染
beforeEach(() => {
  localStorage.clear();
  CGStore.resetData();
  CGStore.clearDirtyCategories();
});

describe('空数据与结构', () => {
  test('get() 返回含 user 与 7 个空集合的默认结构', () => {
    const d = CGStore.get();
    expect(d.user).toEqual({
      name: '',
      startDate: '',
      totalDays: 0,
      continuousDays: 0,
    });
    ['checkins', 'sports', 'readings', 'courses', 'english', 'todos', 'focus'].forEach((k) => {
      expect(Array.isArray(d[k])).toBe(true);
      expect(d[k]).toHaveLength(0);
    });
  });

  test('uid() 生成不重复的 id', () => {
    const a = CGStore.uid();
    const b = CGStore.uid();
    expect(a).not.toBe(b);
  });
});

describe('各集合 CRUD', () => {
  test('课程：新增/更新/删除', () => {
    const c = CGStore.addCourse({ name: '高数', progress: 50 });
    expect(c.id).toBeTruthy();
    expect(c.name).toBe('高数');

    const updated = CGStore.updateCourse(c.id, { progress: 80 });
    expect(updated.progress).toBe(80);

    expect(CGStore.removeCourse(c.id)).toBe(true);
    expect(CGStore.getCourses()).toHaveLength(0);
  });

  test('运动/阅读/英语/专注：新增并累加统计', () => {
    CGStore.addSport({ name: '跑步', calories: 200, duration: 30 });
    CGStore.addReading({ bookName: '三体', pages: 120, totalPages: 300 });
    CGStore.addEnglish({ words: 50, minutes: 20 });
    CGStore.addFocus({ minutes: 45, task: '复习' });
    CGStore.addFocus({ minutes: 25, task: '背单词' });

    expect(CGStore.getSports()).toHaveLength(1);
    expect(CGStore.totalPagesRead()).toBe(120);
    expect(CGStore.totalFocusMinutes()).toBe(70);
    expect(CGStore.totalBooksFinished()).toBe(0); // 未读满 300 页
  });

  test('阅读：读完标记计入 totalBooksFinished', () => {
    CGStore.addReading({ bookName: '小书', pages: 100, totalPages: 100 });
    expect(CGStore.totalBooksFinished()).toBe(1);
  });
});

describe('打卡', () => {
  test('addCheckin 重复日期不新增，只更新状态', () => {
    CGStore.addCheckin('2026-09-09', 'done');
    CGStore.addCheckin('2026-09-09', 'done');
    expect(CGStore.getCheckins()).toHaveLength(1);
    expect(CGStore.isCheckedIn('2026-09-09')).toBe(true);
    expect(CGStore.isCheckedIn('2026-09-08')).toBe(false);
  });
});

describe('待办', () => {
  test('toggleTodo 切换完成状态', () => {
    const t = CGStore.addTodo({ text: '写作业' });
    expect(t.done).toBe(false);
    CGStore.toggleTodo(t.id);
    expect(CGStore.getTodos()[0].done).toBe(true);
  });
});

describe('旧版 cg_* 键迁移', () => {
  test('在统一 key 未写入前，旧课程键按进度折算迁移', () => {
    localStorage.setItem('cg_courses', JSON.stringify([
      { name: '计算机', total: 10, learned: 5 },
    ]));
    localStorage.setItem('cg_todos', JSON.stringify([{ text: '旧任务', done: false }]));
    // 触发 store 的 storage 监听，清空内存缓存以便重新加载迁移
    window.dispatchEvent(new StorageEvent('storage', { key: CGStore.KEY }));

    const d = CGStore.get();
    expect(d.courses).toHaveLength(1);
    expect(d.courses[0].name).toBe('计算机');
    expect(d.courses[0].progress).toBe(50); // 5/10
    expect(d.todos).toHaveLength(1);
    expect(d.todos[0].text).toBe('旧任务');
    expect(d.__migrated).toBe(true); // 已标记迁移完成
  });
});

describe('set vs merge', () => {
  test('set 完全替换整份数据', () => {
    CGStore.addCourse({ name: 'A' });
    CGStore.set({ user: { name: '' }, courses: [{ id: 'x', name: 'B', progress: 0 }] });
    expect(CGStore.getCourses()).toHaveLength(1);
    expect(CGStore.getCourses()[0].name).toBe('B');
  });

  test('merge 只覆盖指定字段，其余保留', () => {
    CGStore.addCourse({ id: 'c1', name: 'A', progress: 10 });
    CGStore.merge({ courses: CGStore.getCourses().map((c) => ({ ...c, progress: 99 })) });
    expect(CGStore.getCourses()[0].progress).toBe(99);
    // 只 merge 了 courses，其它集合仍为空数组
    expect(Array.isArray(CGStore.get().sports)).toBe(true);
  });
});

describe('脏集合追踪', () => {
  test('新增集合后记录脏标记，clear 后清空', () => {
    CGStore.addSport({ name: '游泳' });
    expect(CGStore.getDirtyCategories()).toContain('sports');
    CGStore.clearDirtyCategories();
    expect(CGStore.getDirtyCategories()).toHaveLength(0);
  });
});

describe('onUpdate 事件', () => {
  test('数据变更触发 chenguang:update 回调', () => {
    let fired = 0;
    const unsub = CGStore.onUpdate(() => { fired++; });
    CGStore.addSport({ name: '跑步' });
    // flushPersist 由 100ms 防抖定时器触发，等待其派发事件
    return new Promise((resolve) => {
      setTimeout(() => {
        expect(fired).toBeGreaterThan(0);
        unsub();
        resolve();
      }, 150);
    });
  });
});

