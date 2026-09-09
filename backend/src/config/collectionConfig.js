/**
 * 晨光自律台 · 集合配置（统一配置）
 * ------------------------------------------------------------
 * 消除 collectionService.js 和 syncService.js 中的重复定义
 * 所有集合配置从这里导入
 */

/**
 * 默认空数据结构（与前端 store.js 完全一致）
 * 新用户首次拉取时返回此结构
 */
function emptyPayload() {
  return {
    user: { name: '', startDate: '', totalDays: 0, continuousDays: 0 },
    checkins: [],
    sports: [],
    readings: [],
    courses: [],
    english: [],
    todos: [],
    focus: [],
  };
}

// 允许的字段白名单（防止脏写注入未知字段）
const PAYLOAD_KEYS = [
  'user', 'checkins', 'sports', 'readings', 'courses', 'english', 'todos', 'focus',
];

/**
 * 集合配置：表名 + 字段白名单 + mapIn（前端驼峰 → 后端下划线）
 */
const COLLECTIONS = {
  courses: {
    table: 'courses',
    fields: ['id', 'name', 'total_chapters', 'learned_chapters', 'progress', 'status'],
    mapIn: (c) => ({
      id: c.id,
      name: c.name || '新课',
      total_chapters: Number(c.totalChapters || c.total || 0),
      learned_chapters: Number(c.learnedChapters != null ? c.learnedChapters : c.learned || 0),
      progress: Number(c.progress || 0),
      status: c.status || 'todo',
    }),
  },
  sports: {
    table: 'sports',
    fields: ['id', 'date', 'name', 'calories', 'duration', 'type'],
    mapIn: (s) => ({
      id: s.id,
      date: s.date,
      name: s.name || '运动',
      calories: Number(s.calories != null ? s.calories : s.cal || 0),
      duration: Number(s.duration != null ? s.duration : s.min || 0),
      type: s.type || 'general',
    }),
  },
  readings: {
    table: 'readings',
    fields: ['id', 'date', 'book_name', 'pages', 'total_pages'],
    mapIn: (r) => ({
      id: r.id,
      date: r.date,
      book_name: r.bookName || r.name || '书籍',
      pages: Number(r.pages || 0),
      total_pages: Number(r.totalPages != null ? r.totalPages : r.total || 0),
    }),
  },
  english: {
    table: 'english',
    fields: ['id', 'date', 'words', 'minutes'],
    mapIn: (e) => ({
      id: e.id,
      date: e.date,
      words: Number(e.words || 0),
      minutes: Number(e.minutes || 0),
    }),
  },
  checkins: {
    table: 'checkins',
    fields: ['id', 'date', 'status'],
    mapIn: (k) => ({
      id: k.id,
      date: k.date,
      status: k.status || 'done',
    }),
  },
  todos: {
    table: 'todos',
    fields: ['id', 'text', 'date', 'done', 'priority'],
    mapIn: (t) => ({
      id: t.id,
      text: t.text || t.t || '',
      date: t.date,
      done: t.done ? 1 : 0,
      priority: t.priority || 'normal',
    }),
  },
  focus: {
    table: 'focus',
    fields: ['id', 'date', 'minutes', 'task'],
    mapIn: (f) => ({
      id: f.id,
      date: f.date,
      minutes: Number(f.minutes || 0),
      task: f.task || '',
    }),
  },
};

const VALID_NAMES = Object.keys(COLLECTIONS);

module.exports = {
  emptyPayload,
  PAYLOAD_KEYS,
  COLLECTIONS,
  VALID_NAMES,
};
