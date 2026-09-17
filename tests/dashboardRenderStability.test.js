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
const bootPages = ['workbench.html', 'goals.html', 'ai.html'].map(function (file) {
  return readFileSync(file, 'utf8');
});

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

  it('uses synchronous shell bootstrap without app-booting', () => {
    for (const html of [...bootPages, statsHtml]) {
      expect(html).not.toContain('app-booting');
      expect(html).toContain('<script src="js/shellBootstrap.js"></script>');
      expect(html).not.toContain('@view-transition');
    }
  });

  it('preloads the sidebar icon font on non-workbench pages', () => {
    const preload = 'fa-solid-900.woff2';
    expect(statsHtml).toContain(preload);
    expect(bootPages[0]).toContain(preload);
    expect(bootPages[1]).toContain(preload);
  });

  it('does not use app-booting visual hiding', () => {
    expect(sharedCss).not.toContain('app-booting');

    const script = readFileSync('js/userChrome.js', 'utf8');
    expect(script).not.toContain("classList.remove('app-booting')");
    expect(script).not.toContain('document.fonts.load');
    expect(script).toContain("nameEl.textContent !== name");
  });

  it('bootstraps final shell values without visible default placeholders', () => {
    const shell = readFileSync('js/shellBootstrap.js', 'utf8');
    expect(shell).toContain("localStorage.getItem('cg_user')");
    expect(shell).not.toContain('chenguangData');
    expect(shell).not.toContain('fetch(');
    expect(shell).toContain('weekLabel()');
    expect(statsHtml).toContain('<strong id="sidebarUserName"></strong>');
    expect(statsHtml).toContain('<div class="date" id="rangeLabel"></div>');
    expect(bootPages[0]).toContain('<strong id="sidebarUserName"></strong>');
    expect(bootPages[1]).toContain('<strong id="sidebarUserName"></strong>');
  });
});
