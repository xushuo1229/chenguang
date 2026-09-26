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

export type DocumentInput = {
  courseId: string
  title: string
  content?: string
  sourceUrl?: string
}

export async function createDocument(
  input: DocumentInput,
): Promise<KbDocument> {
  return request<KbDocument>('/course-space/documents', {
    method: 'POST',
    body: input,
  })
}

export type ExtractionJob = {
  id: string
  courseId: string
  documentId: string
  status: string
  provider: string
  startedAt?: string
  completedAt?: string
  error?: string
}

const terminalJobStatuses = new Set(['completed', 'failed', 'cancelled'])

export async function getExtractionJob(jobId: string): Promise<ExtractionJob> {
  return request<ExtractionJob>(
    `/course-space/extraction/jobs/${jobId}`,
  )
}

export async function waitForExtractionJob(
  jobId: string,
  options: {
    intervalMs?: number
    timeoutMs?: number
    signal?: AbortSignal
  } = {},
): Promise<ExtractionJob> {
  const intervalMs = options.intervalMs ?? 1200
  const deadline = Date.now() + (options.timeoutMs ?? 30_000)
  let latest: ExtractionJob | undefined
  while (Date.now() < deadline) {
    if (options.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError')
    }
    latest = await getExtractionJob(jobId)
    if (terminalJobStatuses.has(latest.status)) return latest
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
  throw new Error('抽取耗时较长，请稍后到审核页查看结果。')
}

export async function createExtractionJob(input: {
  courseId: string
  documentId: string
  reextract?: boolean
}): Promise<ExtractionJob> {
  return request<ExtractionJob>('/course-space/extraction/jobs', {
    method: 'POST',
    body: input,
  })
}

export async function createNode(input: {
  courseId: string
  title: string
  kind: string
  definition?: string
}): Promise<KbNode> {
  return request<KbNode>('/course-space/nodes', {
    method: 'POST',
    body: input,
  })
}

export async function createRelation(input: {
  sourceNodeId: string
  targetNodeId: string
  relationType: string
}): Promise<KbRelation> {
  return request<KbRelation>('/course-space/relations', {
    method: 'POST',
    body: input,
  })
}

export type ExtractionCandidate = {
  id: string
  courseId: string
  documentId: string
  type: string
  title: string
  content: string
  confidence: number
  status: 'pending' | 'accepted' | 'rejected'
  originalTitle: string
  originalContent: string
}

export async function listCandidates(input: {
  courseId: string
  status?: 'pending' | 'accepted' | 'rejected'
}): Promise<{ candidates: ExtractionCandidate[] }> {
  const query = new URLSearchParams({ courseId: input.courseId })
  if (input.status) query.set('status', input.status)
  return request<{ candidates: ExtractionCandidate[] }>(
    `/course-space/extraction/candidates?${query.toString()}`,
  )
}

export async function reviewCandidate(
  candidateId: string,
  action: 'accept' | 'reject',
): Promise<ExtractionCandidate> {
  return request<ExtractionCandidate>(
    `/course-space/extraction/candidates/${candidateId}/${action}`,
    { method: 'POST', body: { action } },
  )
}
