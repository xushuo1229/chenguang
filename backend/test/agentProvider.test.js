'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const {
  ENVELOPE_FIELDS,
  FAIL_REASONS,
  PROVIDER_PROMPT_VERSION,
  buildFailedEnvelope,
  buildOkEnvelope,
  validateProviderInput,
  validateProviderOutput,
} = require('../src/services/agentProvider/providerContract');
const { getAgentProvider, resolveAgentProvider, REGISTRY } = require('../src/services/agentProvider/providerRegistry');
const provider = require('../src/services/agentProvider/openaiCompatibleProvider');
const { toProviderPayload } = require('../src/services/agentFirewall/contextFirewall');
const { FALLBACK_REASONS, OUTPUT_SCHEMA_VERSION, validateOutputContract } = require('../src/services/agentOutputValidator/outputContract');
const { validateEvidenceBinding } = require('../src/services/agentEvidenceBinding/evidenceBindingContract');
const { validateSemanticValidation } = require('../src/services/agentSemanticValidator/semanticValidatorContract');
const { buildLlmContext } = require('../src/services/agentFirewall/contextFirewall');
const ApiError = require('../src/utils/ApiError');

// ---------- 测试夹具：与 agentLlmContextFirewall.test.js 同构的最小合法三段上下文 ----------

function learningContext() {
  return {
    version: 'learning-context-v1',
    userId: 7,
    actionLevel: 'insight_only',
    readOnly: true,
    permissions: { read: ['deterministic_insights'], write: [] },
    courses: { source: 'cgstore.sync.courses', authority: 'source', type: 'source_projection', confidence: 1 },
  };
}

function evidenceFixture(value = 80) {
  return { source: 'behavior_adapter', authority: 'deterministic_projection', metric: 'focus_minutes', period: 'current_3d', value };
}

function insightsFixture() {
  return {
    version: 'agent-insight-v1',
    userId: 7,
    scope: 'agent_home',
    insights: [{
      id: 'focus-trend-7d',
      type: 'focus_increase',
      title: '过去 7 天专注趋势上升。',
      explanation: '最近 3 天日均专注时间高于此前 4 天。',
      source: 'behavior_adapter',
      authority: 'deterministic_projection',
      evidence: [evidenceFixture()],
      confidence: 1,
      actionLevel: 'insight_only',
    }],
    metadata: { readOnly: true, actionLevel: 'insight_only', contextVersion: 'learning-context-v1' },
  };
}

function reasoningFixture() {
  return {
    version: 'agent-reasoning-v1',
    userId: 7,
    scope: 'agent_home',
    available: true,
    explanations: [{
      insightId: 'focus-trend-7d',
      insightType: 'focus_increase',
      title: '为什么出现专注趋势观察？',
      why: '该观察比较了最近 3 天与此前 4 天的专注记录。',
      evidenceRefs: [{ insightId: 'focus-trend-7d', index: 0, source: 'behavior_adapter', metric: 'focus_minutes', period: 'current_3d' }],
      confidence: 1,
      actionLevel: 'insight_only',
    }],
    permissions: { read: ['deterministic_insights'], write: [] },
    metadata: { readOnly: true, actionLevel: 'insight_only', sourceInsightVersion: 'agent-insight-v1', contextVersion: 'learning-context-v1' },
  };
}

function buildFirewallContext() {
  return buildLlmContext({
    context: learningContext(),
    insights: insightsFixture(),
    reasoning: reasoningFixture(),
    task: 'explain_daily',
  });
}

/** 深冻结：隔离测试用 */
function deepFreeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

// ---------- 1. provider contract validation ----------

test('provider contract: 合法 Provider payload + 合法 task 通过校验', () => {
  const context = toProviderPayload(buildFirewallContext());
  assert.equal(validateProviderInput({ context, task: 'explain_daily' }), true);
});

test('provider contract: 拒绝非 agent-llm-context-v1 上下文', () => {
  assert.throws(() => validateProviderInput({ context: { version: 'something-else' }, task: 'explain_daily' }), /PROVIDER_INPUT_INVALID_CONTEXT/);
  assert.throws(() => validateProviderInput({ context: null, task: 'explain_daily' }), /PROVIDER_INPUT_INVALID_CONTEXT/);
});

