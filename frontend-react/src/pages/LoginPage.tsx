import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { Loader2, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ErrorState } from '@/components/ui/state'
import * as authService from '@/services/authService'
import { useAuth } from '@/stores/auth-store'

type LocationState = { from?: string } | null

export default function LoginPage() {
  const { isAuthenticated, isLoading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as LocationState)?.from || '/dashboard'
  const [email, setEmail] = useState('explorer@zeno.ai')
  const [password, setPassword] = useState('zeno2026')

  const loginMutation = useMutation({
    mutationFn: () => authService.login(email, password),
    onSuccess: () => navigate(from, { replace: true }),
  })

  if (isLoading) {
    return (
      <div className="surface-card p-8 text-center text-sm text-muted">
        <Loader2 className="mx-auto mb-2 size-5 animate-spin text-primary" />
        正在检查登录状态...
      </div>
    )
  }

  if (isAuthenticated) return <Navigate to="/dashboard" replace />

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    loginMutation.mutate()
  }

  return (
    <div className="surface-card p-8">
      <div className="mb-6 flex items-center gap-3 lg:hidden">
        <span className="grid size-10 place-items-center rounded-2xl bg-gradient-to-br from-primary to-secondary text-white">
          <Sparkles className="size-5" />
        </span>
        <div>
          <p className="text-sm font-bold text-ink">Zeno</p>
          <p className="text-xs text-muted">AI Personal Growth OS</p>
        </div>
      </div>

      <h1 className="text-2xl font-bold tracking-tight text-ink">欢迎回来</h1>
      <p className="mt-1 text-sm text-muted">登录 Zeno AI Workspace，当前为 mock 登录</p>

      <form className="mt-7 space-y-4" onSubmit={handleSubmit}>
        <div className="space-y-2">
          <label htmlFor="email" className="text-sm font-medium text-ink">
            邮箱
          </label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@zeno.ai"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="password" className="text-sm font-medium text-ink">
            密码
          </label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="••••••••"
          />
        </div>

        {loginMutation.isError ? (
          <ErrorState
            text={loginMutation.error instanceof Error ? loginMutation.error.message : '登录失败，请稍后重试'}
          />
        ) : null}

        <Button type="submit" size="lg" className="w-full" disabled={loginMutation.isPending}>
          {loginMutation.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Sparkles className="size-4" />
          )}
          {loginMutation.isPending ? '正在登录...' : '登录'}
        </Button>
      </form>

      <p className="mt-5 text-center text-xs text-muted">mock 模式：任意非空邮箱与密码均可登录</p>
    </div>
  )
}
