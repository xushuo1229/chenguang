import { useEffect, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowRight, BrainCircuit, Compass, LineChart, Sparkles, Target } from 'lucide-react'
import { Button } from '@/components/UI/button'
import { Input } from '@/components/UI/input'
import { Badge } from '@/components/UI/badge'
import { ErrorState } from '@/components/UI/state'
import * as authService from '@/services/authService'
import { useAuth } from '@/stores/auth-store'

const capabilities = [
  {
    icon: BrainCircuit,
    title: '个人学习记忆',
    description: '把行为记录转化为可追踪、可解释、可检索的学习记忆。',
  },
  {
    icon: Compass,
    title: '确定性建议',
    description: '基于知识状态与证据给出下一步，而不是泛泛的鸡汤。',
  },
  {
    icon: Target,
    title: '行动闭环',
    description: 'AI 只建议，用户确认后进入学习执行与反馈链路。',
  },
  {
    icon: LineChart,
    title: '成长可视化',
    description: '看到专注、任务、知识与目标的长期变化。',
  },
]

export default function LandingPage() {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [nickname, setNickname] = useState('')
  const navigate = useNavigate()
  const location = useLocation()
  const { isAuthenticated, isLoading } = useAuth()

  useEffect(() => {
    setMode(new URLSearchParams(window.location.search).get('mode') === 'register' ? 'register' : 'login')
  }, [])

  const authMutation = useMutation({
    mutationFn: async () => {
      if (mode === 'login') return authService.login(email.trim(), password)
      return authService.register(nickname.trim(), email.trim(), password)
    },
    onSuccess: () => {
      navigate((location.state as { from?: string } | null)?.from || '/dashboard', { replace: true })
    },
  })

  if (!isLoading && isAuthenticated) {
    return <Navigate to="/dashboard" replace />
  }

  return (
    <main className="relative mx-auto flex min-h-dvh max-w-7xl flex-col px-5 pb-16 lg:px-8">
      <header className="flex items-center justify-between py-6">
        <a href="/" className="flex items-center gap-2.5">
          <span className="grid size-10 place-items-center rounded-2xl bg-gradient-to-br from-primary to-secondary text-white shadow-lg shadow-primary/25">
            <Sparkles className="size-5" />
          </span>
          <span>
            <span className="block text-base font-bold">Zeno</span>
            <span className="block text-xs text-muted">Personal Learning Agent OS</span>
          </span>
        </a>
        <nav className="hidden items-center gap-6 text-sm text-muted md:flex">
          <a href="#capabilities">能力</a>
          <a href="#workflow">工作流</a>
          <Button size="sm" onClick={() => setMode('login')}>进入工作区</Button>
        </nav>
      </header>

      <section className="grid flex-1 items-center gap-10 py-10 lg:grid-cols-[1.05fr_.95fr] lg:gap-16">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="max-w-2xl"
        >
          <Badge tone="primary" className="mb-5">
            <Sparkles className="size-3" />
            AI Native Learning OS
          </Badge>
          <h1 className="text-5xl font-bold leading-[1.05] tracking-tight text-ink md:text-6xl">
            你的私人
            <span className="gradient-text">学习 Agent</span>
            <br />
            从记录到行动。
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-muted">
            Zeno不只是一个学习记录网站。它理解你的任务、专注、知识与目标，
            将数据转化为可解释的成长判断，并在你确认后推进下一步。
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button size="lg" onClick={() => setMode('login')}>
              登录 Agent OS
              <ArrowRight className="size-4" />
            </Button>
            <Button size="lg" variant="outline" onClick={() => setMode('register')}>
              创建学习空间
            </Button>
          </div>
          <dl className="mt-10 grid max-w-xl grid-cols-2 gap-4 md:grid-cols-4">
            {[
              ['Read Only', 'AI 默认只读'],
              ['Evidence', '回答有依据'],
              ['Confirm', '行动需确认'],
              ['Personal', '专属成长上下文'],
            ].map(([title, description]) => (
              <div key={title} className="rounded-2xl border border-line bg-surface/70 p-4">
                <dt className="text-sm font-semibold text-ink">{title}</dt>
                <dd className="mt-1 text-xs text-muted">{description}</dd>
              </div>
            ))}
          </dl>
        </motion.div>

        <motion.div
          id="auth"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
          className="surface-card mx-auto w-full max-w-md p-7"
        >
          <div className="flex rounded-2xl bg-slate-100 p-1">
            {(['login', 'register'] as const).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setMode(item)}
                className={`h-9 flex-1 rounded-xl text-sm font-medium transition-colors ${
                  mode === item ? 'bg-surface text-ink shadow-sm' : 'text-muted'
                }`}
              >
                {item === 'login' ? '登录' : '注册'}
              </button>
            ))}
          </div>

          <form
            className="mt-6 space-y-4"
            onSubmit={(event) => {
              event.preventDefault()
              authMutation.mutate()
            }}
          >
            {mode === 'register' ? (
              <label className="block space-y-2">
                <span className="text-sm font-medium text-ink">昵称</span>
                <Input value={nickname} onChange={(event) => setNickname(event.target.value)} placeholder="怎么称呼你" required />
              </label>
            ) : null}
            <label className="block space-y-2">
              <span className="text-sm font-medium text-ink">邮箱</span>
              <Input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                required
              />
            </label>
            <label className="block space-y-2">
              <span className="text-sm font-medium text-ink">密码</span>
              <Input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="至少 8 位，含大小写字母和数字"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                required
              />
            </label>
            {authMutation.isError ? <ErrorState text={(authMutation.error as Error).message} /> : null}
            <Button type="submit" size="lg" className="w-full" disabled={authMutation.isPending}>
              {authMutation.isPending ? '正在处理...' : mode === 'login' ? '进入工作区' : '创建账号'}
            </Button>
          </form>
          <p className="mt-4 text-center text-xs text-muted">
            登录即代表你同意仅在自己的授权空间中处理学习数据。
          </p>
        </motion.div>
      </section>

      <section id="capabilities" className="grid gap-5 py-12 md:grid-cols-2 xl:grid-cols-4">
        {capabilities.map(({ icon: Icon, title, description }, index) => (
          <motion.article
            key={title}
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.45, delay: index * 0.05 }}
            className="surface-card p-6"
          >
            <span className="mb-4 grid size-11 place-items-center rounded-2xl bg-primary/10 text-primary">
              <Icon className="size-5" />
            </span>
            <h2 className="text-lg font-semibold text-ink">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-muted">{description}</p>
          </motion.article>
        ))}
      </section>

      <section id="workflow" className="surface-card overflow-hidden p-8">
        <div className="grid gap-8 lg:grid-cols-3">
          {[
            ['1 · 感知', '同步任务、专注、学习与知识状态。'],
            ['2 · 理解', '生成证据绑定和风险信号。'],
            ['3 · 行动', '给出下一步建议，等待你确认执行。'],
          ].map(([title, description]) => (
            <div key={title}>
              <h2 className="text-lg font-semibold text-ink">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-muted">{description}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}
