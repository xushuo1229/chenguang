import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ErrorState } from '@/components/ui/state'
import * as authService from '@/services/authService'

const cardNote = 'text-[13px] leading-6 text-ink-muted'

function useTokenFromQuery() {
  return new URLSearchParams(window.location.search).get('token') ?? ''
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const mutation = useMutation({
    mutationFn: () => authService.forgotPassword(email),
    onSuccess: () => setSent(true),
  })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    mutation.mutate()
  }

  if (sent) {
    return (
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">
          查收重置邮件
        </h1>
        <p className={`mt-2 ${cardNote}`}>
          如果该邮箱已注册，我们已发送一封密码重置邮件。为保护账号安全，无论邮箱是否存在都会显示此提示。
        </p>
        <Link
          to="/login"
          className="mt-6 inline-block text-sm font-medium text-primary hover:underline"
        >
          返回登录
        </Link>
      </div>
    )
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-ink">
        重置密码
      </h1>
      <p className={`mt-2 ${cardNote}`}>
        输入注册邮箱，我们会给你发送重置链接。
      </p>
      <form className="mt-7 space-y-4" onSubmit={submit}>
        <Input
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
        />
        {mutation.isError ? (
          <ErrorState text="发送失败，请稍后再试。" />
        ) : null}
        <Button type="submit" size="lg" className="w-full" disabled={mutation.isPending}>
          {mutation.isPending ? <Loader2 className="animate-spin" /> : null}
          发送重置链接
        </Button>
      </form>
      <p className="mt-7 text-center text-[13px] text-ink-muted">
        <Link to="/login" className="text-primary hover:underline">
          返回登录
        </Link>
      </p>
    </div>
  )
}

export function ResetPasswordPage() {
  const token = useTokenFromQuery()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const mutation = useMutation({
    mutationFn: () => authService.resetPassword(token, password),
    onSuccess: () => navigate('/login?reason=reset', { replace: true }),
  })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    mutation.mutate()
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-ink">
        设置新密码
      </h1>
      <p className={`mt-2 ${cardNote}`}>重置后所有已登录设备都需要重新登录。</p>
      {!token ? (
        <ErrorState
          className="mt-6"
          text="重置链接无效或已过期，请重新申请。"
          action={
            <Link to="/forgot-password">
              <Button size="sm" variant="outline">
                重新申请
              </Button>
            </Link>
          }
        />
      ) : (
        <form className="mt-7 space-y-4" onSubmit={submit}>
          <Input
            type="password"
            autoComplete="new-password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="新密码（至少 6 位）"
          />
          {mutation.isError ? (
            <ErrorState
              text={
                mutation.error instanceof Error
                  ? mutation.error.message
                  : '重置失败，请稍后再试。'
              }
            />
          ) : null}
          <Button type="submit" size="lg" className="w-full" disabled={mutation.isPending}>
            {mutation.isPending ? <Loader2 className="animate-spin" /> : null}
            确认重置
          </Button>
        </form>
      )}
    </div>
  )
}

export function VerifyEmailPage() {
  const token = useTokenFromQuery()
  const called = useRef(false)
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (called.current || !token) return
    called.current = true
    authService
      .verifyEmail(token)
      .then(() => setState('ok'))
      .catch((err: unknown) => {
        setState('error')
        setMessage(err instanceof Error ? err.message : '验证失败')
      })
  }, [token])

  useEffect(() => {
    if (!token) {
      setState('error')
      setMessage('验证链接无效或已过期。')
    }
  }, [token])

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-ink">
        邮箱验证
      </h1>
      {state === 'loading' ? (
        <p className={`mt-4 ${cardNote}`}>
          <Loader2 className="mr-2 inline size-4 animate-spin" />
          正在验证…
        </p>
      ) : state === 'ok' ? (
        <>
          <p className="mt-3 text-sm text-success">邮箱验证成功。</p>
          <Link
            to="/login"
            className="mt-6 inline-block text-sm font-medium text-primary hover:underline"
          >
            前往登录
          </Link>
        </>
      ) : (
        <>
          <ErrorState className="mt-4" text={message} />
          <Link
            to="/login"
            className="mt-6 inline-block text-sm font-medium text-primary hover:underline"
          >
            返回登录
          </Link>
        </>
      )}
    </div>
  )
}
