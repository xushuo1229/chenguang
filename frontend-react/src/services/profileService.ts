import { delay, getMockSession, setMockSession } from './mockSession'
import type { AuthUser } from './authService'
import type { AgentContext } from './agentService'

export type ProfileUpdate = {
  nickname?: string
  avatar_url?: string
}

export async function updateProfile(payload: ProfileUpdate): Promise<{ user: AuthUser }> {
  await delay(300)
  const session = getMockSession()
  if (!session) throw new Error('未登录')
  const user: AuthUser = {
    ...session.user,
    nickname: payload.nickname ?? session.user.nickname,
    avatar: payload.avatar_url ?? session.user.avatar,
  }
  setMockSession(user)
  return { user }
}

export type ProfileProjection = {
  user: AuthUser | null
  context?: AgentContext
}
