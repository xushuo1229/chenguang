import { clearMockSession, delay, getMockSession, setMockSession } from './mockSession'
import { mockUser } from '@/mocks/data'

export type AuthUser = {
  id: number
  nickname?: string
  email: string
  avatar?: string
}

export async function login(email: string, password: string): Promise<AuthUser> {
  await delay(420)
  if (!email.trim() || !password.trim()) throw new Error('请输入邮箱和密码')
  const user: AuthUser = { ...mockUser, email: email.trim() }
  return setMockSession(user).user
}

export async function register(nickname: string, email: string, password: string): Promise<AuthUser> {
  await delay(520)
  if (!nickname.trim() || !email.trim() || !password.trim()) throw new Error('请完整填写注册信息')
  const user: AuthUser = { ...mockUser, nickname: nickname.trim(), email: email.trim() }
  return setMockSession(user).user
}

export async function getMe(): Promise<AuthUser> {
  await delay(160)
  const session = getMockSession()
  if (!session) throw new Error('当前没有 mock 会话')
  return session.user
}

export async function logout(): Promise<void> {
  clearMockSession()
}
