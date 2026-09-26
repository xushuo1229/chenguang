import { describe, expect, it } from 'vitest';
import aiHtml from '../ai.html?raw';

function parse(html) {
  return new DOMParser().parseFromString(html, 'text/html');
}

describe('Personal Agent workspace IA', () => {
  it('exposes the agent-native workspace regions in the canonical order', () => {
    const document = parse(aiHtml);
    const regions = [
      document.getElementById('agentHistoryPanel'),
      document.getElementById('agentConversationPanel'),
      document.getElementById('agentContextPanel'),
    ];

    expect(regions.every(Boolean)).toBe(true);
    expect(regions.map((region) => region.getAttribute('aria-label'))).toEqual([
      'Agent Identity and Execution',
      'Agent Workspace Canvas',
      'Context Intelligence',
    ]);
  });

  it('keeps workspace shell independent from the legacy dashboard', () => {
    const document = parse(aiHtml);
    const workspace = document.getElementById('agentWorkspace');
    const dashboard = document.getElementById('coachDashboard');

    expect(workspace.getAttribute('aria-label')).toBe('Agent Operating System');
    expect(dashboard.contains(workspace)).toBe(false);
    expect(dashboard.contains(workspace)).toBe(false);
  });

  it('binds module anchors and responsive layout without new frameworks', () => {
    const document = parse(aiHtml);

    expect(document.getElementById('cardToday')).toBeTruthy();
    expect(document.getElementById('aiInsightPanels')).toBeTruthy();
    expect(document.getElementById('agentConversationPanel')).toBeTruthy();
    expect(aiHtml).toContain('@media (max-width: 860px)');
    expect(aiHtml).not.toMatch(/react|vue|tailwind/i);
  });
});
