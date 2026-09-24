import { mockDashboardOverview } from '@/mocks/data'
import { delay } from './mockSession'

export type DashboardTrendPoint = { date: string; value: number }
export type DashboardTask = { id: string; title: string; kind: string; minutes: number; completed: boolean }
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
}

export async function getDashboardOverview(): Promise<DashboardOverview> {
  await delay(320)
  return structuredClone(mockDashboardOverview)
}
