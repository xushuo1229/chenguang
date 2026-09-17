'use strict';

var VERSION = '1.0';
var MAX_ITEMS = 8;
var TYPES = ['achievement', 'milestone', 'progress', 'consistency'];
var SOURCES = ['Analytics', 'Goals', 'GrowthIntelligence'];
var TYPE_PRIORITY = { achievement: 0, milestone: 1, progress: 2, consistency: 3 };
var DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
var MAX_STAGE_EVIDENCE = 2;
var NARRATIVE_STAGES = [
  {
    id: 'stage:start',
    label: '起点',
    meaning: '你的成长档案开始形成。',
    matches: ['timeline:first_record']
  },
  {
    id: 'stage:building',
    label: '稳定尝试',
    meaning: '你开始把记录变成一种节奏。',
    matches: ['timeline:streak_7']
  },
  {
    id: 'stage:steady',
    label: '稳定节奏',
    meaning: '连续执行正在变得更稳定。',
    matches: ['timeline:streak_30', 'timeline:streak_90', 'timeline:active_days_30d']
  },
  {
    id: 'stage:accumulation',
    label: '投入积累',
    meaning: '记录开始转化为可观察的投入。',
    matches: [
      'timeline:learning_600_30d',
      'timeline:focus_180_30d',
      'timeline:reading_200_30d',
      'timeline:exercise_300_30d'
    ]
  },
  {
    id: 'stage:achievement',
    label: '阶段成果',
    meaning: '投入已经转化为阶段性结果。',
    matches: [
      'timeline:goal_completed_1',
      'timeline:goal_completed_3',
      'timeline:goal_completed_10',
      'timeline:course_completed_1',
      'timeline:course_completed_5'
    ]
  },
  {
    id: 'stage:direction',
    label: '当前方向',
    meaning: '数据显示当前节奏正在产生变化。',
    prefixes: ['timeline:improvement_']
  }
];

function arr(value) {
  return Array.isArray(value) ? value : [];
}

