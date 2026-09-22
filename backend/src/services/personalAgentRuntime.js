'use strict';

const agentHomeService = require('./agentHomeService');
const agentInsightService = require('./agentInsightService');
const adaptiveReviewService = require('./adaptiveReviewService');
const personalLearningAgentService = require('./personalLearningAgentService');
const studentPracticeService = require('./studentPracticeService');
const { getProvider } = require('./providers');
const { resolveAgentProvider } = require('./agentProvider/providerRegistry');
const config = require('../config/env');
const ApiError = require('../utils/ApiError');
const {
  runLearningConversation,
} = require('./agentLearningConversation/learningConversationRuntime');

const CONTEXT_VERSION = 'personal-agent-context-v1';
const CHAT_VERSION = 'personal-agent-chat-v1';
const MODES = new Set(['personal', 'general']);
const MAX_ITEMS = 5;

function unauthorized() {
  return ApiError.unauthorized('UNAUTHORIZED', '请先登录');
}

function requireOwner(userId) {
  const owner = Number(userId);
  if (!Number.isInteger(owner) || owner <= 0) throw unauthorized();
  return owner;
}

function boundedText(value, maxLength) {
  return String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, maxLength);
}

function boundedItems(items, limit = MAX_ITEMS) {
  return Array.isArray(items) ? items.filter(Boolean).slice(0, limit) : [];
}

function normalizeChatInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw ApiError.badRequest('INVALID_INPUT', '请求格式不正确');
  }
  const allowed = new Set(['message', 'mode', 'conversationId']);
  if (Object.keys(input).some((key) => !allowed.has(key))) {
    throw ApiError.badRequest('INVALID_INPUT', '请求包含不支持的字段');
  }
  const message = boundedText(input.message, 1000);
  if (!message) throw ApiError.badRequest('INVALID_MESSAGE', '请输入你的问题');
  const mode = input.mode === undefined ? 'personal' : input.mode;
  if (!MODES.has(mode)) throw ApiError.badRequest('INVALID_MODE', '对话模式不受支持');
  let conversationId = 'inline';
  if (input.conversationId !== undefined) {
    conversationId = boundedText(input.conversationId, 64);
    if (!/^[A-Za-z0-9_-]+$/.test(conversationId)) {
      throw ApiError.badRequest('INVALID_CONVERSATION_ID', '会话 ID 格式不正确');
    }
  }
  return { message, mode, conversationId };
}

function actionProposals(overview) {
  const next = overview.perception && overview.perception.nextBestRecommendation;
  if (!next) return [];
  return [{
    id: `learning:${overview.courseId}:${next.knowledgeNodeId}`,
    type: 'learning_action',
    title: `评估「${next.nodeTitle}」`,
    courseId: overview.courseId,
    knowledgeNodeId: next.knowledgeNodeId,
    status: 'proposal',
    requiresConfirmation: true,
    reason: next.riskReason || 'learning_state',
  }];
}

function defaultRuntimeProvider() {
  const adapter = resolveAgentProvider();
  const hasCredential = Boolean(config.agentLlmApiKey || config.aiApiKey);
  if (adapter && adapter.name === 'openaiCompatible' && !hasCredential) {
    return {
      name: 'notConfigured',
      async generateExplanation() {
        return {
          status: 'failed',
          reason: 'llm_not_configured',
          provider: 'notConfigured',
          model: '',
          promptVersion: '',
          requestId: 'not-configured',
          latencyMs: 1,
        };
      },
    };
  }
  return adapter;
}

function projectSelectedEvidence(selection) {
  return boundedItems(selection && selection.selectedItems).map((item) => ({
    id: item.sourceId,
    title: item.text,
    source: item.sourceId,
    authority: item.provenance && item.provenance.adapter ? item.provenance.adapter : 'agent_context_selection',
    confidence: Number(item.confidence) || 0,
  }));
}

function formatPersonalAnswer(explanation, evidence) {
  if (!explanation || !explanation.output) {
    return '当前学习上下文不足，暂时无法生成完整回答。';
  }
  const output = explanation.output;
  const facts = boundedItems(output.explanations).filter((item) => item.type === 'fact');
  const interpretations = boundedItems(output.explanations).filter((item) => item.type === 'interpretation');
  const suggestions = boundedItems(output.suggestions);
  const lines = [];
  if (facts.length) lines.push(`发现：\n${facts.map((item) => `- ${item.text}`).join('\n')}`);
  if (evidence.length) lines.push(`依据：\n${evidence.map((item) => `- ${item.title}（${item.source}）`).join('\n')}`);
  if (interpretations.length) lines.push(`解释：\n${interpretations.map((item) => `- ${item.text}`).join('\n')}`);
  if (suggestions.length) lines.push(`建议：\n${suggestions.map((item) => `- ${item.text}`).join('\n')}`);
  return lines.join('\n\n') || '当前证据不足以给出确定性回答。';
}

