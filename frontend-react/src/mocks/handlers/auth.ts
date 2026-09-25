import { http, HttpResponse } from 'msw'
import { mockUser } from '@/mocks/data'
import { API_PREFIX } from '../paths'

function mockToken(): string {
  return `zeno-mock-${Date.now()}`
}

type AuthRequestBody = {
  nickname?: string
  email?: string
  password?: string
}

// Mirrors the real backend's flat auth responses: login/register return
// { token, user } directly (not the { data } envelope); /me returns { user }.
export const authHandlers = [
  http.post(`${API_PREFIX}/auth/register`, async ({ request }) => {
    const body = (await request.json().catch(() => null)) as AuthRequestBody | null
    const nickname = String(body?.nickname ?? '').trim()
    const email = String(body?.email ?? '').trim()
    const password = String(body?.password ?? '')
    if (!nickname || !email || !password) {
      return HttpResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: '请完整填写注册信息' } },
        { status: 400 },
      )
    }
    return HttpResponse.json({
      token: mockToken(),
      user: { ...mockUser, nickname, email },
    })
  }),
  http.post(`${API_PREFIX}/auth/login`, async ({ request }) => {
    const body = (await request.json().catch(() => null)) as AuthRequestBody | null
    const email = String(body?.email ?? '').trim()
    const password = String(body?.password ?? '')
    if (!email || !password) {
      return HttpResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: '请输入邮箱和密码' } },
        { status: 400 },
      )
    }
    return HttpResponse.json({
      token: mockToken(),
      user: { ...mockUser, email },
    })
  }),
  http.get(`${API_PREFIX}/auth/me`, ({ request }) => {
    if (!request.headers.get('Authorization')?.startsWith('Bearer zeno-mock-')) {
      return HttpResponse.json(
        { error: { code: 'UNAUTHORIZED', message: '未登录或会话已失效' } },
        { status: 401 },
      )
    }
    return HttpResponse.json({ user: mockUser })
  }),
  http.put(`${API_PREFIX}/auth/me`, async ({ request }) => {
    if (!request.headers.get('Authorization')?.startsWith('Bearer zeno-mock-')) {
      return HttpResponse.json(
        { error: { code: 'UNAUTHORIZED', message: '未登录或会话已失效' } },
        { status: 401 },
      )
    }
    const body = (await request.json().catch(() => null)) as
      | (AuthRequestBody & { avatar_url?: string })
      | null
    return HttpResponse.json({
      user: {
        ...mockUser,
        nickname: body?.nickname ?? mockUser.nickname,
        avatar: body?.avatar_url ?? mockUser.avatar,
      },
    })
  }),
]
