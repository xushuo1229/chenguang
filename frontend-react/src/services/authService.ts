import { request } from './apiClient'
import { clearSession, setSession } from './session'

export type AuthUser = {
  id: number
  nickname?: string
  email: string
  avatar?: string
  is_admin?: boolean
  email_verified?: boolean
}

type AuthResult = { token: string; user: AuthUser }

export async function login(
  email: string,
  password: string,
): Promise<AuthUser> {
  if (!email.trim() || !password.trim()) throw new Error('请输入邮箱和密码')
  const result = await request<AuthResult>('/auth/login', {
    method: 'POST',
    body: { email: email.trim(), password },
  })
  return setSession(
    { ...result.user, email: email.trim() },
    result.token,
  ).user
}

export async function register(
  nickname: string,
  email: string,
  password: string,
): Promise<AuthUser> {
  if (!nickname.trim() || !email.trim() || !password.trim()) {
    throw new Error('请完整填写注册信息')
  }
  const result = await request<AuthResult>('/auth/register', {
    method: 'POST',
    body: { nickname: nickname.trim(), email: email.trim(), password },
  })
  return setSession(
    { ...result.user, nickname: nickname.trim(), email: email.trim() },
    result.token,
  ).user
}

export async function getMe(): Promise<AuthUser> {
  const result = await request<{ user: AuthUser }>('/auth/me')
  return result.user
}

export async function logout(): Promise<void> {
  clearSession()
}

export async function forgotPassword(email: string): Promise<void> {
  await request('/auth/forgot-password', {
    method: 'POST',
    body: { email: email.trim() },
  })
}

export async function resetPassword(
  token: string,
  password: string,
): Promise<void> {
  await request('/auth/reset-password', {
    method: 'POST',
    body: { token, password },
  })
}

export async function verifyEmail(token: string): Promise<void> {
  await request('/auth/verify-email', {
    method: 'POST',
    body: { token },
  })
}

export async function resendVerification(): Promise<void> {
  await request('/auth/resend-verification', { method: 'POST' })
}

// 使所有设备上的会话失效；当前设备拿到携带新版本的令牌并就地更新会话。
export async function logoutAllDevices(): Promise<AuthUser> {
  const result = await request<AuthResult>('/auth/logout-all', {
    method: 'POST',
  })
  return setSession(result.user, result.token).user
}
