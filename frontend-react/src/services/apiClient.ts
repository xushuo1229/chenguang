export type ApiEnvelope<T> = {
  data?: T
  error?: { code?: string; message?: string }
}

export type ApiRequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  timeoutMs?: number
  signal?: AbortSignal
}

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '/api').replace(
  /\/+$/,
  '',
)

export class ApiError extends Error {
  readonly code: string
  readonly status: number

  constructor(code: string, message: string, status: number) {
    super(message)
    this.code = code
    this.status = status
  }
}

// The React app owns its own session source (zeno_auth); apiClient must
// never touch the legacy MPA's cg_token key.
type AccessTokenProvider = () => string | null

let accessTokenProvider: AccessTokenProvider = () => null

export function configureAccessTokenProvider(
  provider: AccessTokenProvider,
): void {
  accessTokenProvider = provider
}

export async function request<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const controller = new AbortController()
  const timeout = window.setTimeout(
    () => controller.abort(),
    options.timeoutMs || 15000,
  )
  const token = accessTokenProvider()

  try {
    const response = await fetch(`${API_BASE}${path}`, {
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
        payload?.error?.code || 'REQUEST_FAILED',
        payload?.error?.message || '服务暂时不可用，请稍后再试。',
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
