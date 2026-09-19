import { describe, expect, it } from 'vitest';
import { homeAuthHref, safeRelativeTarget } from '../js/utils/authNavigation.js';
import todayPageSrc from '../pages/today.js?raw';
import goalsPageSrc from '../pages/goals.js?raw';
import statsPageSrc from '../pages/stats.js?raw';
import aiPageSrc from '../pages/ai.js?raw';
import indexPageSrc from '../pages/index.js?raw';

describe('auth navigation', () => {
  it('only allows protected same-origin pages as redirect targets', () => {
    expect(safeRelativeTarget('ai.html?tab=coach')).toBe('ai.html?tab=coach');
    expect(safeRelativeTarget('https://example.com/workbench.html')).toBe('');
    expect(safeRelativeTarget('index.html')).toBe('');
    expect(safeRelativeTarget('javascript:alert(1)')).toBe('');
  });

  it('builds a home login link that preserves the protected page', () => {
    expect(homeAuthHref('ai.html')).toBe('index.html?auth=login&next=ai.html');
    expect(homeAuthHref('goals.html?filter=all')).toBe('index.html?auth=login&next=goals.html%3Ffilter%3Dall');
  });

  it('protected pages redirect through the home login modal', () => {
    [todayPageSrc, goalsPageSrc, statsPageSrc, aiPageSrc].forEach((source) => {
      expect(source).toContain('homeAuthHref');
      expect(source).not.toContain("window.location.href = 'index.html'");
    });
    expect(indexPageSrc).toContain("openModal('modalLogin')");
  });
});
