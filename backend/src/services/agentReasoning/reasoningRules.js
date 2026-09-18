'use strict';

const { normalizeEvidenceRef } = require('./reasoningContract');

const RULES = {
  focus_increase: {
    title: '为什么出现专注趋势观察？',
    why: '该观察比较了最近 3 天与此前 4 天的专注记录。',
  },
  focus_decline: {
    title: '为什么出现专注趋势观察？',
    why: '该观察比较了最近 3 天与此前 4 天的专注记录。',
  },
  consistency_stable: {
    title: '为什么出现学习连续性观察？',
    why: '该观察基于最近 7 天的学习活跃天数。',
  },
  consistency_drop: {
    title: '为什么出现学习连续性观察？',
    why: '该观察基于最近 7 天的学习活跃天数变化。',
  },
  knowledge_gap_detected: {
    title: '为什么出现知识缺口观察？',
    why: '该观察聚合了当前用户 Knowledge State 中的薄弱主题。',
  },
  course_progress_status: {
    title: '为什么出现课程进度观察？',
    why: '该观察统计了 Course Knowledge Adapter 返回的知识节点状态。',
  },
};

function buildExplanationForInsight(insight) {
  if (!insight || !insight.id || !insight.type || !Array.isArray(insight.evidence) || !insight.evidence.length) {
    return null;
  }

  const rule = RULES[insight.type] || {
    title: '为什么出现这条学习观察？',
    why: `该观察来自 ${insight.source || '已授权 Adapter'} 的确定性投影。`,
  };
  const evidenceRefs = insight.evidence.slice(0, 3).map((evidence, index) => normalizeEvidenceRef({
    insightId: insight.id,
    index,
    source: evidence.source,
    metric: evidence.metric,
    period: evidence.period,
  })).filter((ref) => ref.metric);

  if (!evidenceRefs.length) return null;

  return {
    insightId: insight.id,
    insightType: insight.type,
    title: rule.title,
    why: rule.why,
    evidenceRefs,
    confidence: insight.confidence,
    actionLevel: 'insight_only',
  };
}

module.exports = {
  buildExplanationForInsight,
};
