// Test-only mock data switch. The Zeno React app is fully mock-driven in this
// phase; acceptance tests flip scenarios through this localStorage flag to
// exercise empty/loading states without a backend. Never read by the legacy
// MPA, CGStore or any production sync code path.
const SCENARIO_KEY = 'zeno_mock_scenario'

export type MockScenario = 'default' | 'empty'

export function getMockScenario(): MockScenario {
  try {
    return localStorage.getItem(SCENARIO_KEY) === 'empty' ? 'empty' : 'default'
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
