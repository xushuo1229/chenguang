'use strict';

import { createAgentHomeService } from './agentHomeService.js';
import { createAgentHomeView } from './agentHomeView.js';

function initAgentHome() {
  const target = document.getElementById('agentHomeRoot');
  if (!target) return null;
  const service = createAgentHomeService();
  const view = createAgentHomeView({ target, service });
  view.load();
  return view;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAgentHome, { once: true });
} else {
  initAgentHome();
}

export { initAgentHome };
