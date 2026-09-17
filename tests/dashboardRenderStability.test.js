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
const dashboardPages = ['today.html', 'stats.html', 'goals.html', 'workbench.html', 'ai.html'].map(function (file) {
  return readFileSync(file, 'utf8');
});
const viteConfig = readFileSync('vite.config.js', 'utf8');

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

  it('starts Stats dashboard and overview shell before page JS paint', () => {
    const dashboard = statsHtml.match(/<div class="stats-dashboard" id="statsDashboard"[^>]*>/);
    expect(dashboard?.[0]).not.toContain('hidden');
    expect(statsHtml).toContain('<div class="stat-value">0 / 7<span class="unit">天</span>');
    expect(readFileSync('pages/stats.js', 'utf8')).not.toContain('await nextPaint()');
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

  it('loads shell before sidebar and never blocks between sidebar and main', () => {
    for (const html of dashboardPages) {
      expect(html).not.toContain('app-booting');
      const headEnd = html.indexOf('</head>');
      const bodyStart = html.indexOf('<body');
      const body = html.slice(bodyStart);
      expect(html.slice(0, headEnd)).toContain('<script src="js/shellBootstrap.js"></script>');
      expect(body).not.toContain('<script src="js/shellBootstrap.js"></script>');
      expect(body.indexOf('<aside class="sidebar">')).toBeGreaterThanOrEqual(0);
      expect(body.indexOf('<script>cgShellBootstrap.render();</script>'))
        .toBeGreaterThan(body.indexOf('<aside class="sidebar">'));
      expect(body.indexOf('<main class="main">'))
        .toBeGreaterThan(body.indexOf('<script>cgShellBootstrap.render();</script>'));
      expect(html).not.toContain('@view-transition');
    }
  });

  it('registers dashboard pages and bootstrap script in the production MPA build', () => {
    for (const file of ['today.html', 'stats.html', 'goals.html', 'workbench.html', 'ai.html']) {
      expect(viteConfig).toContain(`${file.replace('.html', '')}: resolve(__dirname, '${file}')`);
    }
    expect(viteConfig).toContain("fileName: 'js/shellBootstrap.js'");
  });

  it('preloads the sidebar icon font on non-workbench pages', () => {
    const preload = 'fa-solid-900.woff2';
    expect(statsHtml).toContain(preload);
    expect(dashboardPages[1]).toContain(preload);
    expect(dashboardPages[2]).toContain(preload);
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
    expect(dashboardPages[0]).toContain('<strong id="sidebarUserName"></strong>');
    expect(dashboardPages[3]).toContain('<strong id="sidebarUserName"></strong>');
  });
});
