import { http, HttpResponse } from 'msw'
import {
  mockKbDocuments,
  mockKbEvidence,
  mockKbNodes,
  mockKbRelations,
  mockKnowledgeStates,
  mockParsedCourses,
  mockReviewItems,
} from '@/mocks/data'
import { API_PREFIX } from '../paths'
import { scenarioErrorResponse, settleScenario } from './shared'

const emptySpace = { documents: [], nodes: [], relations: [], evidence: [] }

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
        documents: structuredClone(mockKbDocuments),
        nodes: structuredClone(mockKbNodes),
        relations: structuredClone(mockKbRelations),
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
]
