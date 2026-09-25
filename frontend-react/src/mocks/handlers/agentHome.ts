import { http, HttpResponse } from 'msw'
import {
  mockAgentContext,
  mockDashboardOverview,
  mockEmptyDashboardOverview,
} from '@/mocks/data'
import { API_PREFIX } from '../paths'
import { scenarioErrorResponse, settleScenario } from './shared'

const emptyContext = { version: 'zeno-mock-1', readOnly: true }

export const agentHomeHandlers = [
  http.get(`${API_PREFIX}/agent-home/context`, async ({ cookies }) => {
    const scenario = await settleScenario(cookies, 260)
    if (scenario === 'error') return scenarioErrorResponse()
    if (scenario === 'empty') {
      return HttpResponse.json({ data: emptyContext })
    }
 return HttpResponse.json({
      data: {
        ...structuredClone(mockAgentContext),
        generatedAt: new Date().toISOString(),
      },
    })
  }),
  http.get(`${API_PREFIX}/agent-home/insights`, async ({ cookies }) => {
    const scenario = await settleScenario(cookies, 200)
    if (scenario === 'error') return scenarioErrorResponse()
    if (scenario === 'empty') {
      return HttpResponse.json({ data: { insights: [] } })
    }
    return HttpResponse.json({
      data: { insights: mockAgentContext.previousInsights },
    })
  }),
  // Mock-projected dashboard view model. The current backend has no
  // equivalent endpoint; services still target this path so that adopting a
  // real endpoint later (or client-side derivation in the API phase) needs
  // no service-layer changes.
  http.get(`${API_PREFIX}/agent-home/dashboard`, async ({ cookies }) => {
    const scenario = await settleScenario(cookies, 320)
    if (scenario === 'error') return scenarioErrorResponse()
    if (scenario === 'empty') {
      return HttpResponse.json({
        data: structuredClone(mockEmptyDashboardOverview),
      })
    }
    return HttpResponse.json({
      data: structuredClone(mockDashboardOverview),
    })
  }),
]
