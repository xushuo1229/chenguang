'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const { validatePromptTemplate } = require('../src/services/agentPrompt/promptTemplateContract');
const {
  registerPromptTemplate,
  getPromptTemplate,
  resolveActivePromptTemplate,
  buildActiveMessages,
} = require('../src/services/agentPrompt/promptRegistry');
const { AGENT_LLM_PROVIDER_PROMPT_V1 } = require('../src/services/agentPrompt/promptTemplates');
const { PROVIDER_PROMPT_VERSION } = require('../src/services/agentProvider/providerContract');
const adapter = require('../src/services/agentProvider/openaiCompatibleProvider');
const config = require('../src/config/env');

// ---------- golden 字节基线（永久保留，不随重构删除；docs §4.2） ----------
// 迁移前 openaiCompatibleProvider.js L49-67 的内联 System 文本，逐字硬编码于此。
const GOLDEN_SYSTEM_LINES = [
  'You are the explanation generator of the ZHIXING agent home (read-only, insight_only).',
  'You receive one JSON payload: a bounded learning context (agent-llm-context-v1) containing deterministic insights, evidence and reasoning.',
  'Return ONLY one minified JSON object with EXACTLY this schema and nothing else:',
  '{"schemaVersion":"agent-llm-output-v1","status":"validated","available":true,"fallback":null,',
  '"explanations":[{"id":"exp-1","type":"fact|interpretation|suggestion|uncertainty","text":"<=240 chars","generationConfidence":0.0,',
  '"evidenceRefs":[{"insightId":"...","evidenceId":"<insightId>:<index>","metric":"...","period":"..."}],',
  '"reasoningRefs":[{"reasoningId":"reasoning:<insightId>","insightId":"..."}]}],',
  '"suggestions":[],"uncertainties":[],"metadata":{"readOnly":true,"actionLevel":"insight_only","providerIndependent":true}}',
  'Hard rules:',
  '1. Use ONLY ids, evidence and reasoning present in the payload. Never invent references.',
  '2. type "fact" and "interpretation" require evidenceRefs (max 3, resolvable in payload insights).',
  '3. type "fact" requires exactly one reasoningRefs entry (max 1). type "suggestion" and "uncertainty" forbid evidenceRefs and reasoningRefs.',
  '4. "fact" must NOT include generationConfidence. "interpretation" generationConfidence must not exceed the referenced reasoning confidence.',
  "5. Max 5 explanations, max 3 suggestions, max 2 uncertainties. Text lengths: explanation<=240, suggestion<=180, uncertainty<=180. Use the user's language (Chinese).",
  '6. Numbers and dates in text must come from the referenced evidence values or periods. No absolute claims about ability, intelligence or personality.',
  '7. If the payload has no available insights (available=false) or you cannot ground a claim, return {"schemaVersion":"agent-llm-output-v1","status":"fallback","available":false,',
  '"fallback":{"type":"deterministic_reasoning","reason":"llm_unsafe","source":"agent-reasoning-v1"},',
  '"explanations":[],"suggestions":[],"uncertainties":[],"metadata":{"readOnly":true,"actionLevel":"insight_only","providerIndependent":true}}.',
  '8. Output JSON only. No markdown, no code fence, no commentary.',
];
const GOLDEN_SYSTEM = GOLDEN_SYSTEM_LINES.join('\n');

const SAMPLE_PAYLOAD = { probe: 'sample', values: [1, 2, 3] };

function codeOf(fn) {
  try {
    fn();
  } catch (err) {
    return err.code || String(err.message);
  }
  return null;
}

/** 合成模板工厂：system 由 systemBuilder(payload) 生成，version 可指定避免撞重 */
function makeTemplate(systemBuilder, version = 'agent-llm-provider-prompt-v9') {
  return {
    version,
    buildMessages(payload) {
      return [
        { role: 'system', content: systemBuilder(payload) },
        { role: 'user', content: JSON.stringify(payload) },
      ];
    },
  };
}

// ---------- 1. 契约校验 ----------

test('contract: 坏版本格式 → PROMPT_TEMPLATE_VERSION_INVALID', () => {
  const template = { version: 'prompt-v1', buildMessages: AGENT_LLM_PROVIDER_PROMPT_V1.buildMessages };
  assert.equal(codeOf(() => validatePromptTemplate(template)), 'PROMPT_TEMPLATE_VERSION_INVALID');
});

test('contract: 缺必含段 → PROMPT_TEMPLATE_MISSING_SECTION', () => {
  const broken = GOLDEN_SYSTEM.replace('Output JSON only.', '');
  const template = makeTemplate(() => broken, 'agent-llm-provider-prompt-v8');
  assert.equal(codeOf(() => validatePromptTemplate(template)), 'PROMPT_TEMPLATE_MISSING_SECTION');
});

