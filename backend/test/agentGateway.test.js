'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { mock } = require('node:test');

const { runExplanation, GATEWAY_VERSION } = require('../src/services/agentGateway/runtimeGateway');
const {
  GATEWAY_VERSION: CONTRACT_VERSION,
  META_FIELDS,
  validateGatewayResult,
} = require('../src/services/agentGateway/gatewayContract');
const { buildFallbackOutput, boundedEntryId } = require('../src/services/agentGateway/fallbackOutput');
const { buildLlmContext } = require('../src/services/agentFirewall/contextFirewall');
const { validateOutputContract, OUTPUT_SCHEMA_VERSION } = require('../src/services/agentOutputValidator/outputContract');
const { computeContextSnapshotId } = require('../src/services/agentEvidenceBinding/evidenceBindingContract');

assert.equal(GATEWAY_VERSION, CONTRACT_VERSION);

// ---------- 夹具：与 agentLlmContextFirewall.test.js 同构的最小合法三段上下文 ----------

function learningContext(userId = 7) {
  return {
    version: 'learning-context-v1',
    userId,
    actionLevel: 'insight_only',
    readOnly: true,
    permissions: { read: ['deterministic_insights'], write: [] },
    courses: { source: 'cgstore.sync.courses', authority: 'source', type: 'source_projection', confidence: 1 },
  };
}

function evidenceFixture(value = 80) {
  return { source: 'behavior_adapter', authority: 'deterministic_projection', metric: 'focus_minutes', period: 'current_3d', value };
}

