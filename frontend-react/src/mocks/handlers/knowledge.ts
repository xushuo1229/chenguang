import { delay as mswDelay, http, HttpResponse } from 'msw'
import {
  mockKbDocuments,
  mockKbEvidence,
  mockKbNodes,
  mockKbRelations,
  mockKnowledgeStates,
  mockParsedCourses,
  mockReviewItems,
  mockExtractionCandidates,
} from '@/mocks/data'
import type {
  KbDocument,
  KbNode,
  KbRelation,
} from '@/services/courseSpaceService'
import { API_PREFIX } from '../paths'
import { scenarioErrorResponse, settleScenario } from './shared'

const emptySpace = { documents: [], nodes: [], relations: [], evidence: [] }
const candidateDecisions = new Map<string, 'accepted' | 'rejected'>()
const createdDocuments: KbDocument[] = []
const createdNodes: KbNode[] = []
const createdRelations: KbRelation[] = []
let documentSequence = 0
let nodeSequence = 0
let relationSequence = 0

export const knowledgeHandlers = [
  http.post(`${API_PREFIX}/course/import`, async ({ request }) => {
    await new Promise((resolve) => setTimeout(resolve, 400))
    const body = (await request.json().catch(() => null)) as
      | { url?: string }
      | null
    if (!String(body?.url ?? '').trim()) {
      return HttpResponse.json(
        { error: { code: 'INVALID_INPUT', message: '请输入课表链接' } },
        { status: 400 },
      )
    }
    return HttpResponse.json({
      data: { courses: structuredClone(mockParsedCourses), source: body?.url },
    })
  }),
  http.get(`${API_PREFIX}/course-space`, async ({ cookies }) => {
    const scenario = await settleScenario(cookies, 240)
    if (scenario === 'error') return scenarioErrorResponse()
    if (scenario === 'empty') {
      return HttpResponse.json({ data: emptySpace })
    }
    return HttpResponse.json({
      data: {
        documents: structuredClone([
          ...mockKbDocuments,
          ...createdDocuments,
        ]),
        nodes: structuredClone([...mockKbNodes, ...createdNodes]),
        relations: structuredClone([
          ...mockKbRelations,
          ...createdRelations,
        ]),
        evidence: structuredClone(mockKbEvidence),
      },
    })
  }),
  http.get(`${API_PREFIX}/knowledge-state/course/:courseId`, async ({ cookies }) => {
    const scenario = await settleScenario(cookies, 220)
    if (scenario === 'error') return scenarioErrorResponse()
    if (scenario === 'empty') {
      return HttpResponse.json({
        data: { courseId: '', states: [], limit: 50, offset: 0 },
      })
    }
    return HttpResponse.json({
      data: {
        courseId: 'course-zeno-1',
        states: structuredClone(mockKnowledgeStates),
        limit: 50,
        offset: 0,
      },
    })
  }),
  http.get(`${API_PREFIX}/learning/review-queue/:courseId`, async ({ cookies }) => {
    const scenario = await settleScenario(cookies, 200)
    if (scenario === 'error') return scenarioErrorResponse()
    if (scenario === 'empty') {
      return HttpResponse.json({
        data: {
          courseId: '',
          items: [],
          limit: 50,
          metadata: { queueVersion: 'review-queue-v1', readOnly: true },
        },
      })
    }
    return HttpResponse.json({
      data: {
        courseId: 'course-zeno-1',
        items: structuredClone(mockReviewItems),
        limit: 50,
        metadata: { queueVersion: 'review-queue-v1', readOnly: true },
      },
    })
  }),
  http.post(`${API_PREFIX}/course-space/documents`, async ({ request }) => {
    await mswDelay(260)
    const body = (await request.json().catch(() => null)) as
      | {
          courseId?: string
          title?: string
          content?: string
          sourceUrl?: string
        }
      | null
    const title = String(body?.title ?? '').trim()
    const content = String(body?.content ?? '').trim()
    if (!title || !content) {
      return HttpResponse.json(
        { error: { code: 'INVALID_INPUT', message: '标题和内容不能为空' } },
        { status: 400 },
      )
    }
    const document: KbDocument = {
      id: `doc-user-${++documentSequence}`,
      courseId: String(body?.courseId ?? 'course-zeno-1'),
      title,
      content,
      sourceUrl: String(body?.sourceUrl ?? '').trim() || undefined,
      version: 1,
      createdAt: new Date().toISOString(),
    }
    createdDocuments.push(document)
    return HttpResponse.json(
      { data: structuredClone(document) },
      { status: 201 },
    )
  }),
  http.post(`${API_PREFIX}/course-space/extraction/jobs`, async () => {
    await mswDelay(600)
    return HttpResponse.json(
      {
        data: {
          id: `job-${Date.now()}`,
          courseId: 'course-zeno-1',
          documentId: 'doc-2',
          status: 'completed',
          provider: 'mock',
        },
      },
      { status: 201 },
    )
  }),
  http.get(
    `${API_PREFIX}/course-space/extraction/jobs/:id`,
    async ({ params }) => {
      await mswDelay(120)
      return HttpResponse.json({
        data: {
          id: String(params.id),
          courseId: 'course-zeno-1',
          documentId: 'doc-2',
          status: 'completed',
          provider: 'mock',
        },
      })
    },
  ),
  http.post(`${API_PREFIX}/course-space/nodes`, async ({ request }) => {
    await mswDelay(240)
    const body = (await request.json().catch(() => null)) as
      | {
          courseId?: string
          title?: string
          kind?: string
          definition?: string
        }
      | null
    const title = String(body?.title ?? '').trim()
    if (!title) {
      return HttpResponse.json(
        { error: { code: 'INVALID_INPUT', message: '节点标题不能为空' } },
        { status: 400 },
      )
    }
    const node: KbNode = {
      id: `node-user-${++nodeSequence}`,
      courseId: String(body?.courseId ?? 'course-zeno-1'),
      title,
      kind: String(body?.kind ?? 'concept'),
      definition: String(body?.definition ?? '').trim() || undefined,
      status: 'draft',
      confidence: 'low',
      version: 1,
    }
    createdNodes.push(node)
    return HttpResponse.json({ data: structuredClone(node) }, { status: 201 })
  }),
  http.post(`${API_PREFIX}/course-space/relations`, async ({ request }) => {
    await mswDelay(240)
    const body = (await request.json().catch(() => null)) as
      | {
          sourceNodeId?: string
          targetNodeId?: string
          relationType?: string
        }
      | null
    const sourceNodeId = String(body?.sourceNodeId ?? '')
    const targetNodeId = String(body?.targetNodeId ?? '')
    const allNodeIds = new Set(
      [...mockKbNodes, ...createdNodes].map((node) => node.id),
    )
    if (
      !sourceNodeId ||
      !targetNodeId ||
      sourceNodeId === targetNodeId ||
      !allNodeIds.has(sourceNodeId) ||
      !allNodeIds.has(targetNodeId)
    ) {
      return HttpResponse.json(
        { error: { code: 'INVALID_INPUT', message: '关系的两个节点必须存在且不同' } },
        { status: 400 },
      )
    }
    const relation: KbRelation = {
      id: `rel-user-${++relationSequence}`,
      sourceNodeId,
      targetNodeId,
      relationType: String(body?.relationType ?? 'related_to'),
    }
    createdRelations.push(relation)
    return HttpResponse.json(
      { data: structuredClone(relation) },
      { status: 201 },
    )
  }),
  http.get(`${API_PREFIX}/course-space/extraction/candidates`, async ({ request }) => {
    await mswDelay(220)
    const url = new URL(request.url)
    const statusFilter = url.searchParams.get('status')
    const candidates = structuredClone(mockExtractionCandidates).map(
      (candidate) => ({
        ...candidate,
        status: candidateDecisions.get(candidate.id) ?? candidate.status,
      }),
    )
    const filtered = statusFilter
      ? candidates.filter((candidate) => candidate.status === statusFilter)
      : candidates
    return HttpResponse.json({ data: { candidates: filtered } })
  }),
  http.post(
    `${API_PREFIX}/course-space/extraction/candidates/:id/accept`,
    async ({ params }) => {
      candidateDecisions.set(String(params.id), 'accepted')
      return HttpResponse.json({ data: { status: 'accepted' } })
    },
  ),
  http.post(
    `${API_PREFIX}/course-space/extraction/candidates/:id/reject`,
    async ({ params }) => {
      candidateDecisions.set(String(params.id), 'rejected')
      return HttpResponse.json({ data: { status: 'rejected' } })
    },
  ),
]