test('contract: 含禁令（tools 指令）→ PROMPT_TEMPLATE_FORBIDDEN_INSTRUCTION', () => {
  const template = makeTemplate(() => `${GOLDEN_SYSTEM}\nYou may also use tools to fetch data.`, 'agent-llm-provider-prompt-v7');
  assert.equal(codeOf(() => validatePromptTemplate(template)), 'PROMPT_TEMPLATE_FORBIDDEN_INSTRUCTION');
});

test('contract: 词形扩展命中（writes to / executable / retrievals / tooling）', () => {
  for (const phrase of ['writes to the database', 'executable steps', 'do retrievals', 'use tooling here', 'planners may run']) {
    const template = makeTemplate(() => `${GOLDEN_SYSTEM}\n${phrase}.`, 'agent-llm-provider-prompt-v6');
    assert.equal(codeOf(() => validatePromptTemplate(template)), 'PROMPT_TEMPLATE_FORBIDDEN_INSTRUCTION', phrase);
  }
});

test('contract: buildMessages 形状非法 → PROMPT_TEMPLATE_INVALID', () => {
  const oneMessage = { version: 'agent-llm-provider-prompt-v5', buildMessages: () => [{ role: 'system', content: GOLDEN_SYSTEM }] };
  assert.equal(codeOf(() => validatePromptTemplate(oneMessage)), 'PROMPT_TEMPLATE_INVALID');

  const extraField = { ...makeTemplate(() => GOLDEN_SYSTEM), extra: 1 };
  assert.equal(codeOf(() => validatePromptTemplate(extraField)), 'PROMPT_TEMPLATE_INVALID');
});

test('contract: 含敏感词（apiKey / token）→ PROMPT_TEMPLATE_SENSITIVE', () => {
  const withKey = makeTemplate(() => `${GOLDEN_SYSTEM}\napiKey=abc`, 'agent-llm-provider-prompt-v4');
  assert.equal(codeOf(() => validatePromptTemplate(withKey)), 'PROMPT_TEMPLATE_SENSITIVE');
  const withToken = makeTemplate(() => `${GOLDEN_SYSTEM}\nbearer token here`, 'agent-llm-provider-prompt-v3');
  assert.equal(codeOf(() => validatePromptTemplate(withToken)), 'PROMPT_TEMPLATE_SENSITIVE');
});

test('contract: payload 插值进 system（封闭性破坏）→ PROMPT_TEMPLATE_NOT_CLOSED', () => {
  const leaking = makeTemplate((payload) => `${GOLDEN_SYSTEM}\n${JSON.stringify(payload)}`, 'agent-llm-provider-prompt-v2');
  assert.equal(codeOf(() => validatePromptTemplate(leaking)), 'PROMPT_TEMPLATE_NOT_CLOSED');
});

test('contract: 变异 payload → PROMPT_TEMPLATE_NOT_CLOSED', () => {
  const mutating = {
    version: 'agent-llm-provider-prompt-v90',
    buildMessages(payload) {
      payload.mutated = true; // 污染向量：变异调用方对象
      return [
        { role: 'system', content: GOLDEN_SYSTEM },
        { role: 'user', content: JSON.stringify(payload) },
      ];
    },
  };
  assert.equal(codeOf(() => validatePromptTemplate(mutating)), 'PROMPT_TEMPLATE_NOT_CLOSED');
});

test('contract: 重复注册同版本 → PROMPT_TEMPLATE_DUPLICATE', () => {
  assert.equal(codeOf(() => registerPromptTemplate(AGENT_LLM_PROVIDER_PROMPT_V1)), 'PROMPT_TEMPLATE_DUPLICATE');
});

// ---------- 2. 注册表 ----------

test('registry: v1 已注册且冻结；未知版本 → null；active 解析为同一冻结对象', () => {
  const active = resolveActivePromptTemplate();
  assert.ok(active);
  assert.equal(Object.isFrozen(active), true);
  assert.equal(getPromptTemplate('agent-llm-provider-prompt-v1'), active);
  assert.equal(getPromptTemplate('agent-llm-provider-prompt-v999'), null);
  assert.equal(active.version, 'agent-llm-provider-prompt-v1');
});

// ---------- 3. 确定性与 payload 封闭性（正向） ----------

test('determinism: 同 payload 两次调用字节相等；不同 payload system 恒等且 payload 非变异', () => {
  const a = buildActiveMessages(SAMPLE_PAYLOAD);
  const b = buildActiveMessages(SAMPLE_PAYLOAD);
  assert.equal(JSON.stringify(a), JSON.stringify(b));

  const payloadA = { probe: 'alpha', nested: { values: [1, 2] } };
  const payloadB = { probe: 'beta', nested: { values: [3, 4] } };
  const snapshotA = JSON.stringify(payloadA);
  const snapshotB = JSON.stringify(payloadB);

  const messagesA = buildActiveMessages(payloadA);
  const messagesB = buildActiveMessages(payloadB);
  assert.equal(messagesA[0].content, messagesB[0].content);           // system 与 payload 无关
  assert.equal(messagesA[0].content, buildActiveMessages({})[0].content); // 与 {} 冒烟恒等
  assert.equal(messagesA[1].content, JSON.stringify(payloadA));       // user 封闭
  assert.equal(messagesB[1].content, JSON.stringify(payloadB));
  assert.equal(JSON.stringify(payloadA), snapshotA);                  // 非变异
  assert.equal(JSON.stringify(payloadB), snapshotB);
});

