import { request } from './apiClient'
import { getSyncSnapshot } from './analyticsService'
import { getAgentContext } from './agentService'
import {
  buildKnowledgeCoverage,
  buildStudyTimeSeries,
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
  delta?: string
  trend?: 'up' | 'down'
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

export type DashboardOverviewBase = Omit<
  DashboardOverview,
  'chart' | 'knowledge'
>

export async function getDashboardOverview(): Promise<DashboardOverview> {
  const [base, snapshot, context] = await Promise.all([
    request<DashboardOverviewBase>('/agent-home/dashboard'),
    getSyncSnapshot(),
    getAgentContext(),
  ])
  return {
    ...base,
    chart: buildStudyTimeSeries(snapshot),
    knowledge: buildKnowledgeCoverage(context),
  }
}