function number(value) {
  var parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isValidDate(value) {
  return DATE_RE.test(String(value || ''));
}

function clampConfidence(value) {
  return Math.max(0, Math.min(1, Math.round(number(value) * 100) / 100));
}

function summary(state, name) {
  var domain = state && state[name];
  return domain && domain.summary ? domain.summary : {};
}

function makeItem(id, type, source, title, description, asOf, confidence, items) {
  if (!id || TYPES.indexOf(type) < 0 || SOURCES.indexOf(source) < 0) return;
  if (!title || !description || !isValidDate(asOf)) return;
  if (items.some(function (item) { return item.id === id; })) return;
  items.push({
    id: id,
    type: type,
    title: title,
    description: description,
    source: source,
    asOf: asOf,
    confidence: clampConfidence(confidence)
  });
}

function addFirstRecord(personalBest, today, items) {
  var firstRecordDate = personalBest && isValidDate(personalBest.firstRecordDate)
    ? personalBest.firstRecordDate
    : '';
  if (!firstRecordDate) return;
  makeItem(
    'timeline:first_record',
    'achievement',
    'Analytics',
    '第一次成长记录',
    '从这一天开始，你的记录轨迹有了起点。',
    firstRecordDate,
    0.9,
    items
  );
}

function addCurrentStreak(state, today, items) {
  var streak = number(summary(state, 'consistencyState').currentStreak);
  var thresholds = [
    { days: 90, confidence: 0.98 },
    { days: 30, confidence: 0.94 },
    { days: 7, confidence: 0.88 }
  ];
  var reached = thresholds.find(function (threshold) { return streak >= threshold.days; });
  if (!reached) return;
  makeItem(
    'timeline:streak_' + reached.days,
    'milestone',
    'Analytics',
    '连续成长记录达到 ' + reached.days + ' 天',
    '保持连续成长记录，当前是 ' + streak + ' 天。',
    today,
    reached.confidence,
    items
  );
}

function addGoals(state, today, items) {
  var completed = number(summary(state, 'goalState').completed);
  var thresholds = [
    { count: 10, confidence: 0.99 },
    { count: 3, confidence: 0.95 },
    { count: 1, confidence: 0.9 }
  ];
  var reached = thresholds.find(function (threshold) { return completed >= threshold.count; });
  if (!reached) return;
  makeItem(
    'timeline:goal_completed_' + reached.count,
    'achievement',
    'Goals',
    '目标已完成',
    '截至目前，已有 ' + completed + ' 个目标达成。',
    today,
    reached.confidence,
    items
  );
}

function addCourses(courseSummary, today, items) {
  var done = number(courseSummary && courseSummary.done);
  var threshold = done >= 5 ? 5 : done >= 1 ? 1 : 0;
  if (!threshold) return;
  makeItem(
    'timeline:course_completed_' + threshold,
    'achievement',
    'Analytics',
    '课程阶段完成',
    '已完成 ' + done + ' 门课程，学习阶段又向前推进了一步。',
    today,
    threshold === 5 ? 0.92 : 0.86,
    items
  );
}

function addBreakthroughs(state, today, items) {
  var learning = number(summary(state, 'learningState').minutes30);
  var focus = number(summary(state, 'focusState').minutes30);
  var reading = number(summary(state, 'readingState').pages30);
  var exercise = number(summary(state, 'exerciseState').minutes30);

  if (learning >= 600) {
    makeItem('timeline:learning_600_30d', 'milestone', 'GrowthIntelligence',
      '学习投入达到新阶段', '近 30 天学习投入达到 ' + learning + ' 分钟。', today, 0.93, items);
  }
  if (focus >= 180) {
    makeItem('timeline:focus_180_30d', 'milestone', 'GrowthIntelligence',
      '专注记录达到新的阶段', '近 30 天专注时长达到 ' + focus + ' 分钟。', today, 0.92, items);
  }
  if (reading >= 200) {
    makeItem('timeline:reading_200_30d', 'progress', 'GrowthIntelligence',
      '阅读积累达到新记录', '近 30 天累计阅读 ' + reading + ' 页。', today, 0.82, items);
  }
  if (exercise >= 300) {
    makeItem('timeline:exercise_300_30d', 'progress', 'GrowthIntelligence',
      '运动积累达到新记录', '近 30 天运动时长达到 ' + exercise + ' 分钟。', today, 0.8, items);
  }
}

function addPositiveTrends(state, today, items) {
  arr(state && state.importantChanges)
    .filter(function (trend) {
      return trend && (trend.status === 'rising' || trend.status === 'new_activity') && number(trend.delta) >= 20;
    })
    .sort(function (a, b) { return number(b.delta) - number(a.delta); })
    .slice(0, 1)
    .forEach(function (trend, index) {
      var metric = String(trend.metric || 'metric').slice(0, 30);
      var label = String(trend.label || '一项学习指标').slice(0, 40);
      makeItem(
        'timeline:improvement_' + metric + '_' + Math.round(number(trend.delta)),
        'progress',
        'GrowthIntelligence',
        '数据显示' + label + '正在改善',
        '近期出现约 ' + number(trend.delta) + '% 的增长。',
        today,
        0.66 + Math.min(0.2, Math.abs(number(trend.delta)) / 200) - index * 0.01,
        items
      );
    });
}

function addConsistency(state, today, items) {
  var activeDays = number(summary(state, 'consistencyState').activeDays30);
  if (activeDays < 12) return;
  makeItem(
    'timeline:active_days_30d',
    'consistency',
    'GrowthIntelligence',
    '记录节奏保持稳定',
    '近 30 天有 ' + activeDays + ' 天保持活跃。',
    today,
    0.85,
    items
  );
}

function buildTimeline(input) {
  var source = input && typeof input === 'object' ? input : {};
  var state = source.growthState && typeof source.growthState === 'object' ? source.growthState : {};
  var today = isValidDate(source.today) ? source.today
    : isValidDate(state.today) ? state.today
      : '';
  var items = [];

  if (!today) {
    return { version: VERSION, today: '', dataSufficient: false, timeline: [] };
  }

  addFirstRecord(source.personalBest, today, items);
  addGoals(state, today, items);
  addCourses(source.courseSummary, today, items);
  addCurrentStreak(state, today, items);
  addBreakthroughs(state, today, items);
  addPositiveTrends(state, today, items);
  addConsistency(state, today, items);

  items.sort(function (a, b) {
    var priority = TYPE_PRIORITY[a.type] - TYPE_PRIORITY[b.type];
    return priority !== 0 ? priority : b.confidence - a.confidence;
  });

  return {
    version: VERSION,
    today: today,
    dataSufficient: items.length > 0,
    timeline: items.slice(0, MAX_ITEMS)
  };
}

function nodeMatchesStage(node, stage) {
  if (!node || !node.id) return false;
  return (arr(stage.matches).indexOf(node.id) >= 0 ||
    arr(stage.prefixes).some(function (prefix) { return String(node.id).indexOf(prefix) === 0; }));
}

function buildNarrative(projection) {
  var source = projection && typeof projection === 'object' ? projection : {};
  var today = isValidDate(source.today) ? source.today : '';
  var nodes = arr(source.timeline).filter(function (node) {
    return node && node.id && Number.isFinite(Number(node.confidence));
  });

  if (!today) {
    return {
      version: VERSION,
      today: '',
      dataSufficient: false,
      summary: '',
      currentStage: null,
      stages: []
    };
  }

  var stages = NARRATIVE_STAGES.map(function (stage) {
    var evidence = nodes
      .filter(function (node) { return nodeMatchesStage(node, stage); })
      .sort(function (a, b) { return clampConfidence(b.confidence) - clampConfidence(a.confidence); })
      .slice(0, MAX_STAGE_EVIDENCE);

    return {
      id: stage.id,
      label: stage.label,
      meaning: stage.meaning,
      evidenceIds: evidence.map(function (node) { return node.id; }),
      confidence: evidence.reduce(function (max, node) {
        return Math.max(max, clampConfidence(node.confidence));
      }, 0)
    };
  }).filter(function (stage) { return stage.evidenceIds.length > 0; });

  return {
    version: VERSION,
    today: today,
    dataSufficient: stages.length > 0,
    summary: stages.length
      ? '成长阶段：' + stages.map(function (stage) { return stage.label; }).join(' → ') + '。'
      : '',
    currentStage: stages.length ? stages[stages.length - 1] : null,
    stages: stages
  };
}

var GrowthTimeline = {
  VERSION: VERSION,
  MAX_ITEMS: MAX_ITEMS,
  TYPES: TYPES,
  SOURCES: SOURCES,
  buildTimeline: buildTimeline,
  buildNarrative: buildNarrative
};

globalThis.CGGrowthTimeline = GrowthTimeline;

export default GrowthTimeline;
export { buildTimeline, buildNarrative };