function insightsFixture(userId = 7) {
  return {
    version: 'agent-insight-v1',
    userId,
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

function reasoningFixture(userId = 7) {
  return {
    version: 'agent-reasoning-v1',
    userId,
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

/** 通过三道 Validator 的合法 LLM 输出（与 agentProvider.test.js 链路用例同构） */
function validOutputFixture() {
  return {
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
}

function okProviderEnvelope(reply) {
  return { status: 'ok', reply, provider: 'stub', model: 'stub-model', promptVersion: 'stub-prompt', requestId: 'stub-r', latencyMs: 1 };
}

function stubProvider(envelopeFactory) {
  return { name: 'stub', generateExplanation: async () => (typeof envelopeFactory === 'function' ? envelopeFactory() : envelopeFactory) };
}

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

function maskRequestId(result) {
  const copy = clone(result);
  copy.meta.requestId = '<masked>';
  copy.meta.latencyMs = 0; // 计时非确定性字段，脱敏
  return copy;
}

// ---------- 1. gateway contract ----------

test('gateway contract: validateGatewayResult 接受合法 validated / fallback 信封', () => {
  const firewallContext = buildLlmContext({
    context: learningContext(), insights: insightsFixture(), reasoning: reasoningFixture(), task: 'explain_daily',
  });
  const validated = {
    status: 'validated',
    output: validOutputFixture(),
    meta: {
      gatewayVersion: GATEWAY_VERSION, task: 'explain_daily', requestId: 'r1',
      contextSnapshotId: computeContextSnapshotId(firewallContext),
      provider: 'stub', model: 'm', promptVersion: 'p', latencyMs: 1,
      validators: { outputContract: true, evidenceBinding: true, semantic: true },
    },
  };
  assert.equal(validateGatewayResult(validated), true);

  const fallback = {
    status: 'fallback',
    output: buildFallbackOutput({ firewallContext, fallbackReason: 'llm_timeout' }),
    meta: {
      gatewayVersion: GATEWAY_VERSION, task: 'explain_daily', requestId: 'r2',
      contextSnapshotId: computeContextSnapshotId(firewallContext),
      provider: 'stub', model: 'm', promptVersion: 'p', latencyMs: 2,
      fallbackReason: 'llm_timeout',
    },
  };
  assert.equal(validateGatewayResult(fallback), true);
});

test('gateway contract: 拒绝未知字段 / 缺 validators / fallbackReason 不合法 / validated 带 fallbackReason', () => {
  const base = {
    status: 'fallback',
    output: { schemaVersion: OUTPUT_SCHEMA_VERSION, status: 'fallback' },
    meta: {
      gatewayVersion: GATEWAY_VERSION, task: 'explain_daily', requestId: 'r',
      contextSnapshotId: 'hash', provider: 'p', model: 'm', promptVersion: 'pv',
      latencyMs: 0, fallbackReason: 'llm_timeout',
    },
  };
  assert.equal(validateGatewayResult(clone(base)), true);
  assert.throws(() => validateGatewayResult({ ...clone(base), extra: 1 }), /GATEWAY_RESULT_UNKNOWN_FIELD/);
  assert.throws(() => validateGatewayResult({ ...clone(base), status: 'weird' }), /GATEWAY_RESULT_INVALID/);

  const noValidators = clone(base);
  noValidators.status = 'validated';
  noValidators.output = validOutputFixture();
  assert.throws(() => validateGatewayResult(noValidators), /GATEWAY_RESULT_INVALID/);

  const badReason = clone(base);
  badReason.meta.fallbackReason = 'not_a_reason';
  assert.throws(() => validateGatewayResult(badReason), /GATEWAY_RESULT_INVALID/);

  const validatedWithReason = clone(base);
  validatedWithReason.status = 'validated';
  validatedWithReason.output = validOutputFixture();
  validatedWithReason.meta.validators = { outputContract: true, evidenceBinding: true, semantic: true };
  validatedWithReason.meta.fallbackReason = 'llm_timeout';
  assert.throws(() => validateGatewayResult(validatedWithReason), /GATEWAY_RESULT_INVALID/);

  assert.throws(() => validateGatewayResult({ ...clone(base), meta: { ...base.meta, extra: 1 } }), /GATEWAY_RESULT_UNKNOWN_FIELD/);
  assert.ok(META_FIELDS.has('fallbackReason') && META_FIELDS.has('validators'));
});

test('gateway contract: GATEWAY_INVARIANT_BROKEN —— 仅测试侧打桩可构造（不可能状态防线）', async () => {
  // 测试侧打桩模拟「确定性兜底数据违反 Output Contract」的编程错误；
  // §7 的「Validator 不可注入」约束生产依赖，不约束测试打桩。
  const mocked = mock.method(
    require('../src/services/agentOutputValidator/outputContract'),
    'validateOutputContract',
    () => ({ valid: false, errors: [{ path: '$root', code: 'SIMULATED_BUG' }] })
  );
  try {
    await assert.rejects(
      () => runExplanation({
        context: learningContext(), insights: insightsFixture(), reasoning: reasoningFixture(), task: 'explain_daily',
        options: { provider: stubProvider({ status: 'failed', reason: 'llm_timeout', provider: 'stub', model: 'm', promptVersion: 'p', requestId: 'r', latencyMs: 1 }) },
      }),
      /GATEWAY_INVARIANT_BROKEN/
    );
  } finally {
    mocked.mock.restore();
  }
});

test('gateway contract: 注入 provider 违约抛错 → 防御性收敛 llm_unavailable（Gateway 全函数）', async () => {
  const result = await runExplanation({
    context: learningContext(), insights: insightsFixture(), reasoning: reasoningFixture(), task: 'explain_daily',
    options: { provider: stubProvider(() => { throw new TypeError('provider violated contract'); }) },
  });
  assert.equal(result.status, 'fallback');
  assert.equal(result.meta.fallbackReason, 'llm_unavailable');
});

// ---------- 2. happy path ----------

test('happy path: 合法 LLM 输出 → validated，三 validator 标志全 true，快照 id 一致', async () => {
  const firewallContext = buildLlmContext({
    context: learningContext(), insights: insightsFixture(), reasoning: reasoningFixture(), task: 'explain_daily',
  });
  const result = await runExplanation({
    context: learningContext(), insights: insightsFixture(), reasoning: reasoningFixture(), task: 'explain_daily',
    options: { provider: stubProvider(okProviderEnvelope(JSON.stringify(validOutputFixture()))) },
  });

  assert.equal(result.status, 'validated');
  assert.deepEqual(result.meta.validators, { outputContract: true, evidenceBinding: true, semantic: true });
  assert.equal(result.meta.contextSnapshotId, computeContextSnapshotId(firewallContext));
  assert.equal(result.meta.provider, 'stub');
  assert.equal(result.meta.model, 'stub-model');
  assert.equal(result.meta.gatewayVersion, GATEWAY_VERSION);
  assert.equal('fallbackReason' in result.meta, false);
  assert.equal(result.output.status, 'validated');
});

// ---------- 3. provider failure ----------

test('provider failure: failed 信封 reason 原样承接为 fallbackReason', async () => {
  for (const reason of ['llm_timeout', 'llm_not_configured', 'llm_unavailable', 'llm_rate_limited']) {
    const result = await runExplanation({
      context: learningContext(), insights: insightsFixture(), reasoning: reasoningFixture(), task: 'explain_daily',
      options: { provider: stubProvider({ status: 'failed', reason, provider: 'stub', model: 'm', promptVersion: 'p', requestId: 'r', latencyMs: 1 }) },
    });
    assert.equal(result.status, 'fallback');
    assert.equal(result.meta.fallbackReason, reason);
    assert.equal(result.output.status, 'fallback');
    assert.equal(result.output.fallback.reason, reason);
    assert.equal('validators' in result.meta, false);
  }
});

test('provider failure: registry 解析 null → llm_not_configured 空态信封', async () => {
  const registryModule = require('../src/services/agentProvider/providerRegistry');
  const mocked = mock.method(registryModule, 'resolveAgentProvider', () => null);
  try {
    const result = await runExplanation({
      context: learningContext(), insights: insightsFixture(), reasoning: reasoningFixture(), task: 'explain_daily',
    });
    assert.equal(result.status, 'fallback');
    assert.equal(result.meta.fallbackReason, 'llm_not_configured');
    assert.equal(result.meta.provider, 'none');
    assert.equal(result.meta.model, '');
    assert.equal(result.meta.promptVersion, '');
    assert.equal(result.meta.latencyMs, 0);
  } finally {
    mocked.mock.restore();
  }
});

test('gateway contract: 注入形状非法 provider → throw GATEWAY_PROVIDER_INVALID（输入契约违规）', async () => {
  await assert.rejects(
    () => runExplanation({
      context: learningContext(), insights: insightsFixture(), reasoning: reasoningFixture(), task: 'explain_daily',
      options: { provider: { name: 'broken' } },
    }),
    /GATEWAY_PROVIDER_INVALID/
  );
});

// ---------- 4. malformed ----------

test('malformed: reply 非 JSON → fallback(llm_malformed)', async () => {
  const result = await runExplanation({
    context: learningContext(), insights: insightsFixture(), reasoning: reasoningFixture(), task: 'explain_daily',
    options: { provider: stubProvider(okProviderEnvelope('{"schemaVersion": broken')) },
  });
  assert.equal(result.status, 'fallback');
  assert.equal(result.meta.fallbackReason, 'llm_malformed');
});

// ---------- 5. schema violation ----------

test('schema violation: reply 是 JSON 但缺 schemaVersion → fallback(llm_schema_invalid)', async () => {
  const broken = validOutputFixture();
  delete broken.schemaVersion;
  const result = await runExplanation({
    context: learningContext(), insights: insightsFixture(), reasoning: reasoningFixture(), task: 'explain_daily',
    options: { provider: stubProvider(okProviderEnvelope(JSON.stringify(broken))) },
  });
  assert.equal(result.status, 'fallback');
  assert.equal(result.meta.fallbackReason, 'llm_schema_invalid');
});

// ---------- 6. evidence mismatch ----------

test('evidence mismatch: LLM 编造 ghost insight 引用 → fallback(llm_evidence_mismatch)', async () => {
  const fabricated = validOutputFixture();
  fabricated.explanations[0].evidenceRefs = [{ insightId: 'ghost-insight', evidenceId: 'ghost-insight:0', metric: 'focus_minutes', period: 'current_3d' }];
  fabricated.explanations[0].reasoningRefs = [{ reasoningId: 'reasoning:ghost-insight', insightId: 'ghost-insight' }];
  const result = await runExplanation({
    context: learningContext(), insights: insightsFixture(), reasoning: reasoningFixture(), task: 'explain_daily',
    options: { provider: stubProvider(okProviderEnvelope(JSON.stringify(fabricated))) },
  });
  assert.equal(result.status, 'fallback');
  assert.equal(result.meta.fallbackReason, 'llm_evidence_mismatch');
});

// ---------- 7. semantic violation ----------

test('semantic violation: 数值不一致 → llm_unsafe；绝对化断言 → llm_unsupported_claim', async () => {
  const numeric = validOutputFixture();
  numeric.explanations[0].text = '最近 3 天日均专注 120 分钟。';
  const numericResult = await runExplanation({
    context: learningContext(), insights: insightsFixture(), reasoning: reasoningFixture(), task: 'explain_daily',
    options: { provider: stubProvider(okProviderEnvelope(JSON.stringify(numeric))) },
  });
  assert.equal(numericResult.meta.fallbackReason, 'llm_unsafe');

  const scope = clone(validOutputFixture());
  scope.explanations[0] = {
    id: 'exp-1',
    type: 'interpretation',
    text: '你的能力下降非常明显。',
    generationConfidence: 0.8,
    evidenceRefs: [{ insightId: 'focus-trend-7d', evidenceId: 'focus-trend-7d:0', metric: 'focus_minutes', period: 'current_3d' }],
    reasoningRefs: [{ reasoningId: 'reasoning:focus-trend-7d', insightId: 'focus-trend-7d' }],
  };
  const scopeResult = await runExplanation({
    context: learningContext(), insights: insightsFixture(), reasoning: reasoningFixture(), task: 'explain_daily',
    options: { provider: stubProvider(okProviderEnvelope(JSON.stringify(scope))) },
  });
  assert.equal(scopeResult.status, 'fallback');
  assert.equal(scopeResult.meta.fallbackReason, 'llm_unsupported_claim');
});

// ---------- 8. fallback construction ----------

test('fallback construction: 兜底来自 reasoning 投影（无 LLM 文本、契约自检通过、refs 可回查）', async () => {
  const result = await runExplanation({
    context: learningContext(), insights: insightsFixture(), reasoning: reasoningFixture(), task: 'explain_daily',
    options: { provider: stubProvider({ status: 'failed', reason: 'llm_timeout', provider: 'stub', model: 'm', promptVersion: 'p', requestId: 'r', latencyMs: 1 }) },
  });

  assert.equal(validateOutputContract(result.output).valid, true);
  assert.equal(result.output.explanations.length, 1);
  const entry = result.output.explanations[0];
  assert.equal(entry.insightId, 'focus-trend-7d');
  assert.equal(entry.title, '为什么出现专注趋势观察？'); // 确定性文本，非 LLM 编造
  assert.equal(entry.why, '该观察比较了最近 3 天与此前 4 天的专注记录。');
  assert.equal(entry.id, 'fallback:reasoning:focus-trend-7d');
  assert.deepEqual(entry.evidenceRefs, [{ insightId: 'focus-trend-7d', evidenceId: 'focus-trend-7d:0', metric: 'focus_minutes', period: 'current_3d' }]);
  // 兜底 output 不携带 LLM 痕迹（meta.provider 等编排元数据属合法字段，不在 output 内）
  assert.equal(JSON.stringify(result.output).includes('stub'), false);
});

test('fallback construction: reasoning 空解释 → 空解释兜底信封（契约有效）', async () => {
  const emptyReasoning = reasoningFixture();
  emptyReasoning.available = false;
  emptyReasoning.explanations = [];
  const result = await runExplanation({
    context: learningContext(), insights: insightsFixture(), reasoning: emptyReasoning, task: 'explain_daily',
    options: { provider: stubProvider({ status: 'failed', reason: 'llm_unavailable', provider: 'stub', model: 'm', promptVersion: 'p', requestId: 'r', latencyMs: 1 }) },
  });
  assert.equal(result.status, 'fallback');
  assert.deepEqual(result.output.explanations, []);
  assert.equal(validateOutputContract(result.output).valid, true);
});

test('fallback construction (M-1): 稀疏 refs 合法输入 → 条目整条丢弃，信封仍合法', async () => {
  const insights = insightsFixture();
  insights.insights[0].evidence = [evidenceFixture(80), evidenceFixture(70), evidenceFixture(60)];
  const reasoning = reasoningFixture();
  // index 0 与 2 → 过滤后稀疏 → 整条丢弃（防火墙校验不拒绝该输入）
  reasoning.explanations[0].evidenceRefs = [
    { insightId: 'focus-trend-7d', index: 0, source: 'behavior_adapter', metric: 'focus_minutes', period: 'current_3d' },
    { insightId: 'focus-trend-7d', index: 2, source: 'behavior_adapter', metric: 'focus_minutes', period: 'current_3d' },
  ];
  const result = await runExplanation({
    context: learningContext(), insights, reasoning, task: 'explain_daily',
    options: { provider: stubProvider({ status: 'failed', reason: 'llm_timeout', provider: 'stub', model: 'm', promptVersion: 'p', requestId: 'r', latencyMs: 1 }) },
  });
  assert.equal(result.status, 'fallback');
  assert.deepEqual(result.output.explanations, []);
  assert.equal(validateOutputContract(result.output).valid, true);
});

test('fallback construction (M-1): 不可回查 insightId → 整条丢弃；真实投影数据零丢弃', async () => {
  const ghostReasoning = reasoningFixture();
  ghostReasoning.explanations[0].insightId = 'ghost-insight';
  ghostReasoning.explanations[0].evidenceRefs = [{ insightId: 'ghost-insight', index: 0, source: 's', metric: 'm', period: '1d' }];
  const ghostResult = await runExplanation({
    context: learningContext(), insights: insightsFixture(), reasoning: ghostReasoning, task: 'explain_daily',
    options: { provider: stubProvider({ status: 'failed', reason: 'llm_timeout', provider: 'stub', model: 'm', promptVersion: 'p', requestId: 'r', latencyMs: 1 }) },
  });
  assert.deepEqual(ghostResult.output.explanations, []);

  // 绊线：真实投影（合法三段 → buildLlmContext）零丢弃
  const firewallContext = buildLlmContext({
    context: learningContext(), insights: insightsFixture(), reasoning: reasoningFixture(), task: 'explain_daily',
  });
  const direct = buildFallbackOutput({ firewallContext, fallbackReason: 'llm_timeout' });
  assert.equal(direct.explanations.length, firewallContext.reasoning.length);
});

test('fallback construction: 字节压力 —— 5 条 × 240 字 CJK 满载 ≤ 8192（尾部整条丢弃）', async () => {
  const filler = '非'.repeat(240);
  const insights = insightsFixture();
  insights.insights[0].evidence = [evidenceFixture(80), evidenceFixture(70), evidenceFixture(60)];
  const reasoning = reasoningFixture();
  reasoning.explanations = [1, 2, 3, 4, 5].map((n) => ({
    insightId: 'focus-trend-7d',
    insightType: 'focus_increase',
    title: `${filler}${n}`,
    why: `${filler}${n}`,
    evidenceRefs: [0, 1, 2].map((index) => ({ insightId: 'focus-trend-7d', index, source: 'behavior_adapter', metric: 'focus_minutes', period: 'current_3d' })),
    confidence: 1,
    actionLevel: 'insight_only',
  }));

  const result = await runExplanation({
    context: learningContext(), insights, reasoning, task: 'explain_daily',
    options: { provider: stubProvider({ status: 'failed', reason: 'llm_timeout', provider: 'stub', model: 'm', promptVersion: 'p', requestId: 'r', latencyMs: 1 }) },
  });

  const bytes = Buffer.byteLength(JSON.stringify(result.output), 'utf8');
  assert.ok(bytes <= 8192, `bytes=${bytes}`);
  assert.ok(result.output.explanations.length >= 1 && result.output.explanations.length < 5, `len=${result.output.explanations.length}`);
  assert.equal(validateOutputContract(result.output).valid, true);
});

test('fallback construction: id 有界化 —— 超长 reasoning.id 走 sha256 截断，恒 ≤ 120', () => {
  const longId = `reasoning:${'x'.repeat(200)}`;
  const bounded = boundedEntryId(longId);
  assert.ok(bounded.length <= 120);
  assert.ok(bounded.startsWith('fallback:'));
  assert.equal(boundedEntryId(longId), boundedEntryId(longId)); // 确定性
  assert.equal(boundedEntryId('reasoning:focus-trend-7d'), 'fallback:reasoning:focus-trend-7d');
});

// ---------- 9. firewall binding ----------

test('firewall binding: 输入所有权错配 → 抛防火墙错误（结构上必须先过防火墙）', async () => {
  await assert.rejects(
    () => runExplanation({
      context: learningContext(7), insights: insightsFixture(8), reasoning: reasoningFixture(7), task: 'explain_daily',
      options: { provider: stubProvider(okProviderEnvelope(JSON.stringify(validOutputFixture()))) },
    }),
    /FIREWALL_OWNERSHIP_MISMATCH/
  );
});

// ---------- 10. isolation ----------

test('isolation: 输入三段产物只读（深冻结 + 调用后深比较不变）', async () => {
  const context = learningContext();
  const insights = insightsFixture();
  const reasoning = reasoningFixture();
  const snapshot = { context: clone(context), insights: clone(insights), reasoning: clone(reasoning) };
  deepFreeze(context); deepFreeze(insights); deepFreeze(reasoning);

  await runExplanation({
    context, insights, reasoning, task: 'explain_daily',
    options: { provider: stubProvider(okProviderEnvelope(JSON.stringify(validOutputFixture()))) },
  });
  await runExplanation({
    context, insights, reasoning, task: 'explain_daily',
    options: { provider: stubProvider({ status: 'failed', reason: 'llm_timeout', provider: 'stub', model: 'm', promptVersion: 'p', requestId: 'r', latencyMs: 1 }) },
  });

  assert.deepEqual({ context, insights, reasoning }, snapshot);
});

test('isolation: agentGateway 三模块依赖白名单（无 db/sqlite/store/sync/repository）', () => {
  const ALLOWED = [
    'gatewayContract', 'fallbackOutput', 'runtimeGateway',
    '../agentProvider/providerContract', '../agentProvider/providerRegistry',
    '../agentFirewall/contextFirewall', '../agentFirewall/contextContract',
    '../agentOutputValidator/outputContract',
    '../agentEvidenceBinding/evidenceBindingContract',
    '../agentSemanticValidator/semanticValidatorContract',
    '../agentReasoning/reasoningContract',
    'node:crypto', 'node:util',
  ];
  const FORBIDDEN = /(better-sqlite3|sqlite|database|db\/|store|sync|repository|memory|goal|analytics)/i;
  const dir = path.join(__dirname, '..', 'src', 'services', 'agentGateway');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js'));
  assert.deepEqual(files.sort(), ['fallbackOutput.js', 'gatewayContract.js', 'runtimeGateway.js']);

  files.forEach((file) => {
    const source = fs.readFileSync(path.join(dir, file), 'utf8');
    const requires = [...source.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]);
    assert.ok(requires.length > 0, `${file} 应有依赖声明`);
    requires.forEach((target) => {
      const matched = ALLOWED.some((allowed) => target === allowed || target.endsWith(`/${allowed}`) || target === `../${allowed}` || target.endsWith(allowed));
      assert.ok(matched, `${file} 出现非白名单依赖: ${target}`);
      assert.equal(FORBIDDEN.test(target), false, `${file} 出现违禁依赖: ${target}`);
    });
  });
});

// ---------- 11. determinism ----------

test('determinism: 同输入 + 同 stub → 结果一致（requestId 脱敏后字节级相等）', async () => {
  const input = {
    context: learningContext(), insights: insightsFixture(), reasoning: reasoningFixture(), task: 'explain_daily',
    options: { provider: stubProvider(okProviderEnvelope(JSON.stringify(validOutputFixture()))) },
  };
  const a = maskRequestId(await runExplanation({ ...input }));
  const b = maskRequestId(await runExplanation({ ...input }));
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});
