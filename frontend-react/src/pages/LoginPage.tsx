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

export default function LoginPage() {
  const { isAuthenticated, isLoading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as LocationState)?.from ?? '/dashboard'
  const [email, setEmail] = useState('explorer@zeno.ai')
  const [password, setPassword] = useState('zeno2026')
  const [remember, setRemember] = useState(true)

  const loginMutation = useMutation({
    mutationFn: () => authService.login(email, password),
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
    loginMutation.mutate()
  }

  return (
    <div>
      <div className="mb-2 flex items-center gap-2 lg:hidden">
        <span className="grid size-8 place-items-center rounded-control bg-primary text-primary-foreground" />
        <span className="text-sm font-semibold text-ink">Zeno Workspace</span>
      </div>

      <h1 className="text-2xl font-semibold tracking-tight text-ink">
        欢迎回来
      </h1>
      <p className="mt-1 text-sm text-ink-muted">
        使用你的账号登录 Zeno AI Workspace
      </p>

      <form className="mt-7 space-y-4" onSubmit={handleSubmit}>
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
          <div className="flex items-center justify-between">
            <label
              htmlFor="password"
              className="text-[13px] font-medium text-ink"
            >
              密码
            </label>
            <button
              type="button"
              className="text-[13px] text-primary hover:underline"
            >
              忘记密码？
            </button>
          </div>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="输入密码"
          />
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-[13px] text-ink-secondary">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="size-4 rounded border-line text-primary accent-[var(--primary)]"
          />
          保持登录状态
        </label>

        {loginMutation.isError ? (
          <ErrorState
            title="登录失败"
            text={
              loginMutation.error instanceof Error
                ? loginMutation.error.message
                : '请稍后重试'
            }
          />
        ) : null}

        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={loginMutation.isPending}
        >
          {loginMutation.isPending ? <Loader2 className="animate-spin" /> : null}
          {loginMutation.isPending ? '正在登录...' : '登录'}
        </Button>
      </form>

      <div className="my-6 flex items-center gap-3 text-[11px] text-ink-faint">
        <span className="h-px flex-1 bg-line" />
        或使用
        <span className="h-px flex-1 bg-line" />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" type="button" disabled>
          SSO 登录
        </Button>
        <Button variant="outline" type="button" disabled>
          Google
        </Button>
      </div>

      <p className="mt-7 text-center text-[13px] text-ink-muted">
        还没有账号？{' '}
        <button type="button" className="text-primary hover:underline">
          联系管理员开通
        </button>
      </p>
    </div>
  )
}
