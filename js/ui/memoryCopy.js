'use strict';

var MEMORY_TYPE_LABELS = {
  Habit: '学习习惯',
  Pattern: '成长规律',
  Achievement: '阶段成果',
  Risk: '需要关注',
  Preference: '个人偏好',
  GoalHistory: '目标记录'
};

var EVIDENCE_LABELS = {
  focus: '专注记录',
  study: '学习记录',
  reading: '阅读记录',
  exercise: '运动记录',
  todo: '任务完成情况',
  goal: '目标进度',
  course: '课程进度',
  current_streak: '连续成长记录',
  completed_goals: '已完成目标'
};

var LIFECYCLE_LABELS = {
  confirmed: '保留中',
  aging: '等待新记录更新',
  expired: '暂不参与分析'
};

function formatMemoryType(type) {
  return MEMORY_TYPE_LABELS[type] || '成长记录';
}

function evidenceLabel(metric) {
  return EVIDENCE_LABELS[metric] || metric;
}

function formatEvidence(evidence) {
  if (!Array.isArray(evidence)) return '';
  return evidence.map(function (row) {
    if (!row || typeof row !== 'object') return '';
    var value = row.value;
    var sign = typeof value === 'number' && value > 0 ? '+' : '';
    return evidenceLabel(row.metric) + ' ' + sign + value;
  }).filter(Boolean).join('；');
}

function formatConfidence(item, opts) {
  if (opts && opts.confirmed) return '你已确认';
  var confidence = Number(item && item.confidence);
  if (!Number.isFinite(confidence)) return '初步观察';
  if (confidence >= 0.7) return '较多记录支持';
  if (confidence >= 0.4) return '有一定记录支持';
  return '初步观察';
}

function formatLifecycle(lifecycle) {
  return LIFECYCLE_LABELS[lifecycle && lifecycle.stage] || '';
}

export { evidenceLabel, formatConfidence, formatEvidence, formatLifecycle, formatMemoryType };
