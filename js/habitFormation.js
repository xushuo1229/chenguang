'use strict';

var VERSION = '1.2';

var WEIGHTS = { frequency: 0.35, consistency: 0.30, continuity: 0.35 };
var THRESHOLDS = {
  habitScore: 0.5,
  frequency: 0.3,
  maxConsecutive: 3,
  minSamples: 3,
  currentConsecutive: 2,
  consistency: 0.1
};
var STATUS_VALUES = ['insufficient', 'not_forming', 'early', 'forming', 'stable'];
var REASON_VALUES = ['insufficient_data', 'low_frequency', 'low_continuity', 'unstable', 'habit_stopped', 'forming'];
var STAGE_THRESHOLDS = { forming: 7, stable: 14 };

function num(value) {
  var n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function clamp01(value) {
  if (value == null || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, Math.round(value * 1000) / 1000));
}

function toDateKey(value) {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    var year = value.getFullYear();
    var month = value.getMonth() + 1;
    var day = value.getDate();
    return year + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0');
  }

  if (typeof value !== 'string') return null;
  var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  var utcDate = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (
    utcDate.getUTCFullYear() !== Number(match[1]) ||
    utcDate.getUTCMonth() !== Number(match[2]) - 1 ||
    utcDate.getUTCDate() !== Number(match[3])
  ) return null;
  return value;
}

function dateKeyToUtc(key) {
  var parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  return Date.UTC(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]));
}

function normalizeObservations(windowSeries, todayKey) {
  var byDate = {};
  var invalidObservations = 0;
  var futureObservations = 0;
  var duplicateObservations = 0;

  for (var i = 0; i < windowSeries.length; i++) {
    var item = windowSeries[i];
    var dateKey = item && typeof item === 'object' ? toDateKey(item.date) : null;
    if (!dateKey) {
      invalidObservations++;
      continue;
    }
    if (todayKey && dateKey > todayKey) {
      futureObservations++;
      continue;
    }

    var rawValue = item && typeof item === 'object' ? Number(item.value) : 0;
    var value = Number.isFinite(rawValue) ? rawValue : 0;
    if (Object.prototype.hasOwnProperty.call(byDate, dateKey)) {
      duplicateObservations++;
    }
    byDate[dateKey] = value;
  }

  var dateKeys = Object.keys(byDate).sort();
  return {
    byDate: byDate,
    dateKeys: dateKeys,
    invalidObservations: invalidObservations,
    futureObservations: futureObservations,
    duplicateObservations: duplicateObservations
  };
}

