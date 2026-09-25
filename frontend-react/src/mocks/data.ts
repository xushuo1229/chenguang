import type { AuthUser } from '@/services/authService'
import type { AgentContext, AgentChatResponse } from '@/services/agentService'
import type { SyncSnapshot } from '@/services/analyticsService'

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

export const mockSyncSnapshot: SyncSnapshot = {
  revision: 3901,
  updatedAt: new Date().toISOString(),
  data: {
    user: { nickname: 'Zeno Explorer' },
    courses: [{ id: 'course-zeno-1', name: 'Zeno AI 基础与实践' }],
    todos: [
      { id: 'todo-1', text: '完成 React 架构目录整理', date: dateKey(new Date()), done: true, priority: 'architecture' },
      { id: 'todo-2', text: '实现 LoginPage', date: dateKey(new Date()), done: true, priority: 'ui' },
      { id: 'todo-3', text: '实现 DashboardPage', date: dateKey(new Date()), done: true, priority: 'ui' },
      { id: 'todo-4', text: '实现 AgentPage mock', date: dateKey(new Date()), done: true, priority: 'ui' },
      { id: 'todo-5', text: '整理迁移文档与风险清单', date: dateKey(new Date()), done: false, priority: 'docs' },
      { id: 'todo-6', text: '英语听力练习', date: dateKey(new Date()), done: false, priority: 'english' },
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

import type {
  KbDocument,
  KbEvidence,
  KbNode,
  KbRelation,
} from '@/services/courseSpaceService'
import type {
  KnowledgeState,
  ReviewItem,
} from '@/services/knowledgeStateService'
import type { ParsedCourse } from '@/services/courseService'

export const mockKbDocuments: KbDocument[] = [
  { id: 'doc-1', courseId: 'course-zeno-1', title: 'Zeno 架构讲义 · 第 1 章', content: '组件模型与工程化基础。', version: 1, createdAt: dateKey(daysAgo(3)) },
  { id: 'doc-2', courseId: 'course-zeno-1', title: 'Zeno 架构讲义 · 第 2 章', content: 'Hooks、状态与数据流。', version: 1, createdAt: dateKey(daysAgo(1)) },
]

export const mockKbNodes: KbNode[] = [
  { id: 'node-g-1', courseId: 'course-zeno-1', title: 'ES Modules', kind: 'concept', definition: '语言级模块系统，支持静态分析与 tree-shaking。', status: 'validated', confidence: 'high' },
  { id: 'node-g-2', courseId: 'course-zeno-1', title: 'Vite 构建配置', kind: 'procedure', definition: '基于原生 ESM 的 dev server 与 Rollup 生产构建。', status: 'validated', confidence: 'high' },
  { id: 'node-g-3', courseId: 'course-zeno-1', title: 'React 组件模型', kind: 'concept', definition: '以组件为单位的声明式 UI 组合模型。', status: 'validated', confidence: 'medium' },
  { id: 'node-g-4', courseId: 'course-zeno-1', title: 'Hooks 与状态', kind: 'concept', definition: '函数组件中复用状态逻辑的机制。', status: 'validated', confidence: 'medium' },
  { id: 'node-g-5', courseId: 'course-zeno-1', title: 'TypeScript 泛型推导', kind: 'skill', definition: '通过泛型参数表达类型间的推导关系。', status: 'validated', confidence: 'low' },
  { id: 'node-g-6', courseId: 'course-zeno-1', title: '异步并发控制', kind: 'principle', definition: '协调多个异步任务的调度、取消与竞争。', status: 'validated', confidence: 'low' },
  { id: 'node-g-7', courseId: 'course-zeno-1', title: 'Git 分支策略', kind: 'procedure', definition: '隔离特性开发与稳定主干的协作约定。', status: 'validated', confidence: 'high' },
]

export const mockKbRelations: KbRelation[] = [
  { id: 'rel-1', sourceNodeId: 'node-g-1', targetNodeId: 'node-g-2', relationType: 'prerequisite' },
  { id: 'rel-2', sourceNodeId: 'node-g-2', targetNodeId: 'node-g-3', relationType: 'related_to' },
  { id: 'rel-3', sourceNodeId: 'node-g-3', targetNodeId: 'node-g-4', relationType: 'prerequisite' },
  { id: 'rel-4', sourceNodeId: 'node-g-4', targetNodeId: 'node-g-5', relationType: 'related_to' },
  { id: 'rel-5', sourceNodeId: 'node-g-4', targetNodeId: 'node-g-6', relationType: 'related_to' },
  { id: 'rel-6', sourceNodeId: 'node-g-1', targetNodeId: 'node-g-7', relationType: 'related_to' },
]

export const mockKbEvidence: KbEvidence[] = [
  { id: 'kb-ev-1', documentId: 'doc-1', nodeId: 'node-g-3', quote: '组件是 React 的一等公民，通过 props 组合。', locator: '第 1 章 · §2' },
  { id: 'kb-ev-2', documentId: 'doc-2', nodeId: 'node-g-4', quote: 'Hooks 让函数组件拥有状态与副作用能力。', locator: '第 2 章 · §1' },
  { id: 'kb-ev-3', documentId: 'doc-2', nodeId: 'node-g-5', quote: '泛型推导在复杂工具类型中尤其重要。', locator: '第 2 章 · §4' },
  { id: 'kb-ev-4', documentId: 'doc-1', nodeId: 'node-g-2', quote: 'Vite 依赖预构建基于 esbuild。', locator: '第 1 章 · §3' },
]

export const mockKnowledgeStates: KnowledgeState[] = [
  { id: 'ks-1', courseId: 'course-zeno-1', knowledgeNodeId: 'node-g-1', nodeTitle: 'ES Modules', nodeKind: 'concept', masteryLevel: 0.9, confidence: 0.88, state: 'mastered', evidenceCount: 3, assessmentEvidenceCount: 2 },
  { id: 'ks-2', courseId: 'course-zeno-1', knowledgeNodeId: 'node-g-2', nodeTitle: 'Vite 构建配置', nodeKind: 'procedure', masteryLevel: 0.82, confidence: 0.8, state: 'mastered', evidenceCount: 2, assessmentEvidenceCount: 1 },
  { id: 'ks-3', courseId: 'course-zeno-1', knowledgeNodeId: 'node-g-3', nodeTitle: 'React 组件模型', nodeKind: 'concept', masteryLevel: 0.62, confidence: 0.6, state: 'learning', evidenceCount: 2, assessmentEvidenceCount: 1 },
  { id: 'ks-4', courseId: 'course-zeno-1', knowledgeNodeId: 'node-g-4', nodeTitle: 'Hooks 与状态', nodeKind: 'concept', masteryLevel: 0.55, confidence: 0.52, state: 'learning', evidenceCount: 1, assessmentEvidenceCount: 0 },
  { id: 'ks-5', courseId: 'course-zeno-1', knowledgeNodeId: 'node-g-5', nodeTitle: 'TypeScript 泛型推导', nodeKind: 'skill', masteryLevel: 0.3, confidence: 0.4, state: 'weak', evidenceCount: 1, assessmentEvidenceCount: 0 },
  { id: 'ks-6', courseId: 'course-zeno-1', knowledgeNodeId: 'node-g-6', nodeTitle: '异步并发控制', nodeKind: 'principle', masteryLevel: 0.25, confidence: 0.35, state: 'weak', evidenceCount: 0, assessmentEvidenceCount: 0 },
]

export const mockReviewItems: ReviewItem[] = [
  { courseId: 'course-zeno-1', knowledgeNodeId: 'node-g-5', nodeTitle: 'TypeScript 泛型推导', masteryLevel: 0.3, confidence: 0.4, state: 'weak', evidenceCount: 1, priority: 1, reason: 'weak_state' },
  { courseId: 'course-zeno-1', knowledgeNodeId: 'node-g-6', nodeTitle: '异步并发控制', masteryLevel: 0.25, confidence: 0.35, state: 'weak', evidenceCount: 0, priority: 1, reason: 'weak_state' },
  { courseId: 'course-zeno-1', knowledgeNodeId: 'node-g-4', nodeTitle: 'Hooks 与状态', masteryLevel: 0.55, confidence: 0.52, state: 'learning', evidenceCount: 1, priority: 2, reason: 'consolidation_needed' },
]

export const mockParsedCourses: ParsedCourse[] = [
  {
    name: 'Zeno AI 基础与实践（导入预览）',
    slots: [
      { weekday: 1, period: 1 },
      { weekday: 3, period: 3 },
      { weekday: 5, period: 5 },
    ],
  },
]
