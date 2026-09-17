'use strict';

require('./setup');

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const authService = require('../src/services/authService');
const syncService = require('../src/services/syncService');
const {
  buildAuthoritativeReflectionContext,
} = require('../src/services/reflectionContextSource');

function today() {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
}

function yesterday() {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

describe('authoritative reflection context source', () => {
  test('derives bounded reflection facts from user_data', async () => {
    const account = await authService.register({
      email: 'reflection-context-authority@example.com',
      password: 'Abc123456',
    });
    const todayValue = today();
    const yesterdayValue = yesterday();
    await syncService.saveData(account.user.id, {
      data: {
        todos: [
          { id: 'todo-1', date: todayValue, done: true },
          { id: 'todo-2', date: todayValue, done: true },
          { id: 'todo-3', date: todayValue, done: false },
          { id: 'todo-old', date: yesterdayValue, done: false },
        ],
        focus: [{ id: 'focus-1', date: todayValue, minutes: 30 }],
        english: [{ id: 'english-1', date: todayValue, minutes: 15 }],
        sports: [{ id: 'sport-1', date: todayValue, duration: 20 }],
        checkins: [{ id: 'checkin-1', date: todayValue, status: 'done' }],
        goals: [
          { id: 'goal-active', status: 'active', endDate: todayValue },
          { id: 'goal-archived', status: 'archived' },
        ],
      },
      baseRevision: 1,
      deviceId: 'test-device',
    });

    const context = await buildAuthoritativeReflectionContext({ userId: account.user.id });
    assert.equal(context.today, todayValue);
    assert.deepEqual(context.taskSummary, {
      total: 3,
      completed: 2,
      pending: 1,
      completionRate: 66.7,
      yesterdayPending: 1,
    });
    assert.deepEqual(context.focusSummary, {
      minutes: 30,
      studyMinutes: 45,
      exerciseMinutes: 20,
      activeToday: true,
    });
    assert.equal(context.streaks.current, 1);
    assert.equal(context.streaks.todayDone, true);
    assert.equal(context.goals.activeCount, 1);
  });
});
