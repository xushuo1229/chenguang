/**
 * Zeno · AI Coach 业务逻辑层 (Phase 13 AI 2.0)
 * ============================================================
 * 【架构落点】
 *
 *   浏览器（AIContext 构建好 Context）
 *     → POST /api/ai/chat { message, history, context, contextVersion }
 *       → aiService.coachChat()          ← 本文件
 *         → promptBuilder（System Prompt + Context 数据块）
 *         → providers/<AI_PROVIDER>      ← Provider Adapter（默认 openaiCompatible）
 *       → { reply, mode:'coach', suggestions, actions, model }
 *
 * 【安全设计】
 * - API Key 只存在于服务端环境变量，绝不下发浏览器、绝不进返回值。
 * - 请求需登录（routes/ai.js authRequired）+ 限流（aiLimiter 15/min）。
 * - message / history 严格校验（角色白名单、条数、长度上限）。
 * - context 校验：必须对象、version='1.0'、序列化长度上限；递归剥离
 *   疑似密钥字段（apiKey/token/password/secret/authorization）纵深防御。
 * - 上游/网络错误只透出友好文案 + 错误码，绝不把原始错误、密钥、内部
 *   堆栈返回给浏览器。
 *
 * 【离线/未配置行为】
 * 未配置 AI_API_KEY 或上游失败时抛 ApiError，前端捕获后展示友好离线提示
 * （应用保持离线优先）。
 * ============================================================
 */
const config = require('../config/env');
const ApiError = require('../utils/ApiError');
const { getProvider } = require('./providers');
const promptBuilder = require('./promptBuilder');
const { CONTEXT_VERSION, sanitizeReflectionContext } = require('./reflectionContext');

// 允许的 role 白名单（防止注入非法角色）
const ALLOWED_ROLES = ['user', 'assistant'];

// Context 中绝对不允许出现的字段名（纵深防御：即使前端被绕过也拦下）
const FORBIDDEN_KEY_RE = /^(api[-_]?key|token|password|secret|authorization)$/i;
const REFLECTION_MAX_OUTPUT_TOKENS = 1200;
const REFLECTION_MAX_REPLY_CHARS = 8000;

function emptyGrowthContext() {
  return {
    version: '1.0',
    today: '未知',
    taskSummary: {},
    focusSummary: {},
    streaks: {},
    goals: {},
    signals: { positive: [], risks: [] },
    suggestions: [],
  };
}

function buildPerformance(growthContext) {
  const tasks = growthContext.taskSummary || {};
  const focus = growthContext.focusSummary || {};
  return {
    tasks: {
      total: Number(tasks.total) || 0,
      completed: Number(tasks.completed) || 0,
      pending: Number(tasks.pending) || 0,
      completionRate: Number(tasks.completionRate) || 0,
      yesterdayPending: Number(tasks.yesterdayPending) || 0,
    },
    focus: {
      minutes: Number(focus.minutes) || 0,
      activeToday: Boolean(focus.activeToday),
    },
    learning: {
      studyMinutes: Number(focus.studyMinutes) || 0,
      exerciseMinutes: Number(focus.exerciseMinutes) || 0,
    },
  };
}

function parseReflectionJson(reply) {
  const text = String(reply || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  if (text.length > REFLECTION_MAX_REPLY_CHARS) {
    console.warn('[AI] Daily Reflection response exceeded the local size limit');
    throw ApiError.internal('AI_INVALID_RESPONSE', 'AI 复盘暂时不可用，请稍后再试');
  }
  try {
    return JSON.parse(text);
  } catch (_) {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch (_) { /* fall through */ }
    }
    console.warn('[AI] Daily Reflection response was not valid JSON');
    throw ApiError.internal('AI_INVALID_RESPONSE', 'AI 复盘暂时不可用，请稍后再试');
  }
}

function normalizeReflection(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw ApiError.internal('AI_INVALID_RESPONSE', 'AI 复盘暂时不可用，请稍后再试');
  }
  const summary = value.summary && typeof value.summary === 'object' ? value.summary : {};
  const asArray = (input) => Array.isArray(input) ? input.slice(0, 3) : [];
  const boundedText = (value, maxLength) => typeof value === 'string' ? value.slice(0, maxLength) : '';
  return {
    summary: {
      title: boundedText(summary.title, 80),
      overview: boundedText(summary.overview, 600),
    },
    insights: asArray(value.insights).filter((item) => item && typeof item === 'object').map((item) => ({
      type: boundedText(item.type, 40),
      content: boundedText(item.content, 400),
    })),
    suggestions: asArray(value.suggestions).filter((item) => item && typeof item === 'object').map((item) => ({
      priority: boundedText(item.priority, 20),
      content: boundedText(item.content, 400),
    })),
  };
}

function normalizeReflectionOwner(userId) {
  if (userId == null) return { userId: null, source: 'legacy-direct-call' };
  const parsed = Number(userId);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw ApiError.unauthorized('UNAUTHORIZED', '未授权');
  }
  return { userId: parsed, source: 'authenticated-client-submitted' };
}

/**
 * 校验并规整前端传入的历史消息（只允许 user / assistant 两种角色）
 *
 * @param {Array} history 前端传来的最近几轮对话
 * @returns {Array} 规整后的 [{ role, content }]
 */
