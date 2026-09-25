import { configureAccessTokenProvider } from './apiClient'
import type { AuthUser } from './authService'

const SESSION_KEY = 'zeno_auth'
const LEGACY_MOCK_KEY = 'zeno_mock_session'
export const AUTH_EVENT = 'zeno:auth-changed'

export type Session = { token: string; user: AuthUser }

// The earlier mock-only session key belonged to the React app; remove any
// leftover so storage stays clean. Never touches cg_token / cg_user.
try {
  localStorage.removeItem(LEGACY_MOCK_KEY)
} catch {
  // storage unavailable
}

export function getSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    return raw ? (JSON.parse(raw) as Session) : null
  } catch {
    return null
  }
}

export function setSession(user: AuthUser, token: string): Session {
  const session: Session = { token, user }
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  } catch {
    // storage unavailable: session still works in memory for this tab
  }
  window.dispatchEvent(new Event(AUTH_EVENT))
  return session
}

export function clearSession(): void {
  try {
    localStorage.removeItem(SESSION_KEY)
  } catch {
    // ignore
  }
  window.dispatchEvent(new Event(AUTH_EVENT))
}

configureAccessTokenProvider(() => getSession()?.token ?? null)
