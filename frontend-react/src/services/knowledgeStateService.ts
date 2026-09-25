import { request } from './apiClient'

export type KnowledgeMasteryState = 'mastered' | 'learning' | 'weak'

export type KnowledgeState = {
  id: string
  courseId: string
  knowledgeNodeId: string
  nodeTitle: string
  nodeKind: string
  masteryLevel: number
  confidence: number
  state: KnowledgeMasteryState
  evidenceCount: number
  assessmentEvidenceCount: number
}

export type ReviewItem = {
  courseId: string
  knowledgeNodeId: string
  nodeTitle: string
  masteryLevel: number
  confidence: number
  state: KnowledgeMasteryState
  evidenceCount: number
  priority: number
  reason: string
}

export type CourseStates = {
  courseId: string
  states: KnowledgeState[]
  limit: number
  offset: number
}

export type ReviewQueue = {
  courseId: string
  items: ReviewItem[]
  limit: number
  metadata: { queueVersion: string; readOnly: boolean }
}

export async function listCourseStates(
  courseId: string,
): Promise<CourseStates> {
  return request<CourseStates>(`/knowledge-state/course/${courseId}`)
}

export async function getReviewQueue(
  courseId: string,
): Promise<ReviewQueue> {
  return request<ReviewQueue>(`/learning/review-queue/${courseId}`)
}
