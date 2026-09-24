export type ApiEnvelope<T> = {
  success?: boolean
  data?: T
  code?: string
  message?: string
  revision?: number
}

export type ApiRequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  timeoutMs?: number
  signal?: AbortSignal
}

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/+$/, '')

export class ApiError extends Error {
  readonly code: string
  readonly status: number

  constructor(code: string, message: string, status: number) {
    super(message)
    this.code = code
    this.status = status
  }
}

export const api = {
  token: 'cg_token',
  user: 'cg_user',
  base: API_BASE,
}

export const AUTH_CHANGE_EVENT = 'chenguang:auth-changed'

export function notifyAuthChanged(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(AUTH_CHANGE_EVENT))
  }
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(api.token)
  } catch {
    return null
  }
}

export function setSession(token: string, user: unknown): void {
  try {
    localStorage.setItem(api.token, token)
    localStorage.setItem(api.user, JSON.stringify(user))
  } catch {
    /* storage may be unavailable in private mode; requests still work in-memory */
  }
  notifyAuthChanged()
}

export function clearSession(): void {
  try {
    localStorage.removeItem(api.token)
    localStorage.removeItem(api.user)
  } catch {
    /* ignore */
  }
  notifyAuthChanged()
}

export async function request<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), options.timeoutMs || 15000)
  const token = getToken()

  try {
    const response = await fetch(`${api.base}${path}`, {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal || controller.signal,
    })

    const payload = (await response.json().catch(() => null)) as ApiEnvelope<T> | null

    if (!response.ok) {
      throw new ApiError(
        payload?.code || 'REQUEST_FAILED',
        payload?.message || '服务暂时不可用，请稍后再试。',
        response.status,
      )
    }

    return (payload?.data ?? (payload as unknown)) as T
  } catch (error) {
    if (error instanceof ApiError) throw error
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ApiError('TIMEOUT', '请求超时，请稍后再试。', 408)
    }
    throw new ApiError('NETWORK_ERROR', '网络连接不可用，请检查网络。', 0)
  } finally {
    window.clearTimeout(timeout)
  }
}
