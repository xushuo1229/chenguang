import { request } from './apiClient'

export type KbDocument = {
  id: string
  courseId: string
  title: string
  content?: string
  sourceUrl?: string
  version?: number
  createdAt?: string
}

export type KbNode = {
  id: string
  courseId: string
  title: string
  kind: string
  definition?: string
  status: string
  confidence: string
  version?: number
}

export type KbRelation = {
  id: string
  sourceNodeId: string
  targetNodeId: string
  relationType: string
}

export type KbEvidence = {
  id: string
  documentId: string
  nodeId: string
  quote: string
  locator?: string
}

export type CourseSpace = {
  courses?: Array<{ id: string; name: string }>
  documents: KbDocument[]
  nodes: KbNode[]
  relations: KbRelation[]
  evidence: KbEvidence[]
}

export async function getCourseSpace(
  courseId: string,
): Promise<CourseSpace> {
  const query = new URLSearchParams({ courseId })
  return request<CourseSpace>(`/course-space?${query.toString()}`)
}

export async function searchCourseSpace(
  queryText: string,
  courseId: string,
): Promise<CourseSpace> {
  const query = new URLSearchParams({
    q: queryText,
    courseId,
  })
  return request<CourseSpace>(`/course-space/search?${query.toString()}`)
}