test('provider contract: 拒绝非法 task（含未在 TASKS 白名单）', () => {
  const context = buildFirewallContext();
  assert.throws(() => validateProviderInput({ context, task: 'execute_plan' }), /PROVIDER_INPUT_INVALID_TASK/);
  assert.throws(() => validateProviderInput({ context, task: '' }), /PROVIDER_INPUT_INVALID_TASK/);
  assert.throws(() => validateProviderInput({ context, task: undefined }), /PROVIDER_INPUT_INVALID_TASK/);
});

test('provider contract: 拒绝 metadata 违规', () => {
  const notReadOnly = buildFirewallContext();
  notReadOnly.metadata.readOnly = false;
  assert.throws(() => validateProviderInput({ context: notReadOnly, task: 'explain_daily' }), /PROVIDER_INPUT_NOT_READ_ONLY/);

  const badLevel = buildFirewallContext();
  badLevel.metadata.actionLevel = 'autonomous';
  assert.throws(() => validateProviderInput({ context: badLevel, task: 'explain_daily' }), /PROVIDER_INPUT_INVALID_ACTION_LEVEL/);
});

test('provider contract: 拒绝携带敏感键的上下文', () => {
  const leaky = buildFirewallContext();
  leaky.sources = leaky.sources.concat([{ key: 'x', source: 's', authority: 'source', type: 't', confidence: 1, apiKey: 'sk-evil' }]);
  assert.throws(() => validateProviderInput({ context: leaky, task: 'explain_daily' }), /PROVIDER_INPUT_SENSITIVE/);
});

test('provider contract: 拒绝超出防火墙字节预算的上下文', () => {
  const big = buildFirewallContext();
  big.padding = 'x'.repeat(9000);
  assert.throws(() => validateProviderInput({ context: big, task: 'explain_daily' }), /PROVIDER_INPUT_TOO_LARGE/);
});

test('provider contract: validateProviderOutput 拒绝未知字段 / ok 带 reason / failed 带 reply / 信封敏感键', () => {
  const ok = { status: 'ok', reply: 'x', provider: 'p', model: 'm', promptVersion: PROVIDER_PROMPT_VERSION, requestId: 'r', latencyMs: 1 };
  assert.equal(validateProviderOutput(ok), true);

  assert.throws(() => validateProviderOutput({ ...ok, extra: 1 }), /PROVIDER_ENVELOPE_UNKNOWN_FIELD/);
  assert.throws(() => validateProviderOutput({ ...ok, reason: 'llm_timeout' }), /PROVIDER_ENVELOPE_INVALID/);
  assert.throws(() => validateProviderOutput({ ...clone(ok), reply: '' }), /PROVIDER_ENVELOPE_INVALID/);

  const failed = { status: 'failed', reason: 'llm_timeout', provider: 'p', model: 'm', promptVersion: PROVIDER_PROMPT_VERSION, requestId: 'r', latencyMs: 1 };
  assert.equal(validateProviderOutput(failed), true);
  assert.throws(() => validateProviderOutput({ ...failed, reply: 'x' }), /PROVIDER_ENVELOPE_INVALID/);
  assert.throws(() => validateProviderOutput({ ...clone(failed), reason: 'unknown_reason' }), /PROVIDER_ENVELOPE_INVALID/);
  assert.throws(() => validateProviderOutput({ ...clone(failed), model: 'm', apiKey: 'sk-evil' }), /PROVIDER_ENVELOPE_SENSITIVE|PROVIDER_ENVELOPE_UNKNOWN_FIELD/);

  assert.throws(() => validateProviderOutput({ ...clone(ok), latencyMs: -1 }), /PROVIDER_ENVELOPE_INVALID/);
  assert.throws(() => validateProviderOutput({ ...clone(ok), status: 'weird' }), /PROVIDER_ENVELOPE_INVALID/);
  assert.ok(ENVELOPE_FIELDS.has('status') && ENVELOPE_FIELDS.has('reply'));
});

