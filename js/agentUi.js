/** Zeno Agent OS UI primitives. DOM-only and XSS-safe by default. */

const ICONS = {
  compass: 'fas fa-compass',
  activity: 'fas fa-wave-square',
  target: 'fas fa-bullseye',
  brain: 'fas fa-brain',
  timeline: 'fas fa-clock-rotate-left',
  warning: 'fas fa-triangle-exclamation',
  empty: 'fas fa-seedling',
  check: 'fas fa-check',
};

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = String(text);
  return node;
}

function card({ title, subtitle, badge, tone = '', body }) {
  const host = element('article', `agent-card ${tone}`.trim());
  const header = element('div', 'agent-card-header');
  const label = element('div');
  label.appendChild(element('h2', 'agent-card-title', title));
  if (subtitle) label.appendChild(element('p', 'agent-list-meta', subtitle));
  header.appendChild(label);
  if (badge) header.appendChild(element('span', `agent-badge ${tone}`.trim(), badge));
  const content = element('div', 'agent-card-body');
  if (body) content.appendChild(body);
  host.append(header, content);
  return host;
}

function metric({ label, value, note, tone = '' }) {
  const host = element('div', `agent-metric ${tone}`.trim());
  host.appendChild(element('span', 'agent-metric-label', label));
  host.appendChild(element('strong', 'agent-metric-value', value));
  if (note) host.appendChild(element('span', 'agent-metric-note', note));
  return host;
}

function metrics(items = []) {
  const fragment = document.createDocumentFragment();
  items.forEach((item) => fragment.appendChild(metric(item)));
  return fragment;
}

function listItem({ title, meta, progress }) {
  const item = element('article', 'agent-list-item');
  item.appendChild(element('h3', 'agent-list-title', title));
  if (meta) item.appendChild(element('p', 'agent-list-meta', meta));
  if (Number.isFinite(progress)) {
    const track = element('div', 'agent-progress');
    const fill = element('span', 'agent-progress-fill');
    fill.style.transform = 'scaleX(0)';
    fill.style.width = `${Math.max(0, Math.min(100, progress))}%`;
    item.appendChild(track);
    track.appendChild(fill);
    requestAnimationFrame(() => { fill.style.transform = 'scaleX(1)'; });
  }
  return item;
}

function list(items = [], emptyText = '暂无数据') {
  const host = element('div', 'agent-list');
  if (!items.length) {
    host.appendChild(emptyState({ text: emptyText, icon: 'empty' }));
    return host;
  }
  items.forEach((item) => host.appendChild(listItem(item)));
  return host;
}

function status({ text, busy = false, meta = 'Runtime' }) {
  const host = element('div', 'agent-status');
  host.appendChild(element('span', `agent-status-dot${busy ? ' busy' : ''}`));
  host.appendChild(element('span', 'agent-status-label', text));
  host.appendChild(element('span', 'agent-status-meta', meta));
  return host;
}

function emptyState({ text, icon = 'empty' }) {
  const host = element('div', 'agent-state');
  const iconHost = element('span', 'agent-state-icon');
  iconHost.appendChild(element('i', ICONS[icon] || ICONS.empty));
  host.append(iconHost, element('p', null, text));
  return host;
}

function errorState({ title, detail }) {
  const host = emptyState({ text: title, icon: 'warning' });
  host.classList.add('error');
  host.setAttribute('role', 'alert');
  if (detail) host.appendChild(element('p', 'agent-list-meta', detail));
  return host;
}

function loadingState({ text = '正在加载 Agent 工作区...' } = {}) {
  const host = element('div', 'agent-state');
  const skeleton = element('div', 'agent-skeleton');
  for (let index = 0; index < 4; index += 1) skeleton.appendChild(element('span', 'agent-skeleton-row'));
  host.appendChild(skeleton);
  host.setAttribute('aria-busy', 'true');
  host.setAttribute('aria-live', 'polite');
  host.appendChild(element('p', 'agent-list-meta', text));
  return host;
}

function timeline(items = [], emptyText = '暂无执行记录') {
  const host = element('div', 'agent-timeline');
  if (!items.length) {
    host.appendChild(emptyState({ text: emptyText }));
    return host;
  }
  items.forEach((item) => {
    const node = element('article', 'agent-timeline-item');
    node.appendChild(element('h3', 'agent-list-title', item.title));
    if (item.meta) node.appendChild(element('p', 'agent-list-meta', item.meta));
    if (item.badge) node.appendChild(element('span', `agent-badge ${item.tone || ''}`.trim(), item.badge));
    host.appendChild(node);
  });
  return host;
}

export {
  ICONS,
  card,
  metric,
  metrics,
  list,
  listItem,
  status,
  emptyState,
  errorState,
  loadingState,
  timeline,
};
