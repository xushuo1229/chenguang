import { request } from './apiClient'

export type Evidence = {
  id: string
  title: string
  source: string
  authority?: string
  confidence?: number
}

export type AgentSuggestion = {
  id?: string
  text?: string
  title?: string
  reason?: string
}

export type AgentChatResponse = {
  answer: string
  mode: 'personal' | 'general'
  evidence: Evidence[]
  insights: Array<{ id?: string; title: string; confidence?: number }>
  confidence: number
  actions: AgentSuggestion[]
  metadata?: { fallback?: boolean }
}

export type AgentContext = {
  version?: string
  readOnly?: boolean
  context?: {
    courses?: { value?: Array<{ courseId?: string; name?: string }> }
    behavior?: { value?: BehaviorValue }
    courseKnowledge?: { value?: CourseKnowledgeValue }
    knowledgeStates?: { value?: KnowledgeStateValue }
    memories?: { growth?: { value?: MemoryValue } }
  }
  previousInsights?: Array<{ title?: string; confidence?: number }>
  review?: {
    stateCounts?: Record<string, number>
    nextBestRecommendation?: { nodeTitle?: string }
  }
  plan?: {
    blocks?: Array<{
      nodeTitle?: string
      minutes?: number
      reason?: string
      kind?: string
    }>
  }
  actions?: AgentSuggestion[]
  practice?: {
    attempts?: Array<{ createdAt?: string; knowledgeNodeId?: string }>
  }
  metadata?: { generatedAt?: string }
}

export type BehaviorValue = {
  today?: string
  taskSummary?: { total?: number; completed?: number }
  focusSummary?: { minutes?: number }
  streaks?: { currentStreak?: number }
  goals?: Array<{ title?: string; progress?: number; status?: string }>
  risks?: Array<{ title?: string; message?: string }>
  recent7?: {
    startDate?: string
    endDate?: string
    focusMinutes?: number
    studyActiveDays?: number
  }
}

export type CourseKnowledgeValue = {
  nodes?: Array<{ id?: string; title?: string; summary?: string }>
  evidence?: Array<{ id?: string; title?: string }>
}

export type KnowledgeStateValue = {
  strongTopics?: string[]
  weakTopics?: string[]
}

export type MemoryValue = {
  available?: boolean
  items?: Array<{
    id: string
    category: string
    content: string
    confidence?: number
    updatedAt?: string
  }>
}

export async function getAgentContext(): Promise<AgentContext> {
  return request<AgentContext>('/personal-agent/context')
}

export async function sendAgentMessage(
  message: string,
  mode: 'personal' | 'general',
  conversationId: string,
): Promise<AgentChatResponse> {
  return request<AgentChatResponse>('/personal-agent/chat', {
    method: 'POST',
    body: { message, mode, conversationId },
  })
}
