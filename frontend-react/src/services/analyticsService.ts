import { request } from './apiClient'
import type { AgentContext } from './agentService'

export type SyncSnapshot = {
  data: ChenguangData
  revision?: number
  updatedAt?: string
}

export type ChenguangData = {
  user?: Record<string, unknown> & { memory?: Record<string, unknown> }
  courses?: Array<{ id?: string; name?: string }>
  todos?: Array<{ date?: string; completed?: boolean }>
  focus?: Array<{ date?: string; minutes?: number }>
  checkins?: Array<{ date?: string }>
  sports?: Array<{ date?: string; minutes?: number }>
  readings?: Array<{ date?: string; minutes?: number }>
  english?: Array<{ date?: string; minutes?: number }>
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
