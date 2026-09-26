import { beforeEach, describe, expect, test } from 'vitest';
import {
  card,
  emptyState,
  errorState,
  list,
  listItem,
  loadingState,
  metrics,
  status,
  timeline,
} from '../js/agentUi.js';

describe('Agent OS UI primitives', () => {
  beforeEach(() => {
    document.body.textContent = '';
  });

  test('renders cards, metrics and status without HTML injection', () => {
    const host = card({
      title: '<img src=x onerror=alert(1)>',
      subtitle: 'evidence bound',
      badge: 'read only',
      body: metrics([
        { label: 'Tasks', value: '2/4', note: 'Today' },
        { label: 'Focus', value: '45m', note: 'Current' },
      ]),
    });
    document.body.appendChild(host);

    expect(host.className).toContain('agent-card');
    expect(host.querySelectorAll('img')).toHaveLength(0);
    expect(host.textContent).toContain('<img src=x');
    expect(host.querySelectorAll('.agent-metric')).toHaveLength(2);
  });

  test('renders empty, error, loading and timeline states accessibly', () => {
    const empty = emptyState({ text: 'No signals' });
    const failure = errorState({ title: 'Runtime unavailable', detail: 'safe message' });
    const loading = loadingState({ text: 'Loading' });
    const events = timeline([
      { title: 'Assessment', meta: '8 min', badge: 'plan', tone: 'accent' },
    ], 'empty timeline');
    document.body.append(empty, failure, loading, events);

    expect(empty.className).toContain('agent-state');
    expect(failure.getAttribute('role')).toBe('alert');
    expect(loading.getAttribute('aria-busy')).toBe('true');
    expect(loading.getAttribute('aria-live')).toBe('polite');
    expect(events.querySelectorAll('.agent-timeline-item')).toHaveLength(1);
  });

  test('clamps progress and falls back to an empty state', () => {
    const items = list([
      { title: 'Weak node', meta: 'mastery 0.20', progress: 180 },
      { title: 'Strong node', meta: 'mastery 0.90', progress: -5 },
    ], 'nothing');
    document.body.appendChild(items);

    const fills = [...items.querySelectorAll('.agent-progress-fill')];
    expect(fills.map((fill) => fill.style.width)).toEqual(['100%', '0%']);
  });

  test('exposes stable Phase 37 integration points', () => {
    expect(document.getElementById('agentHistoryPanel')).toBeNull();
    expect(document.getElementById('agentConversationPanel')).toBeNull();
  });
});
