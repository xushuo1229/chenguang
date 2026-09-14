import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync('assets/calm-dawn-1to1.css', 'utf8');
const marker = 'Dashboard load stability';
const rules = css.slice(css.indexOf(marker));

describe('dashboard render stability', () => {
  it('skips load animations and expensive backdrop sampling for Goals, Stats, and AI', () => {
    expect(rules).toContain('background-attachment: scroll');
    expect(rules).toContain('backdrop-filter: none');
    expect(rules).toContain('animation: none !important');
    expect(rules).toContain('.dashboard-shell .main .goal-card');
    expect(rules).toContain('.dashboard-shell .main .stats-section');
    expect(rules).toContain('.dashboard-shell .main .coach-card');
  });
});
