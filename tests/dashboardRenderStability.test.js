import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import statsHtml from '../stats.html?raw';

const css = readFileSync('assets/calm-dawn-1to1.css', 'utf8');
const sharedCss = readFileSync('css/shared.css', 'utf8');
const pageShellCss = [
  readFileSync('assets/calm-dawn-pro.css', 'utf8'),
  readFileSync('assets/workbench-pro.css', 'utf8'),
  readFileSync('assets/calm-dawn-fusion.css', 'utf8'),
].join('\n');
const marker = 'Dashboard load stability';
const rules = css.slice(css.indexOf(marker));

describe('dashboard render stability', () => {
  it('skips load animations and expensive backdrop sampling for Goals, Stats, and AI', () => {
    expect(rules).toContain('background-attachment: scroll');
    expect(rules).toContain('backdrop-filter: none');
    expect(rules).toContain('scrollbar-gutter: stable');
    expect(rules).toContain('animation: none !important');
    expect(rules).toContain('.dashboard-shell .main .goal-card');
    expect(rules).toContain('.dashboard-shell .main .stats-section');
    expect(rules).toContain('.dashboard-shell .main .coach-card');
  });

  it('keeps Stats dashboard hidden until its first complete render', () => {
    const dashboard = statsHtml.match(/<div class="stats-dashboard" id="statsDashboard"[^>]*>/);
    expect(dashboard?.[0]).toContain('hidden');
  });

  it('removes page shell and first-load card entrance animations', () => {
    expect(pageShellCss).not.toContain('uiProRise');
    expect(pageShellCss).not.toContain('wbProEnter');
    expect(pageShellCss).not.toContain('fd-rise');
    expect(pageShellCss).not.toContain('animation: uiProRise');
  });

  it('keeps navigation as a stable MPA without route transitions or SPA routers', () => {
    expect(sharedCss).not.toContain('@view-transition');
    expect(statsHtml).not.toContain('js/router.js');
    expect(statsHtml).not.toContain('js/navigation.js');
  });
});
