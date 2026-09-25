import { delay as mswDelay, HttpResponse } from 'msw'
import {
  MOCK_LOADING_SCENARIO_MS,
  type MockScenario,
} from '@/mocks/scenario'

export const MOCK_ERROR_CODE = 'MOCK_SCENARIO_ERROR'
export const MOCK_ERROR_MESSAGE = '模拟的服务异常（mock error scenario）'

// Wait per active scenario, then report it. loading mirrors
// MOCK_LOADING_SCENARIO_MS; every other scenario uses the endpoint's
// natural latency.
export async function settleScenario(
  cookies: Record<string, string | undefined>,
  baseDelayMs: number,
): Promise<MockScenario> {
  const raw = cookies.zeno_mock_scenario
  const scenario: MockScenario =
    raw === 'empty' || raw === 'loading' || raw === 'error'
      ? raw
      : 'default'
  await mswDelay(
    scenario === 'loading' ? MOCK_LOADING_SCENARIO_MS : baseDelayMs,
  )
  return scenario
}

export function scenarioErrorResponse(): Response {
  return HttpResponse.json(
    { error: { code: MOCK_ERROR_CODE, message: MOCK_ERROR_MESSAGE } },
    { status: 500 },
  )
}