// ---------- 4. 不可变性 ----------

test('immutability: 注册表模板冻结，严格模式赋值抛 TypeError', () => {
  const active = resolveActivePromptTemplate();
  assert.equal(Object.isFrozen(active), true);
  assert.throws(() => { active.version = 'hacked'; }, TypeError);
  assert.throws(() => { active.buildMessages = () => []; }, TypeError);
});

// ---------- 5. 适配器集成 + golden 字节基线 ----------

test('golden: adapter ≡ registry ≡ 迁移前内联文本（永久保留）', () => {
  const fromAdapter = adapter.buildProviderMessages(SAMPLE_PAYLOAD);
  const fromRegistry = buildActiveMessages(SAMPLE_PAYLOAD);

  assert.equal(fromAdapter[0].content, GOLDEN_SYSTEM);      // golden 字节基线
  assert.equal(fromRegistry[0].content, GOLDEN_SYSTEM);      // registry 同基线
  assert.equal(JSON.stringify(fromAdapter), JSON.stringify(fromRegistry)); // 委托等价
  assert.equal(fromAdapter[1].content, JSON.stringify(SAMPLE_PAYLOAD));
});

// ---------- 6. 一致性锁 ----------

test('consistency: PROVIDER_PROMPT_VERSION === active template version === env 默认', () => {
  assert.equal(PROVIDER_PROMPT_VERSION, 'agent-llm-provider-prompt-v1');
  assert.equal(resolveActivePromptTemplate().version, PROVIDER_PROMPT_VERSION);
  assert.equal(config.agentLlmPromptVersion, PROVIDER_PROMPT_VERSION);
});

// ---------- 7. 静态依赖白名单 ----------

test('no database access: agentPrompt 三模块依赖白名单', () => {
  const ALLOWED = ['promptTemplateContract', 'promptTemplates', 'promptRegistry', '../../config/env'];
  const FORBIDDEN = /(better-sqlite3|sqlite|database|db\/|store|sync|repository|memory|goal|analytics)/i;
  const dir = path.join(__dirname, '..', 'src', 'services', 'agentPrompt');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js'));
  assert.deepEqual(files.sort(), ['promptRegistry.js', 'promptTemplateContract.js', 'promptTemplates.js']);

  files.forEach((file) => {
    const source = fs.readFileSync(path.join(dir, file), 'utf8');
    const requires = [...source.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]);
    requires.forEach((target) => {
      const matched = ALLOWED.some((allowed) => target === allowed || target.endsWith(`/${allowed}`) || target.endsWith(allowed));
      assert.ok(matched, `${file} 出现非白名单依赖: ${target}`);
      assert.equal(FORBIDDEN.test(target), false, `${file} 出现违禁依赖: ${target}`);
    });
  });
});

// ---------- 8. 配置 ----------

test('config: agentLlmPromptVersion 默认值存在且为 v1', () => {
  assert.equal(config.agentLlmPromptVersion, 'agent-llm-provider-prompt-v1');
});

// ---------- 9. fail-fast ----------

test('fail-fast: 未知 AGENT_LLM_PROMPT_VERSION → require 即抛 AGENT_PROMPT_ACTIVE_UNRESOLVED', () => {
  const registryPath = require.resolve('../src/services/agentPrompt/promptRegistry');
  const envPath = require.resolve('../src/config/env');
  const savedEnvValue = process.env.AGENT_LLM_PROMPT_VERSION;
  const savedRegistry = require.cache[registryPath];
  const savedEnv = require.cache[envPath];

  delete require.cache[registryPath];
  delete require.cache[envPath]; // env 在模块加载时读 process.env，必须一并失效
  process.env.AGENT_LLM_PROMPT_VERSION = 'agent-llm-provider-prompt-v999';
  try {
    assert.throws(() => require('../src/services/agentPrompt/promptRegistry'), /AGENT_PROMPT_ACTIVE_UNRESOLVED/);
  } finally {
    if (savedEnvValue === undefined) delete process.env.AGENT_LLM_PROMPT_VERSION;
    else process.env.AGENT_LLM_PROMPT_VERSION = savedEnvValue;
    delete require.cache[registryPath];
    delete require.cache[envPath];
    if (savedEnv) require.cache[envPath] = savedEnv;
    if (savedRegistry) require.cache[registryPath] = savedRegistry;
  }

  // 恢复后注册表健康可用
  assert.equal(resolveActivePromptTemplate().version, 'agent-llm-provider-prompt-v1');
});
