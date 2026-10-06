import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  BookOpen,
  Circle,
  CheckCircle2,
  Clock,
  Flame,
  Languages,
  Sparkles,
} from 'lucide-react'
import { useSnapshot, useUpdateSnapshot } from '@/features/snapshot/useSnapshot'
import { QuickLogBar } from '@/features/dashboard/quickLog/QuickLogBar'
import { getAgentContext } from '@/services/agentService'
import { useAuth } from '@/stores/auth-store'
import { dateKey } from '@/lib/dateKey'
import { cn } from '@/lib/utils'

function greeting(): string {
  const hour = new Date().getHours()
  if (hour < 5) return '夜深了'
  if (hour < 12) return '早上好'
  if (hour < 18) return '下午好'
  return '晚上好'
}

type ActivityItem = {
  id: string
  date: string
  title: string
  detail: string
  icon: typeof Clock
}

export default function WorkspacePage() {
  const snapshotQuery = useSnapshot()
  const updateSnapshot = useUpdateSnapshot()
  const contextQuery = useQuery({
    queryKey: ['zeno', 'agent-context'],
    queryFn: getAgentContext,
  })
  const { user } = useAuth()

  const data = snapshotQuery.data?.data
  const today = dateKey()
  const todos = (data?.todos ?? []).filter((todo) => todo.date === today)
  const behavior = contextQuery.data?.context?.behavior?.value
  const focusToday = behavior?.focusSummary?.minutes ??
    (data?.focus ?? [])
      .filter((record) => record.date === today)
      .reduce((sum, record) => sum + (Number(record.minutes) || 0), 0)
  const streak = behavior?.streaks?.currentStreak

  const recommendation =
    contextQuery.data?.review?.nextBestRecommendation?.nodeTitle ??
    contextQuery.data?.context?.knowledgeStates?.value?.weakTopics?.[0]

  const recent: ActivityItem[] = [
    ...(data?.focus ?? []).map((record, index) => ({
      id: `focus-${index}-${record.date}`,
      date: record.date ?? '',
      title: record.task || '专注学习',
      detail: `${Number(record.minutes) || 0} 分钟`,
      icon: Clock,
    })),
    ...(data?.readings ?? []).map((record, index) => ({
      id: `reading-${index}-${record.date}`,
      date: record.date ?? '',
      title: record.bookName || '阅读',
      detail: `${Number(record.pages) || 0} 页`,
      icon: BookOpen,
    })),
    ...(data?.english ?? []).map((record, index) => ({
      id: `english-${index}-${record.date}`,
      date: record.date ?? '',
      title: '英语学习',
      detail: `${Number(record.minutes) || 0} 分钟`,
      icon: Languages,
    })),
  ]
    .filter((item) => item.date <= today)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 6)

  const toggleTodo = (id: string) => {
    updateSnapshot.mutate((draft) => {
      draft.todos = (draft.todos ?? []).map((todo) =>
        todo.id === id
          ? { ...todo, done: !(todo.done ?? todo.completed ?? false) }
          : todo,
      )
      return draft
    })
  }

  if (snapshotQuery.isError) {
    return (
      <div role="alert" className="rounded-card border border-danger/30 bg-danger-muted p-6">
        <p className="text-sm font-medium text-danger">无法加载你的工作区</p>
        <p className="mt-1 text-xs text-ink-muted">服务端没有响应，请检查网络后重试。</p>
        <button
          type="button"
          onClick={() => void snapshotQuery.refetch()}
          className="mt-3 text-[13px] font-medium text-primary hover:underline"
        >
          重试
        </button>
      </div>
    )
  }

  if (snapshotQuery.isPending) {
    return (
      <div className="space-y-5">
        <div className="h-7 w-56 animate-pulse rounded bg-surface-muted" />
        <div className="h-12 w-full animate-pulse rounded-card bg-surface-muted" />
        <div className="h-40 w-full animate-pulse rounded-card bg-surface-muted" />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-ink">
          {greeting()}，{user?.nickname || '同学'}
        </h1>
        <p className="mt-1 text-[13px] text-ink-muted">
          今天专注 {focusToday} 分钟{typeof streak === 'number' ? ` · 连续 ${streak} 天` : ''}
        </p>
      </div>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-ink">Today&apos;s Plan</h2>
          <p className="text-xs text-ink-faint">{todos.filter((todo) => todo.done ?? todo.completed).length}/{todos.length} 完成</p>
        </div>
        {todos.length === 0 ? (
          <div className="rounded-card border border-dashed border-border-strong px-4 py-6 text-center">
            <p className="text-[13px] text-ink-muted">今天还没有计划。</p>
            <Link
              to="/agent"
              className="mt-2 inline-flex items-center gap-1 text-[13px] font-medium text-primary hover:underline"
            >
              让 Zeno 帮我安排
              <ArrowRight className="size-3.5" />
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
            {todos.map((todo, index) => {
              const done = todo.done ?? todo.completed ?? false
              return (
                <li key={todo.id || `todo-${index}`} className="flex items-center gap-3 px-3.5 py-2.5">
                  <button
                    type="button"
                    onClick={() => todo.id && toggleTodo(todo.id)}
                    aria-label={done ? '标记为未完成' : '标记为完成'}
                    className="text-ink-faint transition-colors hover:text-primary"
                  >
                    {done ? (
                      <CheckCircle2 className="size-4.5 text-primary" />
                    ) : (
                      <Circle className="size-4.5" />
                    )}
                  </button>
                  <span className={cn('flex-1 text-[13.5px]', done ? 'text-ink-faint line-through' : 'text-ink')}>
                    {todo.text || '未命名任务'}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {recommendation ? (
        <section className="flex items-start gap-3 rounded-card border border-primary/25 bg-primary-muted p-4">
          <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">
              Zeno Recommendation
            </p>
            <p className="mt-1 text-[13.5px] leading-5 text-ink">{recommendation}</p>
          </div>
          <Link
            to={`/agent?q=${encodeURIComponent('帮我展开这个学习建议：')}${encodeURIComponent(recommendation)}`}
            className="shrink-0 text-[13px] font-medium text-primary hover:underline"
          >
            问 Zeno
          </Link>
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-ink">Recent Activity</h2>
        {recent.length === 0 ? (
          <p className="rounded-card border border-dashed border-border-strong px-4 py-5 text-center text-[13px] text-ink-muted">
            还没有学习记录，从下方快速记录开始。
          </p>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
            {recent.map((item) => {
              const Icon = item.icon
              return (
                <li key={item.id} className="flex items-center gap-3 px-3.5 py-2.5">
                  <span className="grid size-7 place-items-center rounded-control bg-surface-muted text-ink-muted">
                    <Icon className="size-3.5" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{item.title}</span>
                  <span className="shrink-0 text-xs tabular-nums text-ink-muted">{item.detail}</span>
                  <span className="hidden w-16 shrink-0 text-right text-xs tabular-nums text-ink-faint sm:block">
                    {item.date.slice(5)}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="space-y-2.5">
        <p className="flex items-center gap-1.5 text-xs font-medium text-ink-muted">
          <Flame className="size-3.5" />
          记录会同步到你的账户数据中
        </p>
        <QuickLogBar />
      </section>
    </div>
  )
}
