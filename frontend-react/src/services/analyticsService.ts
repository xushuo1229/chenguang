import { mockAgentContext, mockSyncSnapshot } from '@/mocks/data'
import { delay } from './mockSession'
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

export type AgentOverview = {
  courseId?: string
  perception?: {
    stateCounts?: Record<string, number>
    riskCounts?: Record<string, number>
    actionStatusCounts?: Record<string, number>
    nextBestRecommendation?: { nodeTitle?: string; riskReason?: string; state?: string }
  }
  plan?: {
    blocks?: Array<{ blockId?: string; nodeTitle?: string; minutes?: number; reason?: string; kind?: string }>
  }
  actions?: { proposals?: Array<{ id?: string; title?: string; status?: string; reason?: string }> }
}

export async function getSyncSnapshot(): Promise<SyncSnapshot> {
  await delay(260)
  return structuredClone(mockSyncSnapshot)
}

export async function getAgentHomeContext(): Promise<AgentHomeContext> {
  await delay(260)
  return { ...structuredClone(mockAgentContext), generatedAt: new Date().toISOString() }
}

export async function getAgentHomeInsights(): Promise<{ insights?: Array<{ title?: string; confidence?: number }> }> {
  await delay(200)
  return { insights: mockAgentContext.previousInsights }
}

export async function getAgentOverview(courseId: string, availableMinutes = 60): Promise<AgentOverview> {
  void availableMinutes
  await delay(240)
  const context = structuredClone(mockAgentContext)
  return {
    courseId,
    perception: {
      stateCounts: context.review?.stateCounts,
      nextBestRecommendation: context.review?.nextBestRecommendation
        ? { nodeTitle: context.review.nextBestRecommendation.nodeTitle }
        : undefined,
    },
    plan: {
      blocks: context.plan?.blocks?.map((block) => ({
        blockId: `block-${block.kind}`,
        nodeTitle: block.nodeTitle,
        minutes: block.minutes,
        reason: block.reason,
        kind: block.kind,
      })),
    },
    actions: { proposals: [] },
  }
}
