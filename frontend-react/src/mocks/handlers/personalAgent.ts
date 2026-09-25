import { delay as mswDelay, http, HttpResponse } from 'msw'
import { buildAgentReply, mockAgentContext } from '@/mocks/data'
import { API_PREFIX } from '../paths'
import { scenarioErrorResponse, settleScenario } from './shared'

const emptyContext = { version: 'zeno-mock-1', readOnly: true }

export const personalAgentHandlers = [
  http.get(`${API_PREFIX}/personal-agent/context`, async ({ cookies }) => {
    const scenario = await settleScenario(cookies, 300)
    if (scenario === 'error') return scenarioErrorResponse()
    if (scenario === 'empty') {
      return HttpResponse.json({ data: emptyContext })
    }
    return HttpResponse.json({ data: structuredClone(mockAgentContext) })
  }),
  http.post(`${API_PREFIX}/personal-agent/chat`, async ({ request }) => {
    const body = (await request.json().catch(() => null)) as
      | {
          message?: string
          mode?: 'personal' | 'general'
          conversationId?: string
        }
      | null
    await mswDelay(680)
    return HttpResponse.json({
      data: buildAgentReply(
        String(body?.message ?? ''),
        body?.mode === 'general' ? 'general' : 'personal',
      ),
    })
  }),
]
