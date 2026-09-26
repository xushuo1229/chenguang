import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import goalsHtml from '../goals.html?raw';
import aiHtml from '../ai.html?raw';
import indexHtml from '../index.html?raw';
import loginHtml from '../login.html?raw';
import statsHtml from '../stats.html?raw';
import workbenchHtml from '../workbench.html?raw';
import todayHtml from '../today.html?raw';
import agentHomeHtml from '../agent-home.html?raw';

const PAGES = [
  ['login.html', loginHtml],
  ['index.html', indexHtml],
  ['workbench.html', workbenchHtml],
  ['stats.html', statsHtml],
  ['goals.html', goalsHtml],
  ['ai.html', aiHtml],
];

describe('Zeno brand integration', () => {
  it.each(PAGES)('%s activates the shared AI OS design system', (page, html) => {
    expect(html).toContain('data-brand="xingzhixing"');
    expect(html).toContain('<link rel="stylesheet" href="/xingzhixing.css">');
    expect(html).toContain('/brand/favicon.svg');
    expect(html).not.toMatch(/<link rel="icon" href="assets\/logo\.svg"/);
  });

  it('uses the Zeno positioning and icon system', () => {
    expect(loginHtml).toContain('理解自己，');
    expect(indexHtml).toContain('Zeno');
    expect(indexHtml).toContain('/design/xz-hero.svg');
    expect(aiHtml).toContain('个人 Agent');
    for (const [, html] of [[null, workbenchHtml], [null, statsHtml], [null, goalsHtml], [null, aiHtml]]) {
      expect(html).toContain('/brand/logo-icon.svg');
      expect(html).toContain('Personal Learning Agent OS');
    }
  });

  it('removes sunrise branding from the current product shell', () => {
    for (const [, html] of PAGES) {
      expect(html).not.toContain('class="wb-brand-mark">☀');
      expect(html).not.toContain('<i class="fas fa-sun"></i>知行');
      expect(html).not.toContain('知行');
      expect(html).not.toContain('晨光自律台');
      expect(html).toContain('Zeno');
    }
  });

  it('uses Personal Agent naming across user-facing shells', () => {
    const personalPages = [
      ...PAGES,
      ['today.html', todayHtml],
      ['agent-home.html', agentHomeHtml],
    ];
    for (const [page, html] of personalPages) {
      expect(html, page).not.toMatch(/AI\s*教练|AI\s*Coach/);
    }
  });

  it('installs the new PWA metadata', () => {
    const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));
    expect(manifest.name).toBe('Zeno · Personal Learning Agent Operating System');
    expect(manifest.theme_color).toBe('#0B1220');
    expect(manifest.background_color).toBe('#F8FAFC');
    expect(manifest.icons[0].src).toBe('/brand/favicon.svg');
  });
});
