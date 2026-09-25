import { request } from './apiClient'
import { getSession, setSession } from './session'
import type { AuthUser } from './authService'

export type ProfileUpdate = {
  nickname?: string
  avatar_url?: string
}

export async function updateProfile(
  payload: ProfileUpdate,
): Promise<{ user: AuthUser }> {
  const session = getSession()
  if (!session) throw new Error('未登录')
  const result = await request<{ user: AuthUser }>('/auth/me', {
    method: 'PUT',
    body: payload,
  })
  return { user: setSession(result.user, session.token).user }
}
