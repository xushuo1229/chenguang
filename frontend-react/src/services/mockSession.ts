import { configureAccessTokenProvider } from './apiClient'
import type { AuthUser } from './authService'

const SESSION_KEY = 'zeno_mock_session'
export const MOCK_AUTH_EVENT = 'zeno:auth-changed'

export type MockSession = { token: string; user: AuthUser }

export function getMockSession(): MockSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    return raw ? (JSON.parse(raw) as MockSession) : null
  } catch {
    return null
  }
}

export function setMockSession(user: AuthUser, token?: string): MockSession {
  const session: MockSession = {
    token: token ?? `zeno-mock-${Date.now()}`,
    user,
  }
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  } catch {
    // storage unavailable: session still works in memory for this tab
  }
  window.dispatchEvent(new Event(MOCK_AUTH_EVENT))
  return session
}
export function clearMockSession(): void {
  try {
    localStorage.removeItem(SESSION_KEY)
  } catch {
    // ignore
  }
  window.dispatchEvent(new Event(MOCK_AUTH_EVENT))
}

configureAccessTokenProvider(() => getMockSession()?.token ?? null)
