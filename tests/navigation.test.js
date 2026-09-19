import { describe, expect, it } from 'vitest';
import goalsHtml from '../goals.html?raw';
import statsHtml from '../stats.html?raw';
import aiHtml from '../ai.html?raw';
import workbenchHtml from '../workbench.html?raw';
import todayHtml from '../today.html?raw';
import agentHomeHtml from '../agent-home.html?raw';

const PAGES = [
  ['goals.html', goalsHtml, 'goals'],
  ['stats.html', statsHtml, 'stats'],
  ['ai.html', aiHtml, 'ai'],
  ['workbench.html', workbenchHtml, 'home'],
  ['today.html', todayHtml, ''],
  ['agent-home.html', agentHomeHtml, ''],
];

const ROUTES = {
  home: 'workbench.html',
  goals: 'goals.html',
  stats: 'stats.html',
  ai: 'ai.html',
  course: 'workbench.html?view=course',
  manage: 'workbench.html?view=manage',
  profile: 'workbench.html?view=profile',
};

// TECH_DEBT #6 决策：全部页面统一为同一组 7 项 tabbar（今日计划 / Agent Home 保持侧边栏专属入口）。
const TABBAR_ORDER = ['home', 'goals', 'stats', 'ai', 'course', 'manage', 'profile'];

describe('dashboard navigation', () => {
  it.each(PAGES)('%s keeps goal, stats, and AI links stable', (page, html, active) => {
    const parsed = new DOMParser().parseFromString(html, 'text/html');

    for (const [key, href] of Object.entries(ROUTES)) {
      const desktop = parsed.querySelector(`.sidebar a[data-nav="${key}"]`);
      if (page === 'workbench.html' && key === 'home') continue;
      expect(desktop, `${page} desktop ${key}`).toBeTruthy();
      expect(desktop.getAttribute('href')).toBe(href);
    }

    for (const key of ['goals', 'stats', 'ai']) {
      const mobile = parsed.querySelector(`.mobile-tabbar a[data-nav="${key}"]`);
      expect(mobile, `${page} mobile ${key}`).toBeTruthy();
      expect(mobile.getAttribute('href')).toBe(ROUTES[key]);
    }

    if (active) {
      // today / agent-home 的高亮项（今日计划 / Agent Home）不带 data-nav，由下方 tabbar 用例单独约束
      expect(parsed.querySelector(`.sidebar a[data-nav="${active}"]`)?.classList.contains('active')).toBe(true);
    }
  });

  it.each(PAGES)('%s renders the unified 7-item mobile tabbar in canonical order', (page, html, active) => {
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    const items = [...parsed.querySelectorAll('.mobile-tabbar a[data-nav]')];

    expect(items.map((a) => a.getAttribute('data-nav'))).toEqual(TABBAR_ORDER);

    for (const item of items) {
      const key = item.getAttribute('data-nav');
      // workbench 页内切换项由 JS preventDefault 秒切，home 保留 '#' 自引用；
      // 其余页面一律使用规范深链。
      const expected = page === 'workbench.html' && key === 'home' ? '#' : ROUTES[key];
      expect(item.getAttribute('href'), `${page} tabbar ${key}`).toBe(expected);
    }

    const activeItems = items.filter((a) => a.classList.contains('active')).map((a) => a.getAttribute('data-nav'));
    if (active) {
      expect(activeItems).toEqual([active]);
    } else {
      // today / agent-home 不在 tabbar 中，任何项都不应高亮
      expect(activeItems).toEqual([]);
    }
  });
});
