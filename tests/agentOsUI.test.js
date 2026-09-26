import { describe, expect, it } from 'vitest';
import aiHtml from '../ai.html?raw';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const osCss = readFileSync(resolve(process.cwd(), 'css/agent-os.css'), 'utf8');

function parse(html) {
  return new DOMParser().parseFromString(html, 'text/html');
}

describe('Agent Operating System shell', () => {
  it('uses an agent-native three-region architecture', () => {
    const document = parse(aiHtml);

    expect(document.getElementById('agentHistoryPanel').className).toContain('agent-rail');
    expect(document.getElementById('agentConversationPanel').className).toContain('agent-main');
    expect(document.getElementById('agentContextPanel').className).toContain('agent-context');
    expect(document.getElementById('agentCommandBar')).toBeTruthy();
    expect(document.getElementById('agentExecutionTimeline')).toBeTruthy();
    expect(document.getElementById('personalAgentExperience').closest('.agent-canvas')).toBeTruthy();
  });

  it('removes chat-first IA and exposes command-first navigation', () => {
    const document = parse(aiHtml);

    expect(document.querySelector('.coach-ia')).toBeNull();
    expect(document.querySelector('.chat-first')).toBeNull();
    expect(document.getElementById('agentCommandBar').getAttribute('aria-label')).toBe('Universal Command Bar');
    expect(document.querySelector('.agent-canvas').getAttribute('aria-label')).toBe('Dynamic Workspace Canvas');
  });

  it('keeps evidence and action boundaries visible', () => {
    const document = parse(aiHtml);
    const text = document.body.textContent;

    expect(text).toContain('Evidence Bound');
    expect(text).toContain('Read Only');
    expect(text).toContain('Execution Timeline');
    expect(text).toContain('Gated');
    expect(text).toContain('Context Intelligence');
    expect(text).toContain('Deterministic');
  });

  it('loads a scoped design layer with responsive and reduced-motion rules', () => {
    expect(aiHtml).toContain('/css/agent-os.css');
    expect(aiHtml).toContain('data-page="agent"');
    expect(osCss).toContain('@media (max-width: 1024px)');
    expect(osCss).toContain('@media (max-width: 860px)');
    expect(osCss).toContain('@media (max-width: 480px)');
    expect(osCss).toContain('prefers-reduced-motion');
    expect(osCss).not.toMatch(/react|vue|tailwind/i);
  });
});
