import { http, HttpResponse } from 'msw'
import { mockSyncSnapshot } from '@/mocks/data'
import { API_PREFIX } from '../paths'
import { scenarioErrorResponse, settleScenario } from './shared'

const emptySnapshot = {
  revision: 3901,
  updatedAt: new Date().toISOString(),
  data: {},
}

const STORAGE_KEY = 'zeno_mock_snapshot'

// Mock snapshot persistence lives in same-origin localStorage so it survives
// full page navigations within one test. Playwright gives every test its own
// browser context, thus storage resets between tests automatically. This key
// is mock-only and never read by the real app, CGStore, or the legacy MPA.
function readSnapshot(): typeof mockSyncSnapshot {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as typeof mockSyncSnapshot
      if (parsed && typeof parsed === 'object' && parsed.data) return parsed
    }
  } catch {
    // fall through to seed
  }
  const seeded = structuredClone(mockSyncSnapshot)
  writeSnapshot(seeded)
  return seeded
}

function writeSnapshot(envelope: typeof mockSyncSnapshot): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope))
  } catch {
    // storage unavailable: fall back to per-realm behavior
  }
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
    return HttpResponse.json({ data: structuredClone(readSnapshot()) })
  }),
  http.put(`${API_PREFIX}/data`, async ({ request }) => {
    const body = (await request.json().catch(() => null)) as
      | { data?: typeof mockSyncSnapshot.data }
      | null
    if (!body?.data) {
      return HttpResponse.json(
        { error: { code: 'INVALID_INPUT', message: '缺少数据体' } },
        { status: 400 },
      )
    }
    const current = readSnapshot()
    const envelope: typeof mockSyncSnapshot = {
      revision: (current.revision ?? 0) + 1,
      updatedAt: new Date().toISOString(),
      data: body.data,
    }
    writeSnapshot(envelope)
    return HttpResponse.json({ data: structuredClone(envelope) })
  }),
]