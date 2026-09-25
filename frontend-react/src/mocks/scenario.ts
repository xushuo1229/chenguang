// Test-only mock data switch. The Zeno React app is fully mock-driven in this
// phase; acceptance tests flip scenarios through this localStorage flag to
// exercise loading / empty / error states without a backend. Never read by the
// legacy MPA, CGStore or any production sync code path.
const SCENARIO_KEY = 'zeno_mock_scenario'

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
}

// Delay a mock service should wait before resolving, per active scenario.
export function mockScenarioDelayMs(baseMs: number): number {
  return getMockScenario() === 'loading'
    ? MOCK_LOADING_SCENARIO_MS
    : baseMs
}

// Whether a mock service should fail for the active scenario.
export function mockScenarioShouldFail(): boolean {
  return getMockScenario() === 'error'
}

export class MockScenarioError extends Error {
  constructor(message = '模拟的服务异常（mock error scenario）') {
    super(message)
    this.name = 'MockScenarioError'
  }
}
