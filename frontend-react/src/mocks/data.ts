import type { AuthUser } from '@/services/authService'
import type { AgentContext, AgentChatResponse } from '@/services/agentService'
import type { SyncSnapshot } from '@/services/analyticsService'
import type { DashboardOverview } from '@/services/dashboardService'

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000)
}

export const mockUser: AuthUser = {
  id: 1,
  nickname: 'Zeno Explorer',
  email: 'explorer@zeno.ai',
}

const weakTopics = ['React Hooks 状态管理', 'TypeScript 泛型推导', '异步并发控制']
const strongTopics = ['Vite 构建配置', 'ES Modules', 'CSS 布局体系', 'Git 分支策略', 'JWT 基础概念']

const growthMemoryItems = [
  { id: 'mem-1', category: 'preference', content: '偏好早晨先处理最难的学习任务', confidence: 0.88, updatedAt: dateKey(daysAgo(2)) },
  { id: 'mem-2', category: 'pattern', content: '周三、周五下午专注度最高', confidence: 0.8, updatedAt: dateKey(daysAgo(4)) },
  { id: 'mem-3', category: 'goal', content: '本学期目标：独立完成一个 AI 应用', confidence: 0.92, updatedAt: dateKey(daysAgo(6)) },
]

export const mockAgentContext: AgentContext = {
  version: 'zeno-mock-1',
  readOnly: true,
  context: {
    courses: { value: [{ courseId: 'course-zeno-1', name: 'Zeno AI 基础与实践' }] },
    behavior: {
      value: {
        today: dateKey(new Date()),
        taskSummary: { total: 6, completed: 4 },
        focusSummary: { minutes: 95 },
        streaks: { currentStreak: 12 },
        goals: [{ title: '完成 Zeno 架构迁移', progress: 82, status: 'active' }],
        risks: [{ title: '专注波动', message: '近 3 天专注时长较上周下降 18%，注意调整节奏' }],
        recent7: { startDate: dateKey(daysAgo(6)), endDate: dateKey(new Date()), focusMinutes: 430, studyActiveDays: 6 },
      },
    },
    courseKnowledge: {
      value: {
        nodes: [
          { id: 'node-1', title: 'React 组件模型', summary: '组件、props 与组合' },
          { id: 'node-2', title: 'Hooks 与状态', summary: 'useState / useEffect 心智模型' },
        ],
        evidence: [{ id: 'ev-node-1', title: '课程章节测验' }],
      },
    },
    knowledgeStates: { value: { strongTopics, weakTopics } },
    memories: { growth: { value: { available: true, items: growthMemoryItems } } },
  },
  previousInsights: [
    { title: '连续学习 12 天，节奏稳定', confidence: 0.9 },
    { title: '上午专注质量明显高于下午', confidence: 0.78 },
    { title: '薄弱节点集中在 Hooks 与泛型', confidence: 0.84 },
    { title: '任务完成率连续 5 天保持在 70% 以上', confidence: 0.86 },
  ],
  review: {
    stateCounts: { strong: 5, familiar: 4, weak: 3 },
    nextBestRecommendation: { nodeTitle: '复习：React Hooks 状态管理' },
  },
  plan: {
    blocks: [
      { nodeTitle: '整理迁移文档与风险清单', minutes: 20, reason: '收尾今日架构任务', kind: 'docs' },
      { nodeTitle: '英语听力练习', minutes: 15, reason: '保持连续学习记录', kind: 'english' },
      { nodeTitle: '复习 Hooks 状态管理', minutes: 25, reason: '连续两次评估低于阈值', kind: 'review' },
    ],
  },
  actions: [{ id: 'act-1', title: '将「复习 Hooks」加入明日计划', reason: '该节点连续两次评估低于阈值' }],
  practice: { attempts: [{ createdAt: dateKey(daysAgo(1)), knowledgeNodeId: 'node-2' }] },
  metadata: { generatedAt: new Date().toISOString() },
}

const focusByDay = [45, 60, 30, 80, 55, 0, 70, 90, 40, 65, 50, 75, 85, 95]
const focusRecords = focusByDay.map((minutes, index) => ({ date: dateKey(daysAgo(13 - index)), minutes }))
const readingsRecords = [
  { date: dateKey(daysAgo(4)), minutes: 25 },
  { date: dateKey(daysAgo(9)), minutes: 20 },
]
const englishRecords = [
  { date: dateKey(daysAgo(2)), minutes: 15 },
  { date: dateKey(daysAgo(7)), minutes: 20 },
]

const trend = focusRecords.map((record) => {
  const reading = readingsRecords.find((item) => item.date === record.date)?.minutes || 0
  const english = englishRecords.find((item) => item.date === record.date)?.minutes || 0
  return { date: record.date.slice(5), value: record.minutes + reading + english }
})

