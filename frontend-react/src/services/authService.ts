import { request } from './apiClient'
import { clearMockSession, setMockSession } from './mockSession'

export type AuthUser = {
  id: number
  nickname?: string
  email: string
  avatar?: string
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
  return setMockSession(
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
  return setMockSession(
    { ...result.user, nickname: nickname.trim(), email: email.trim() },
    result.token,
  ).user
}

export async function getMe(): Promise<AuthUser> {
  const result = await request<{ user: AuthUser }>('/auth/me')
  return result.user
}

export async function logout(): Promise<void> {
  clearMockSession()
}