function detectHabitFormation(dailySeries, windowDays, opts) {
  var options = opts && typeof opts === 'object' ? opts : {};
  var minFrequency = Number.isFinite(options.minFrequency)
    ? clamp01(options.minFrequency)
    : THRESHOLDS.frequency;

  var source = Array.isArray(dailySeries) ? dailySeries : [];
  var requestedDays = num(windowDays);
  if (!Number.isFinite(requestedDays) || requestedDays <= 0) {
    requestedDays = source.length || 1;
  }
  var days = Math.max(1, Math.floor(requestedDays));
  var windowSeries = source.slice(Math.max(0, source.length - days));
  var todayKey = toDateKey(options.today);
  var observation = normalizeObservations(windowSeries, todayKey);
  var values = observation.dateKeys.map(function (dateKey) {
    return observation.byDate[dateKey];
  });
  var activeDays = values.filter(function (v) { return v > 0; }).length;

  var maxConsecutive = 0;
  var current = 0;
  for (var i = 0; i < observation.dateKeys.length; i++) {
    var dateKey = observation.dateKeys[i];
    var active = observation.byDate[dateKey] > 0;
    if (!active) {
      current = 0;
    } else if (current > 0 && dateKeyToUtc(dateKey) - dateKeyToUtc(observation.dateKeys[i - 1]) === 86400000) {
      current++;
    } else {
      current = 1;
    }
    if (current > maxConsecutive) maxConsecutive = current;
  }
  var currentConsecutive = current;
  var coverageDays = Math.max(days, observation.dateKeys.length ? (dateKeyToUtc(observation.dateKeys[observation.dateKeys.length - 1]) - dateKeyToUtc(observation.dateKeys[0])) / 86400000 + 1 : 1);

  var result = {
    version: VERSION,
    isHabitForming: false,
    habitScore: 0,
    frequency: 0,
    consistency: 0,
    maxConsecutive: maxConsecutive,
    currentConsecutive: current,
    activeDays: activeDays,
    windowDays: days,
    evidence: observation.invalidObservations > 0
      ? '已排除 ' + observation.invalidObservations + ' 条无效记录，暂时无法判断习惯形成。'
      : '',
    status: 'insufficient',
    reason: 'insufficient_data'
  };

  if (activeDays < THRESHOLDS.minSamples) {
    result.evidence = (result.evidence ? result.evidence + ' ' : '') +
      '记录不足 ' + THRESHOLDS.minSamples + ' 天，暂时无法判断习惯形成。';
    return result;
  }

  result.frequency = clamp01(activeDays / coverageDays);

  var nonZero = values.filter(function (v) { return v > 0; });
  var mean = nonZero.reduce(function (s, v) { return s + v; }, 0) / nonZero.length;
  var variance = mean ? nonZero.reduce(function (s, v) { return s + Math.pow(v - mean, 2); }, 0) / nonZero.length : 0;
  var cv = mean ? Math.sqrt(variance) / mean : 1;
  result.consistency = clamp01(1 - cv);

  result.maxConsecutive = maxConsecutive;
  result.currentConsecutive = currentConsecutive;

  var continuityScore = clamp01(maxConsecutive / days);
  result.habitScore = clamp01(
    result.frequency * WEIGHTS.frequency +
    result.consistency * WEIGHTS.consistency +
    continuityScore * WEIGHTS.continuity
  );

  result.isHabitForming =
    result.habitScore >= THRESHOLDS.habitScore &&
    result.frequency >= minFrequency &&
    maxConsecutive >= THRESHOLDS.maxConsecutive;

  var hasActiveStreakEvidence =
    currentConsecutive >= THRESHOLDS.currentConsecutive &&
    maxConsecutive >= THRESHOLDS.maxConsecutive &&
    result.consistency >= THRESHOLDS.consistency;

  if (currentConsecutive === 0) {
    result.status = 'not_forming';
    result.reason = deriveNegativeReason(result, minFrequency);
    result.evidence = '近 ' + days + ' 天有 ' + activeDays + ' 天记录该行为，当前没有连续记录。';
  } else if (result.isHabitForming) {
    if (currentConsecutive < STAGE_THRESHOLDS.forming) {
      result.status = 'early';
    } else if (currentConsecutive < STAGE_THRESHOLDS.stable) {
      result.status = 'forming';
    } else if (result.frequency >= 0.5 && result.consistency >= 0.5) {
      result.status = 'stable';
    } else {
      result.status = 'forming';
    }
    result.reason = result.consistency >= THRESHOLDS.consistency ? 'forming' : 'unstable';
    result.evidence = '近 ' + days + ' 天有 ' + activeDays + ' 天记录该行为，当前连续 ' + currentConsecutive + ' 天，行为值保持稳定。';
  } else if (hasActiveStreakEvidence) {
    result.status = 'early';
    result.reason = deriveNegativeReason(result, minFrequency);
    result.evidence = '近 ' + days + ' 天有 ' + activeDays + ' 天记录该行为，出现早期形成趋势但尚未达到稳定习惯标准。';
  } else {
    result.status = 'not_forming';
    result.reason = deriveNegativeReason(result, minFrequency);
    result.evidence = '近 ' + days + ' 天有 ' + activeDays + ' 天记录该行为，尚未达到稳定习惯标准。';
  }

  if (observation.duplicateObservations > 0) {
    result.evidence += '已合并 ' + observation.duplicateObservations + ' 条重复记录。';
  }
  if (observation.invalidObservations > 0) {
    result.evidence += '已排除 ' + observation.invalidObservations + ' 条无效记录。';
  }
  if (observation.futureObservations > 0) {
    result.evidence += '已排除 ' + observation.futureObservations + ' 条未来记录。';
  }

  return result;
}

function deriveNegativeReason(result, minFrequency) {
  if (result.currentConsecutive === 0 && result.maxConsecutive >= THRESHOLDS.maxConsecutive) {
    return 'habit_stopped';
  }
  if (result.frequency < minFrequency) {
    return 'low_frequency';
  }
  if (result.maxConsecutive < THRESHOLDS.maxConsecutive) {
    return 'low_continuity';
  }
  if (result.consistency < THRESHOLDS.consistency || result.habitScore < THRESHOLDS.habitScore) {
    return 'unstable';
  }
  return 'unstable';
}

var HabitFormation = {
  VERSION: VERSION,
  WEIGHTS: WEIGHTS,
  THRESHOLDS: THRESHOLDS,
  STATUS_VALUES: STATUS_VALUES,
  REASON_VALUES: REASON_VALUES,
  detectHabitFormation: detectHabitFormation
};

globalThis.CGHabitFormation = HabitFormation;

export default HabitFormation;
export { detectHabitFormation };
