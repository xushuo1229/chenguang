import { describe, expect, it } from 'vitest';
import goalsHtml from '../goals.html?raw';
import statsHtml from '../stats.html?raw';
import aiHtml from '../ai.html?raw';
import workbenchHtml from '../workbench.html?raw';

const PAGES = [
  ['goals.html', goalsHtml, 'goals'],
  ['stats.html', statsHtml, 'stats'],
  ['ai.html', aiHtml, 'ai'],
  ['workbench.html', workbenchHtml, 'home'],
];

const ROUTES = {
  home: 'workbench.html',
  goals: 'goals.html',
  stats: 'stats.html',
  ai: 'ai.html',
};

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

    expect(parsed.querySelector(`.sidebar a[data-nav="${active}"]`)?.classList.contains('active')).toBe(true);
  });
});