export const mockSyncSnapshot: SyncSnapshot = {
  revision: 3901,
  updatedAt: new Date().toISOString(),
  data: {
    user: { nickname: 'Zeno Explorer' },
    courses: [{ id: 'course-zeno-1', name: 'Zeno AI 基础与实践' }],
    todos: [
      { date: dateKey(new Date()), completed: true },
      { date: dateKey(new Date()), completed: true },
      { date: dateKey(new Date()), completed: true },
      { date: dateKey(new Date()), completed: true },
      { date: dateKey(new Date()), completed: false },
      { date: dateKey(new Date()), completed: false },
    ],
    focus: focusRecords,
    checkins: Array.from({ length: 12 }, (_, index) => ({ date: dateKey(daysAgo(index)) })),
    sports: [{ date: dateKey(daysAgo(1)), minutes: 30 }],
    readings: readingsRecords,
    english: englishRecords,
    goals: [
      { id: 'goal-1', title: '完成 Zeno 架构迁移', progress: 82 },
      { id: 'goal-2', title: '本学期独立完成 AI 应用', progress: 45 },
    ],
  },
}

export const mockDashboardOverview: Omit<
  DashboardOverview,
  'chart' | 'knowledge'
> = {
  growthIndex: 82,
  summary: '任务完成率、近 7 天专注与有效学习日均保持在高位',
  tasksDone: '4/6',
  focusToday: 95,
  streak: 12,
  metrics: [
    { id: 'tasks', label: '今日任务', value: '4/6', hint: '已完成 / 总计划', tone: 'primary', delta: '+2', trend: 'up' },
    { id: 'focus', label: '今日专注', value: 95, hint: '有效专注分钟', tone: 'secondary', delta: '-8%', trend: 'down' },
    { id: 'streak', label: '连续学习', value: 12, hint: '当前连续天数', tone: 'warning', delta: '+3', trend: 'up' },
    { id: 'knowledge', label: '知识掌握', value: '5/8', hint: '掌握 / 已评估节点', tone: 'success', delta: '+1', trend: 'up' },
  ],
  trend,
  tasks: [
    { id: 'task-1', title: '完成 React 架构目录整理', kind: 'architecture', minutes: 30, completed: true },
    { id: 'task-2', title: '实现 LoginPage', kind: 'ui', minutes: 40, completed: true },
    { id: 'task-3', title: '实现 DashboardPage mock', kind: 'ui', minutes: 50, completed: true },
    { id: 'task-4', title: '实现 AgentPage mock', kind: 'ui', minutes: 45, completed: true },
    { id: 'task-5', title: '整理迁移文档与风险清单', kind: 'docs', minutes: 20, completed: false },
    { id: 'task-6', title: '英语听力练习', kind: 'english', minutes: 15, completed: false },
  ],
  insights: [
    { title: '连续学习 12 天，节奏稳定', confidence: 0.9 },
    { title: '上午专注质量明显高于下午', confidence: 0.78 },
    { title: '薄弱节点集中在 Hooks 与泛型', confidence: 0.84 },
  ],
}

const personalReply: AgentChatResponse = {
  answer: [
    '根据你近 7 天的同步数据（mock）：',
    '',
    '1. 已连续学习 12 天，本周 6 个有效学习日，节奏稳定。',
    '2. 今天 6 个任务已完成 4 个，剩余两项预计 35 分钟。',
    '3. 「React Hooks 状态管理」是当前最薄弱的知识点，建议优先复习。',
    '',
    '建议下一步：先用 20 分钟整理迁移文档，再完成 15 分钟英语听力。',
  ].join('\n'),
  mode: 'personal',
  evidence: [
    { id: 'ev-1', title: '近 7 天行为聚合：专注 430 分钟 · 6 个学习日', source: 'sync snapshot · behavior.recent7', confidence: 0.95 },
    { id: 'ev-2', title: '知识状态评估：薄弱节点 3 个', source: 'knowledge states projection', confidence: 0.84 },
  ],
  insights: [
    { id: 'ins-1', title: '上午专注质量高于下午', confidence: 0.78 },
    { id: 'ins-2', title: '任务完成率连续 5 天 ≥ 70%', confidence: 0.86 },
  ],
  confidence: 0.86,
  actions: [{ id: 'act-1', title: '将「复习 Hooks」加入明日计划', reason: '该节点连续两次评估低于阈值' }],
}

const generalReply: AgentChatResponse = {
  answer: [
    '这是 General AI 模式（mock）：我不会读取你的个人数据。',
    '',
    '通用建议：把问题拆成小步骤，先明确目标和约束，再逐项验证。',
  ].join('\n'),
  mode: 'general',
  evidence: [],
  insights: [],
  confidence: 0.7,
  actions: [],
}

export function buildAgentReply(message: string, mode: 'personal' | 'general'): AgentChatResponse {
  const question = message.trim()
  if (mode === 'general') {
    return { ...generalReply, answer: `${generalReply.answer}\n\n你刚才的问题：${question}` }
  }
  return { ...personalReply, answer: `${personalReply.answer}\n\n你刚才问的是：${question}` }
}