async function buildDisplayContext({ userId }) {
  const owner = requireOwner(userId);
  const context = await agentHomeService.buildAgentHomeContext({ userId: owner });
  const insightResult = agentInsightService.buildInsights(context);
  const course = boundedItems(context.courses && context.courses.value, 1)[0] || null;
  const [overview, practice] = await Promise.all([
    course ? personalLearningAgentService.buildOverview({ userId: owner, courseId: course.courseId }) : null,
    course ? studentPracticeService.listPracticeAttempts({
      userId: owner,
      query: { courseId: course.courseId, limit: MAX_ITEMS },
    }) : null,
  ]);

  return {
    version: CONTEXT_VERSION,
    userId: owner,
    readOnly: true,
    permissions: { read: ['personal_learning_context'], write: [] },
    context: {
      courses: context.courses,
      behavior: context.behavior,
      courseKnowledge: context.courseKnowledge,
      knowledgeStates: context.knowledgeStates,
      memories: context.memories,
    },
    previousInsights: boundedItems(insightResult.insights),
    review: overview ? {
      courseId: overview.courseId,
      stateCounts: overview.perception.stateCounts,
      nextBestRecommendation: overview.perception.nextBestRecommendation,
    } : null,
    plan: overview ? overview.plan : null,
    actions: overview ? actionProposals(overview) : [],
    practice: practice ? { attempts: boundedItems(practice.attempts) } : null,
    metadata: {
      generatedAt: new Date().toISOString(),
      actionLevel: 'insight_only',
      providerIndependent: true,
      llmRequired: false,
    },
  };
}

async function runGeneralMode(message, generalProvider) {
  const provider = generalProvider || getProvider(config.aiProvider);
  if (!provider) {
    return {
      answer: '通用 AI 服务暂时未配置，不能访问你的个人数据，请稍后再试。',
      mode: 'general',
      evidence: [],
      insights: [],
      confidence: 0,
      actions: [],
      provider: { interface: 'agentProvider-v1', name: config.aiProvider, model: '' },
      metadata: { fallback: true, reason: 'llm_not_configured' },
    };
  }
  try {
    const result = await provider.chatCompletion({
      messages: [{ role: 'user', content: message }],
      baseUrl: config.aiBaseUrl,
      apiKey: config.aiApiKey,
      model: config.aiModel,
      timeoutMs: config.aiTimeoutMs,
    });
    const answer = boundedText(result && result.reply, 8000);
    if (!answer) throw ApiError.internal('AI_EMPTY_REPLY', 'AI 响应为空');
    return {
      answer,
      mode: 'general',
      evidence: [],
      insights: [],
      confidence: 0.6,
      actions: [],
      provider: { interface: 'agentProvider-v1', name: config.aiProvider, model: (result && result.model) || '' },
    };
    } catch (err) {
      const fallbackReason = err && err.code === 'AI_NOT_CONFIGURED' ? 'llm_not_configured' : 'provider_unavailable';
      const answer = fallbackReason === 'llm_not_configured'
        ? '通用 AI 服务暂时未配置，不能访问你的个人数据，请稍后再试。'
        : 'AI 服务暂时不可用，请稍后再试。';
      return {
        answer,
        mode: 'general',
        evidence: [],
        insights: [],
        confidence: 0,
        actions: [],
        provider: { interface: 'agentProvider-v1', name: config.aiProvider, model: '' },
        metadata: { fallback: true, reason: fallbackReason },
      };
    }
}

async function runPersonalMode(message, options = {}) {
  const context = await buildDisplayContext({ userId: options.userId });
  const course = boundedItems(context.context.courses.value, 1)[0] || null;
  const conversation = await runLearningConversation({
    userId: options.userId,
    query: message,
    currentCourseLabel: course ? course.name : undefined,
    options: { provider: options.provider || defaultRuntimeProvider() },
  });

  const evidence = conversation.contextSelection && conversation.contextSelection.status === 'selected'
    ? projectSelectedEvidence(conversation.contextSelection)
    : [];
  const answer = conversation.status === 'clarification_required'
    ? '当前学习上下文不足以确定你的问题，请补充课程或知识点。'
    : formatPersonalAnswer(conversation.explanation, evidence);
  const explanations = conversation.explanation && conversation.explanation.output && Array.isArray(conversation.explanation.output.explanations)
    ? conversation.explanation.output.explanations
    : [];
  const insights = explanations
    .filter((item) => item.type === 'interpretation')
    .slice(0, MAX_ITEMS)
    .map((item) => ({ id: item.id, title: item.text, confidence: Number(item.generationConfidence) || 0 }));
  const confidenceScores = explanations
    .map((item) => Number(item.generationConfidence))
    .filter((value) => Number.isFinite(value) && value >= 0 && value <= 1);
  const confidence = confidenceScores.length
    ? confidenceScores.reduce((sum, value) => sum + value, 0) / confidenceScores.length
    : 0;

  return {
    answer,
    mode: 'personal',
    evidence,
    insights,
    confidence,
    actions: context.actions,
    conversationId: options.conversationId,
    provider: {
      interface: 'agentProvider-v1',
      name: conversation.metadata.provider || '',
      model: conversation.metadata.model || '',
    },
    metadata: {
      status: conversation.status,
      fallback: conversation.status === 'fallback',
      fallbackReason: conversation.metadata.fallbackReason || null,
      readOnly: true,
      actionLevel: conversation.metadata.actionLevel,
    },
  };
}

async function chat({ userId, message, mode, conversationId, provider, generalProvider }) {
  const owner = requireOwner(userId);
  const input = normalizeChatInput({ message, mode, conversationId });
  if (input.mode === 'general') {
    const result = await runGeneralMode(input.message, generalProvider);
    return { version: CHAT_VERSION, userId: owner, readOnly: true, ...result };
  }
  const result = await runPersonalMode(input.message, {
    userId: owner,
    conversationId: input.conversationId,
    provider,
  });
  return { version: CHAT_VERSION, userId: owner, readOnly: true, ...result };
}

module.exports = {
  CHAT_VERSION,
  CONTEXT_VERSION,
  buildDisplayContext,
  chat,
  normalizeChatInput,
};
