import { describe, expect, it } from 'vitest';
import aiHtml from '../ai.html?raw';

function parse(html) {
  return new DOMParser().parseFromString(html, 'text/html');
}

describe('AI Coach workspace IA', () => {
  it('exposes the six coach modules in the canonical order', () => {
    const document = parse(aiHtml);
    const items = [...document.querySelectorAll('.coach-ia-item')];

    expect(items.map((item) => item.childNodes[0].textContent.trim())).toEqual([
      'Agent Home',
      'Conversation',
      'Insight',
      'Today',
      'Mastery',
      'Action',
    ]);
    expect(items.map((item) => item.getAttribute('href'))).toEqual([
      'agent-home.html',
      '#coachConversation',
      '#aiInsightPanels',
      '#cardToday',
      'agent-home.html',
      'agent-home.html',
    ]);
  });

  it('keeps workspace navigation available outside the dashboard state', () => {
    const document = parse(aiHtml);
    const navigation = document.querySelector('.coach-ia');
    const dashboard = document.getElementById('coachDashboard');

    expect(navigation.getAttribute('aria-label')).toBe('AI Coach 工作区');
    expect(dashboard.contains(navigation)).toBe(false);
    expect(dashboard.compareDocumentPosition(navigation) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
  });

  it('binds module anchors and responsive layout without new frameworks', () => {
    const document = parse(aiHtml);

    expect(document.getElementById('cardToday')).toBeTruthy();
    expect(document.getElementById('aiInsightPanels')).toBeTruthy();
    expect(document.getElementById('coachConversation')).toBeTruthy();
    expect(aiHtml).toContain('@media (max-width: 860px)');
    expect(aiHtml).not.toMatch(/react|vue|tailwind/i);
  });
});
