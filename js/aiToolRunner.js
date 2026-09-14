'use strict';

import AIRetrieval from './aiDataRetrieval.js';
import { todayStr } from './utils/date.js';
import { isValidDateStr } from './analytics.js';

var VERSION = '1.0';
var MAX_TOOL_CALLS = 5;
var MAX_RESULT_CHARS = 8192;
var MAX_TOTAL_CHARS = 32768;

var TOOL_HANDLERS = {
  today_summary: AIRetrieval.getTodaySummary,
  recent_trends: AIRetrieval.getRecentTrends,
  learning_history: AIRetrieval.getLearningHistory,
  course_progress: AIRetrieval.getCourseProgress,
  english_history: AIRetrieval.getEnglishHistory,
  reading_history: AIRetrieval.getReadingHistory,
  exercise_history: AIRetrieval.getExerciseHistory,
  focus_history: AIRetrieval.getFocusHistory,
  todo_status: AIRetrieval.getTodoStatus,
  goal_progress: AIRetrieval.getGoalProgress,
  growth_state: AIRetrieval.getGrowthState,
  growth_profile: AIRetrieval.getGrowthProfile
};

var ARGUMENT_SCHEMAS = {
  today_summary: ['today'],
  recent_trends: ['today'],
  learning_history: ['today', 'days'],
  course_progress: ['today'],
  english_history: ['today', 'days'],
  reading_history: ['today', 'days'],
  exercise_history: ['today', 'days'],
  focus_history: ['today', 'days'],
  todo_status: ['today', 'days'],
  goal_progress: ['today'],
  growth_state: ['today'],
  growth_profile: ['today']
};

function byteLength(value) {
  try { return JSON.stringify(value).length; } catch (_) { return Infinity; }
}

function normalizeArguments(value) {
  if (value == null) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  var out = {};
  for (var key in value) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    out[key] = value[key];
  }
  return out;
}

function validateCall(call, today) {
  if (!call || typeof call !== 'object' || Array.isArray(call)) return { ok: false, code: 'INVALID_TOOL_CALL' };
  var tool = String(call.tool || '');
  if (!Object.prototype.hasOwnProperty.call(TOOL_HANDLERS, tool)) return { ok: false, code: 'INVALID_TOOL' };
  var args = normalizeArguments(call.arguments);
  if (!args) return { ok: false, code: 'INVALID_ARGUMENTS' };
  var allowed = ARGUMENT_SCHEMAS[tool];
  for (var key in args) {
    if (!Object.prototype.hasOwnProperty.call(args, key)) continue;
    if (allowed.indexOf(key) < 0) return { ok: false, code: 'INVALID_ARGUMENT' };
  }
  if ('today' in args) {
    if (!isValidDateStr(String(args.today)) || String(args.today) > today) return { ok: false, code: 'INVALID_DATE' };
  }
  if ('days' in args) {
    var days = Number(args.days);
    if (!Number.isInteger(days) || days < 7 || days > 30) return { ok: false, code: 'INVALID_RANGE' };
  }
  return { ok: true, tool: tool, args: args };
}

function executeTool(call, data, opts) {
  opts = opts || {};
  var today = opts.today || todayStr();
  var validated = validateCall(call, today);
  if (!validated.ok) return { ok: false, code: validated.code, tool: call ? String(call.tool || '') : '' };
  var result;
  try {
    result = TOOL_HANDLERS[validated.tool](data, Object.assign({}, opts, validated.args));
  } catch (_) {
    return { ok: false, code: 'TOOL_EXECUTION_FAILED', tool: validated.tool };
  }
  var size = byteLength(result);
  if (!Number.isFinite(size) || size > MAX_RESULT_CHARS) {
    return { ok: false, code: 'TOOL_RESULT_TOO_LARGE', tool: validated.tool };
  }
  return { ok: true, tool: validated.tool, result: result, bytes: size };
}

function runToolPlan(calls, data, opts) {
  opts = opts || {};
  var list = Array.isArray(calls) ? calls : [];
  if (list.length > MAX_TOOL_CALLS) return { ok: false, code: 'TOOL_LIMIT_EXCEEDED', calls: [], results: {}, totalBytes: 0 };
  var executed = [];
  var results = {};
  var totalBytes = 0;
  for (var index = 0; index < list.length; index++) {
    if (executed.length >= MAX_TOOL_CALLS) return { ok: false, code: 'TOOL_LIMIT_EXCEEDED', calls: executed, results: results, totalBytes: totalBytes };
    var response = executeTool(list[index], data, opts);
    executed.push({ tool: response.tool || String((list[index] && list[index].tool) || ''), ok: response.ok, code: response.code || null, bytes: response.bytes || 0 });
    if (!response.ok) return { ok: false, code: response.code, calls: executed, results: results, totalBytes: totalBytes };
    if (totalBytes + response.bytes > MAX_TOTAL_CHARS) return { ok: false, code: 'TOOL_CONTEXT_TOO_LARGE', calls: executed, results: results, totalBytes: totalBytes };
    results[response.tool] = response.result;
    totalBytes += response.bytes;
  }
  return { ok: true, calls: executed, results: results, totalBytes: totalBytes };
}

var AIToolRunner = {
  VERSION: VERSION,
  TOOLS: Object.keys(TOOL_HANDLERS),
  MAX_TOOL_CALLS: MAX_TOOL_CALLS,
  MAX_RESULT_CHARS: MAX_RESULT_CHARS,
  MAX_TOTAL_CHARS: MAX_TOTAL_CHARS,
  executeTool: executeTool,
  runToolPlan: runToolPlan
};

globalThis.CGAIToolRunner = AIToolRunner;
export default AIToolRunner;
export { executeTool, runToolPlan };