// ---------- 2. timeout fallback ----------

test('timeout fallback: 传输永不返回 → failed/llm_timeout，无 reply 字段', async () => {
  const hangingTransport = () => new Promise(() => {});
  const envelope = await provider.generateExplanation({
    context: buildFirewallContext(),
    task: 'explain_daily',
    options: { transport: hangingTransport, timeoutMs: 50, apiKey: 'k', baseUrl: 'https://example.invalid', model: 'm' },
  });
  assert.equal(envelope.status, 'failed');
  assert.equal(envelope.reason, 'llm_timeout');
  assert.equal('reply' in envelope, false);
  assert.ok(envelope.latencyMs >= 40);
  assert.equal(envelope.promptVersion, PROVIDER_PROMPT_VERSION);
  assert.ok(envelope.requestId.length > 0);
});

// ---------- 3. provider failure ----------

test('provider failure: 网络异常 → llm_unavailable', async () => {
  const envelope = await provider.generateExplanation({
    context: buildFirewallContext(),
    task: 'explain_daily',
    options: { transport: async () => { throw new TypeError('fetch failed'); }, apiKey: 'k', baseUrl: 'u', model: 'm' },
  });
  assert.equal(envelope.status, 'failed');
  assert.equal(envelope.reason, 'llm_unavailable');
});

test('provider failure: AI_NOT_CONFIGURED → llm_not_configured', async () => {
  const envelope = await provider.generateExplanation({
    context: buildFirewallContext(),
    task: 'explain_daily',
    options: { transport: async () => { throw ApiError.internal('AI_NOT_CONFIGURED', '未配置'); }, apiKey: 'k', baseUrl: 'u', model: 'm' },
  });
  assert.equal(envelope.reason, 'llm_not_configured');
});

test('provider failure: 上游 429（upstreamStatus）→ llm_rate_limited', async () => {
  const envelope = await provider.generateExplanation({
    context: buildFirewallContext(),
    task: 'explain_daily',
    options: {
      transport: async () => {
        const err = ApiError.internal('AI_UPSTREAM_ERROR', 'HTTP 429');
        err.upstreamStatus = 429;
        throw err;
      },
      apiKey: 'k', baseUrl: 'u', model: 'm',
    },
  });
  assert.equal(envelope.reason, 'llm_rate_limited');
});

test('provider failure: 未知异常 → llm_unavailable（收敛，不外泄细节）', async () => {
  const envelope = await provider.generateExplanation({
    context: buildFirewallContext(),
    task: 'explain_daily',
    options: { transport: async () => { throw new Error('SECRET-INTERNAL-DETAIL'); }, apiKey: 'k', baseUrl: 'u', model: 'm' },
  });
  assert.equal(envelope.reason, 'llm_unavailable');
  assert.equal(JSON.stringify(envelope).includes('SECRET-INTERNAL-DETAIL'), false);
});

// ---------- 4. malformed response ----------

test('malformed response: 空 reply → llm_malformed；非字符串 reply → llm_malformed', async () => {
  const empty = await provider.generateExplanation({
    context: buildFirewallContext(),
    task: 'explain_daily',
    options: { transport: async () => { throw ApiError.internal('AI_EMPTY_REPLY', '空'); }, apiKey: 'k', baseUrl: 'u', model: 'm' },
  });
  assert.equal(empty.reason, 'llm_malformed');

  const nonString = await provider.generateExplanation({
    context: buildFirewallContext(),
    task: 'explain_daily',
    options: { transport: async () => ({ reply: { object: true }, model: 'm' }), apiKey: 'k', baseUrl: 'u', model: 'm' },
  });
  assert.equal(nonString.status, 'failed');
  assert.equal(nonString.reason, 'llm_malformed');
});

