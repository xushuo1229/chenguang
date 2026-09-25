// Test-only mock scenario switch. The Zeno React app is fully mock-driven in
// this phase; acceptance tests flip scenarios to exercise loading / empty /
// error states without a backend. The active scenario is mirrored into a
// cookie because MSW runs as a service worker, which has no localStorage
// access. Never read by the legacy MPA, CGStore or any production sync path.
const SCENARIO_KEY = 'zeno_mock_scenario'
const COOKIE_NAME = 'zeno_mock_scenario'

export type MockScenario = 'default' | 'empty' | 'loading' | 'error'

const scenarios: ReadonlySet<MockScenario> = new Set([
  'default',
  'empty',
  'loading',
  'error',
])

// Long enough for an e2e assertion to observe the skeleton, short enough to
// keep the acceptance suite fast.
export const MOCK_LOADING_SCENARIO_MS = 3000

export function getMockScenario(): MockScenario {
  try {
    const value = localStorage.getItem(SCENARIO_KEY)
    return value && scenarios.has(value as MockScenario)
      ? (value as MockScenario)
      : 'default'
  } catch {
    return 'default'
  }
}

export function setMockScenario(scenario: MockScenario): void {
  try {
    if (scenario === 'default') {
      localStorage.removeItem(SCENARIO_KEY)
    } else {
      localStorage.setItem(SCENARIO_KEY, scenario)
    }
  } catch {
    // storage unavailable: scenario stays default for this tab
  }
  writeScenarioCookie(scenario)
}

export function writeScenarioCookie(scenario: MockScenario): void {
  if (typeof document === 'undefined') return
  if (scenario === 'default') {
    document.cookie = `${COOKIE_NAME}=; Max-Age=0; path=/`
  } else {
    document.cookie = `${COOKIE_NAME}=${scenario}; path=/; SameSite=Lax`
  }
}