function validateHistory(history) {
  if (history == null) return [];
  if (!Array.isArray(history)) {
    throw ApiError.badRequest('INVALID_MESSAGES', '历史消息格式不正确');
  }
  if (history.length > config.aiMaxMessages) {
    throw ApiError.badRequest('TOO_MANY_MESSAGES', '对话消息过多，请开始新会话');
  }
  return history.map((m) => {
    const role = m && m.role;
    if (!ALLOWED_ROLES.includes(role)) {
      throw ApiError.badRequest('INVALID_ROLE', '非法的消息角色');
    }
    const content = m.content;
    if (typeof content !== 'string' || !content.trim()) {
      throw ApiError.badRequest('INVALID_CONTENT', '消息内容不能为空');
    }
    if (content.length > config.aiMaxMsgLength) {
      throw ApiError.badRequest('CONTENT_TOO_LONG', '单条消息过长');
    }
    return { role, content: content.trim() };
  });
}

/**
 * 递归剥离对象/数组中疑似敏感的字段（纵深防御，不修改入参）
 */
function stripForbiddenKeys(value) {
  if (Array.isArray(value)) return value.map(stripForbiddenKeys);
  if (value && typeof value === 'object') {
    const out = {};
    for (const k of Object.keys(value)) {
      if (FORBIDDEN_KEY_RE.test(k)) continue; // 直接丢弃敏感键
      out[k] = stripForbiddenKeys(value[k]);
    }
    return out;
  }
  return value;
}

/**
 * 校验 Context：对象、version='1.0'、序列化长度上限；剥离敏感键后返回干净副本。
 */
function validateContext(context) {
  if (context == null) return null;
  if (typeof context !== 'object' || Array.isArray(context)) {
    throw ApiError.badRequest('INVALID_CONTEXT', 'Context 格式不正确');
  }
  const clean = stripForbiddenKeys(context);
  if (clean.version !== '1.0') {
    throw ApiError.badRequest('INVALID_CONTEXT_VERSION', 'Context 版本不受支持，请刷新页面');
  }
  const json = JSON.stringify(clean);
  if (json.length > config.aiMaxContextChars) {
    throw ApiError.badRequest('CONTEXT_TOO_LARGE', 'Context 数据过大，请刷新页面重试');
  }
  return clean;
}

/**
 * AI Coach 对话入口
 *
 * @param {Object} p
 * @param {string} p.message        用户本轮问题（必填）
 * @param {Array}  [p.history]      最近的 user/assistant 历史（不含本轮）
 * @param {Object} [p.context]      前端 AIContext 构建的结构化上下文
 * @param {string} [p.contextVersion] Context 版本
 * @returns {Promise<{ reply, mode, suggestions, actions, model }>}
 */
async function coachChat(p) {
  p = p || {};
  const message = p.message;
  if (typeof message !== 'string' || !message.trim()) {
    throw ApiError.badRequest('INVALID_MESSAGE', '请输入你的问题');
  }
  if (message.length > config.aiMaxMsgLength) {
    throw ApiError.badRequest('MESSAGE_TOO_LONG', '问题过长，请精简后再试');
  }

  const provider = getProvider(config.aiProvider);
  if (!provider) {
    throw ApiError.internal('AI_NOT_CONFIGURED', 'AI 服务未配置，请稍后再试');
  }

  const history = validateHistory(p.history);
  const context = validateContext(p.context);

  // —— 组装消息：System(后端所有权) + Context 数据块 + 历史 + 本轮问题 ——
  const messages = [{ role: 'system', content: promptBuilder.buildSystemPrompt({ today: context && context.today }) }];
  if (context) {
    messages.push({ role: 'user', content: promptBuilder.buildContextBlock(context, p.contextVersion) });
    const coachBlock = promptBuilder.buildCoachBlock(context.coach);
    if (coachBlock) {
      messages.push({ role: 'user', content: coachBlock });
    }
  }
  for (const h of history) messages.push(h);
  messages.push({ role: 'user', content: message.trim() });

  const result = await provider.chatCompletion({
    messages,
    baseUrl: config.aiBaseUrl,
    apiKey: config.aiApiKey,
    model: config.aiModel,
    timeoutMs: config.aiTimeoutMs,
  });

  // suggestions / actions 由确定性 insights 派生（不解析模型自由文本）
  return {
    reply: result.reply,
    mode: 'coach',
    suggestions: promptBuilder.deriveSuggestions(context),
    actions: promptBuilder.deriveActions(context),
    model: result.model,
  };
}

/**
 * AI Daily Reflection 入口：GrowthContext → Reflection Prompt → Provider → Structured JSON。
 * performance 由后端从 GrowthContext 确定性生成，AI 无法伪造行为数字。
 */
async function dailyReflection(p) {
  p = p || {};
  const provider = getProvider(config.aiProvider);
  if (!provider) {
    throw ApiError.internal('AI_NOT_CONFIGURED', 'AI 服务未配置，请稍后再试');
  }

  const owner = normalizeReflectionOwner(p.userId);
  const growthContext = sanitizeReflectionContext(p.growthContext);
  const result = await provider.chatCompletion({
    messages: promptBuilder.buildReflectionPrompt(growthContext),
    maxTokens: REFLECTION_MAX_OUTPUT_TOKENS,
    baseUrl: config.aiBaseUrl,
    apiKey: config.aiApiKey,
    model: config.aiModel,
    timeoutMs: config.aiTimeoutMs,
  });

  const reflection = normalizeReflection(parseReflectionJson(result.reply));
  reflection.performance = buildPerformance(growthContext);
  return {
    reflection,
    contextVersion: CONTEXT_VERSION,
    model: result.model,
    contextSource: owner.source,
  };
}

module.exports = {
  coachChat,
  dailyReflection,
  validateHistory,
  validateContext,
  stripForbiddenKeys,
  sanitizeReflectionContext,
};