test('malformed boundary: 合法但非 JSON 的 reply 原样透传（Provider 不解析、不修复）', async () => {
  const raw = '```json\n{"schemaVersion": "agent-llm-output-v1", truncated...';
  const envelope = await provider.generateExplanation({
    context: buildFirewallContext(),
    task: 'explain_daily',
    options: { transport: async () => ({ reply: raw, model: 'm' }), apiKey: 'k', baseUrl: 'u', model: 'm' },
  });
  assert.equal(envelope.status, 'ok');
  assert.equal(envelope.reply, raw);
});

// ---------- 5. provider isolation ----------

test('provider isolation: 输入上下文只读（深冻结 + 调用后深比较不变）', async () => {
  const context = buildFirewallContext();
  const snapshot = clone(context);
  deepFreeze(context);

  await provider.generateExplanation({
    context,
    task: 'explain_daily',
    options: { transport: async () => ({ reply: 'ok', model: 'm' }), apiKey: 'k', baseUrl: 'u', model: 'm' },
  });

  assert.deepEqual(context, snapshot);
});

test('provider isolation: 信封与 Prompt 无敏感键、无密钥泄漏', async () => {
  const secret = 'sk-super-secret-key-123';
  const context = buildFirewallContext();
  const messages = provider.buildProviderMessages(context);
  const messagesText = JSON.stringify(messages);

  assert.equal(messagesText.includes(secret), false);
  assert.equal(messagesText.toLowerCase().includes('apikey'), false);
  assert.equal(messagesText, JSON.stringify(provider.buildProviderMessages(clone(context)))); // 确定性

  let captured;
  const envelope = await provider.generateExplanation({
    context,
    task: 'explain_daily',
    options: {
      transport: async (params) => { captured = params; return { reply: 'ok', model: 'm' }; },
      apiKey: secret, baseUrl: 'u', model: 'm',
    },
  });

  assert.equal(captured.apiKey, secret); // 密钥只经参数进传输层
  assert.equal(JSON.stringify(envelope).includes(secret), false);
  assert.equal(JSON.stringify(envelope).toLowerCase().includes('apikey'), false);
  assert.equal(envelope.status, 'ok');
});

// ---------- 6. no database access ----------

test('no database access: agentProvider 三模块依赖白名单（无 db/sqlite/store/sync/repository）', () => {
  const ALLOWED_ROOTS = [
    'providerContract',
    'providerRegistry',
    'openaiCompatibleProvider',
    '../agentFirewall/contextFirewall',
    '../agentFirewall/contextContract',
    '../agentOutputValidator/outputContract',
    '../agentPrompt/promptRegistry',
    '../providers/openaiCompatible',
    '../../config/env',
    '../../utils/ApiError',
    'node:crypto',
  ];
  const FORBIDDEN = /(better-sqlite3|sqlite|database|db\/|store|sync|repository|memory|growth|insightService|agentHomeService)/i;

  const dir = path.join(__dirname, '..', 'src', 'services', 'agentProvider');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js'));
  assert.ok(files.includes('providerContract.js') && files.includes('providerRegistry.js') && files.includes('openaiCompatibleProvider.js'));

  files.forEach((file) => {
    const source = fs.readFileSync(path.join(dir, file), 'utf8');
    const requires = [...source.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]);
    assert.ok(requires.length > 0, `${file} 应有依赖声明`);
    requires.forEach((target) => {
      const resolvedRoot = target.startsWith('.') ? target : `node:${target.split('/')[0]}`;
      const matched = ALLOWED_ROOTS.some((allowed) => resolvedRoot === allowed || resolvedRoot.endsWith(`/${allowed}`) || resolvedRoot.endsWith(allowed));
      assert.ok(matched, `${file} 出现非白名单依赖: ${target}`);
      assert.equal(FORBIDDEN.test(target), false, `${file} 出现违禁依赖: ${target}`);
    });
  });
});

// ---------- 7. registry ----------

test('registry: 已知名返回适配器，未知名返回 null', () => {
  assert.equal(getAgentProvider('openaiCompatible').name, 'openaiCompatible');
  assert.equal(getAgentProvider('nope'), null);
  assert.equal(getAgentProvider(undefined), null);
  assert.ok(REGISTRY.openaiCompatible);
  assert.equal(typeof resolveAgentProvider, 'function');
  // 当前测试环境默认 openaiCompatible（config 默认值）
  assert.equal(resolveAgentProvider().name, 'openaiCompatible');
});

