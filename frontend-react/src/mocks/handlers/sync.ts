import { http, HttpResponse } from 'msw'
import { mockSyncSnapshot } from '@/mocks/data'
import { API_PREFIX } from '../paths'
import { scenarioErrorResponse, settleScenario } from './shared'

const emptySnapshot = {
  revision: 3901,
  updatedAt: new Date().toISOString(),
  data: {},
}

// GET /api/data → whole-snapshot sync (res.success envelope unwrapped by
// apiClient).
export const syncHandlers = [
  http.get(`${API_PREFIX}/data`, async ({ cookies }) => {
    const scenario = await settleScenario(cookies, 260)
    if (scenario === 'error') return scenarioErrorResponse()
    if (scenario === 'empty') {
      return HttpResponse.json({ data: emptySnapshot })
    }
    return HttpResponse.json({ data: structuredClone(mockSyncSnapshot) })
  }),
]
