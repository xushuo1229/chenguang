import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ErrorState } from '@/components/ui/state'
import * as authService from '@/services/authService'
import { useAuth } from '@/stores/auth-store'

type LocationState = { from?: string } | null
type Mode = 'login' | 'register'

export default function LoginPage() {
  const { isAuthenticated, isLoading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as LocationState)?.from ?? '/dashboard'
  const [mode, setMode] = useState<Mode>('login')
  const [nickname, setNickname] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const authMutation = useMutation({
    mutationFn: () =>
      mode === 'login'
        ? authService.login(email, password)
        : authService.register(nickname, email, password),
    onSuccess: () => navigate(from, { replace: true }),
  })

  if (isLoading) {
    return (
      <div className="rounded-card border border-line bg-surface p-8 text-center text-sm text-ink-muted">
        <Loader2 className="mx-auto mb-2 size-5 animate-spin text-primary" />
        正在检查登录状态...
      </div>
    )
  }

  if (isAuthenticated) return <Navigate to="/dashboard" replace />

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    authMutation.mutate()
  }

  const switchMode = (next: Mode) => {
    setMode(next)
    authMutation.reset()
  }

  return (
    <div>
      <div className="mb-2 flex items-center gap-2 lg:hidden">
        <span className="grid size-8 place-items-center rounded-control bg-primary text-primary-foreground" />
        <span className="text-sm font-semibold text-ink">Zeno Workspace</span>
      </div>

      <h1 className="text-2xl font-semibold tracking-tight text-ink">
        {mode === 'login' ? '欢迎回来' : '创建你的账号'}
      </h1>
      <p className="mt-1 text-sm text-ink-muted">
        {mode === 'login'
          ? '登录 Zeno AI Workspace，继续你的成长'
          : '注册后即可导入课程、构建知识库'}
      </p>

      <form className="mt-7 space-y-4" onSubmit={handleSubmit}>
        {mode === 'register' ? (
          <div className="space-y-1.5">
            <label
              htmlFor="nickname"
              className="text-[13px] font-medium text-ink"
            >
              昵称
            </label>
            <Input
              id="nickname"
              autoComplete="nickname"
              required
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="你的称呼"
            />
          </div>
        ) : null}

        <div className="space-y-1.5">
          <label htmlFor="email" className="text-[13px] font-medium text-ink">
            邮箱
          </label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
          />
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="password"
            className="text-[13px] font-medium text-ink"
          >
            密码
          </label>
          <Input
            id="password"
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="至少 6 位"
          />
        </div>

        {authMutation.isError ? (
          <ErrorState
            title={mode === 'login' ? '登录失败' : '注册失败'}
            text={
              authMutation.error instanceof Error
                ? authMutation.error.message
                : '请稍后重试'
            }
          />
        ) : null}

        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={authMutation.isPending}
        >
          {authMutation.isPending ? <Loader2 className="animate-spin" /> : null}
          {authMutation.isPending
            ? '请稍候...'
            : mode === 'login'
              ? '登录'
              : '注册并进入'}
        </Button>
      </form>

      <p className="mt-7 text-center text-[13px] text-ink-muted">
        {mode === 'login' ? '还没有账号？' : '已经有账号了？'}{' '}
        <button
          type="button"
          className="text-primary hover:underline"
          onClick={() => switchMode(mode === 'login' ? 'register' : 'login')}
        >
          {mode === 'login' ? '立即注册' : '去登录'}
        </button>
      </p>
    </div>
  )
}
