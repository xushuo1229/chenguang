import type { AgentContext } from './agentService'
import type { SnapshotEnvelope } from './snapshotService'
import {
  buildFocusTrend,
  buildGrowthIndex,
  buildKnowledgeCoverage,
  buildStudyTimeSeries,
  buildTaskCompletion,
} from '@/features/dashboard/dashboardMetrics'

export type DashboardTrendPoint = { date: string; value: number }
export type DashboardTask = {
  id: string
  title: string
  kind: string
  minutes: number
  completed: boolean
}
export type DashboardMetricTone = 'primary' | 'secondary' | 'success' | 'warning'
export type DashboardMetric = {
  id: string
  label: string
  value: string | number
  hint: string
  tone: DashboardMetricTone
}
export type DashboardOverview = {
  growthIndex: number
  summary: string
  tasksDone: string
  focusToday: number
  streak: number
  metrics: DashboardMetric[]
  trend: DashboardTrendPoint[]
  tasks: DashboardTask[]
  insights: Array<{ title: string; confidence?: number }>
  chart: import('@/features/dashboard/dashboardMetrics').StudySeriesPoint[]
  knowledge: { strong: number; weak: number; coverage: number }
}

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function todayFocusMinutes(snapshot: SnapshotEnvelope | undefined): number {
  const today = dateKey(new Date())
  return (snapshot?.data.focus ?? [])
    .filter((record) => record.date === today)
    .reduce((sum, record) => sum + (Number(record.minutes) || 0), 0)
}

function checkinStreak(snapshot: SnapshotEnvelope | undefined): number {
  const dates = new Set(
    (snapshot?.data.checkins ?? [])
      .filter((record) => !record.status || record.status === 'done')
      .map((record) => record.date),
  )
  let streak = 0
  const cursor = new Date()
  while (dates.has(dateKey(cursor))) {
    streak += 1
    cursor.setDate(cursor.getDate() - 1)
  }
  return streak
}

export function buildDashboardOverview(
  snapshot: SnapshotEnvelope | undefined,
  context: AgentContext | undefined,
): DashboardOverview {
  const task = buildTaskCompletion(snapshot)
  const behavior = context?.context?.behavior?.value
  const focusToday =
    behavior?.focusSummary?.minutes ?? todayFocusMinutes(snapshot)
  const streak = behavior?.streaks?.currentStreak ?? checkinStreak(snapshot)
  const growthIndex = buildGrowthIndex({ snapshot, context })
  const knowledge = buildKnowledgeCoverage(context)
  const today = dateKey(new Date())
  const todos = (snapshot?.data.todos ?? []).filter(
    (todo) => todo.date === today,
  )

  const tasks: DashboardTask[] = todos.map((todo, index) => ({
    id: todo.id ?? `todo-${index}`,
    title: todo.text || '未命名任务',
    kind: todo.priority || 'normal',
    minutes: 0,
    completed: todo.done ?? todo.completed ?? false,
  }))

  const metrics: DashboardMetric[] = [
    { id: 'tasks', label: '今日任务', value: `${task.completed}/${task.total}`, hint: '已完成 / 总计划', tone: 'primary' },
    { id: 'focus', label: '今日专注', value: focusToday, hint: '有效专注分钟', tone: 'secondary' },
    { id: 'streak', label: '连续学习', value: streak, hint: '当前连续天数', tone: 'warning' },
    { id: 'knowledge', label: '知识掌握', value: `${knowledge.strong}/${knowledge.total}`, hint: '掌握 / 已评估节点', tone: 'success' },
  ]

  const insights = (context?.previousInsights ?? [])
    .slice(0, 3)
    .map((insight) => ({
      title: insight.title ?? '',
      confidence: insight.confidence,
    }))

  return {
    growthIndex,
    summary:
      task.total === 0
        ? '今天还没有计划，添加一个任务开始记录。'
        : `今日任务完成 ${task.completed}/${task.total}，专注 ${focusToday} 分钟。`,
    tasksDone: `${task.completed}/${task.total}`,
    focusToday,
    streak,
    metrics,
    trend: buildFocusTrend(snapshot),
    tasks,
    insights,
    chart: buildStudyTimeSeries(snapshot),
    knowledge,
  }
}