test('registry: FAIL_REASONS ⊆ outputContract.FALLBACK_REASONS（永久锁定）', () => {
  FAIL_REASONS.forEach((reason) => {
    assert.ok(FALLBACK_REASONS.has(reason), `${reason} 必须在 FALLBACK_REASONS 中`);
  });
});

// ---------- 8. chain integration ----------

test('chain integration: stub transport 全链绿色（Firewall → Provider → Output → Binding → Semantic）', async () => {
  const firewallContext = buildFirewallContext();
  const validOutput = {
    schemaVersion: OUTPUT_SCHEMA_VERSION,
    status: 'validated',
    available: true,
    fallback: null,
    explanations: [{
      id: 'exp-1',
      type: 'fact',
      text: '最近 3 天的专注记录保持在 80 分钟。',
      evidenceRefs: [{ insightId: 'focus-trend-7d', evidenceId: 'focus-trend-7d:0', metric: 'focus_minutes', period: 'current_3d' }],
      reasoningRefs: [{ reasoningId: 'reasoning:focus-trend-7d', insightId: 'focus-trend-7d' }],
    }],
    suggestions: [],
    uncertainties: [],
    metadata: { readOnly: true, actionLevel: 'insight_only', providerIndependent: true },
  };

  const envelope = await provider.generateExplanation({
    context: firewallContext,
    task: 'explain_daily',
    options: { transport: async () => ({ reply: JSON.stringify(validOutput), model: 'stub-model' }), apiKey: 'k', baseUrl: 'u', model: 'm' },
  });
  assert.equal(envelope.status, 'ok');
  assert.equal(envelope.model, 'stub-model');

  const candidate = JSON.parse(envelope.reply);
  const contract = validateOutputContract(candidate);
  assert.equal(contract.valid, true, JSON.stringify(contract.errors));

  const binding = validateEvidenceBinding({
    firewallContext,
    output: candidate,
    expectedSnapshotId: require('../src/services/agentEvidenceBinding/evidenceBindingContract').computeContextSnapshotId(firewallContext),
    ownerUserId: 7,
  });
  assert.equal(binding.valid, true, JSON.stringify(binding.violations));

  const semantic = validateSemanticValidation({ firewallContext, output: candidate });
  assert.equal(semantic.valid, true, JSON.stringify(semantic.violations));
});

test('chain integration: failed 信封的 reason 可直接作为最终 fallback.reason（∈ FALLBACK_REASONS）', async () => {
  const envelope = await provider.generateExplanation({
    context: buildFirewallContext(),
    task: 'explain_daily',
    options: { transport: async () => { throw new TypeError('network down'); }, apiKey: 'k', baseUrl: 'u', model: 'm' },
  });
  assert.equal(envelope.status, 'failed');
  assert.ok(FALLBACK_REASONS.has(envelope.reason));
});

// ---------- 信封工厂直测 ----------

test('envelope factories: buildOkEnvelope / buildFailedEnvelope 产出单一形态', () => {
  const ok = buildOkEnvelope({ reply: 'r', provider: 'p', model: 'm', requestId: 'id', latencyMs: 5 });
  const failed = buildFailedEnvelope({ reason: 'llm_timeout', provider: 'p', model: 'm', requestId: 'id', latencyMs: 5 });
  assert.deepEqual(Object.keys(ok).sort(), [...ENVELOPE_FIELDS].filter((f) => f !== 'reason').sort());
  assert.deepEqual(Object.keys(failed).sort(), [...ENVELOPE_FIELDS].filter((f) => f !== 'reply').sort());
  assert.throws(() => buildFailedEnvelope({ reason: 'not_a_reason', provider: 'p', model: 'm', requestId: 'id', latencyMs: 5 }), /PROVIDER_ENVELOPE_INVALID/);
});
