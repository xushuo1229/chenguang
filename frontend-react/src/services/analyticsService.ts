import { request } from './apiClient'
import type { AgentContext } from './agentService'

export type SyncSnapshot = {
  data: ChenguangData
  revision?: number
  updatedAt?: string
}

export type CgUser = Record<string, unknown> & {
  nickname?: string
  email?: string
  semesterStart?: string
  currentWeek?: number
  memory?: Record<string, unknown>
}

export type CourseSlot = {
  weekday?: number
  period?: number
  periods?: number[]
  weeks?: string
  startTime?: string
  endTime?: string
}

export type CourseRecord = {
  id?: string
  name?: string
  progress?: number
  status?: string
  slots?: CourseSlot[]
  schedule?: CourseSlot[]
  time?: string
  weeks?: string
  location?: string
  credits?: number
  courseType?: string
}

export type ChenguangData = {
  user?: CgUser
  courses?: CourseRecord[]
  todos?: Array<{
    id?: string
    text?: string
    date?: string
    done?: boolean
    completed?: boolean
    priority?: string
  }>
  focus?: Array<{ date?: string; minutes?: number; task?: string }>
  checkins?: Array<{ date?: string; status?: string }>
  sports?: Array<{
    date?: string
    duration?: number
    minutes?: number
    calories?: number
    type?: string
    name?: string
  }>
  readings?: Array<{
    date?: string
    pages?: number
    minutes?: number
    totalPages?: number
    bookName?: string
  }>
  english?: Array<{ date?: string; minutes?: number; words?: number }>
  goals?: Array<{ id?: string; title?: string; progress?: number }>
}

export type AgentHomeContext = AgentContext & {
  generatedAt?: string
}

export async function getSyncSnapshot(): Promise<SyncSnapshot> {
  return request<SyncSnapshot>('/data')
}

export async function getAgentHomeContext(): Promise<AgentHomeContext> {
  return request<AgentHomeContext>('/agent-home/context')
}

export async function getAgentHomeInsights(): Promise<{
  insights?: Array<{ title?: string; confidence?: number }>
}> {
  return request<{
    insights?: Array<{ title?: string; confidence?: number }>
  }>('/agent-home/insights')
}
