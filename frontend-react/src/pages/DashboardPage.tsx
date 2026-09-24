import { useQuery } from '@tanstack/react-query'
import { BookOpen, BrainCircuit, Circle, CircleCheck, Clock, Flame, ListChecks, Sparkles } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { MetricTile } from '@/components/ui/MetricTile'
import { Progress } from '@/components/ui/progress'
import { ErrorState, LoadingState } from '@/components/ui/state'
import { TrendChart } from '@/components/dashboard/TrendChart'
import { getDashboardOverview } from '@/services/dashboardService'
import { cn } from '@/lib/utils'

const iconMap = {
  tasks: ListChecks,
  focus: Clock,
  streak: Flame,
  knowledge: BookOpen,
}

export default function DashboardPage() {
  const overviewQuery = useQuery({ queryKey: ['zeno', 'dashboard'], queryFn: getDashboardOverview })

  if (overviewQuery.isPending) {
    return <LoadingState text="正在加载 Zeno 工作台..." className="mt-6" />
  }

  if (overviewQuery.isError) {
    return <ErrorState text="工作台暂时不可用，请稍后刷新。" className="mt-6" />
  }

  const overview = overviewQuery.data
  const completed = overview.tasks.filter((task) => task.completed).length
  const taskRate = Math.round((completed / overview.tasks.length) * 100)

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Zeno Workspace"
        title="今日成长概览"
        description="架构阶段使用 mock 数据，不访问后端；未来切换真实 API 时页面结构不变。"
      />

      <section className="surface-card relative overflow-hidden p-7">
        <div className="absolute -right-10 -top-10 size-44 rounded-full bg-gradient-to-br from-primary/25 to-secondary/10 blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-5">
          <div>
            <Badge tone="primary" className="mb-3">
              <Sparkles className="size-3" />
              Growth Index
            </Badge>
            <p className="text-5xl font-bold tracking-tight text-ink">{overview.growthIndex}</p>
            <p className="mt-2 max-w-md text-sm text-muted">{overview.summary}</p>
          </div>
          <div className="grid w-full max-w-md grid-cols-3 gap-3">
            {[
              ['任务', overview.tasksDone, ''],
              ['专注', overview.focusToday, 'm'],
              ['连续', overview.streak, 'd'],
            ].map(([label, value, suffix]) => (
              <div key={label} className="rounded-2xl border border-line bg-white/72 p-3 text-center">
                <p className="text-xs text-muted">{label}</p>
                <p className="mt-1 text-lg font-semibold text-ink">
                  {value}
                  <span className="text-xs text-muted">{suffix}</span>
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {overview.metrics.map((metric) => {
          const Icon = iconMap[metric.id as keyof typeof iconMap] ?? ListChecks
          return (
            <MetricTile
              key={metric.id}
              icon={Icon}
              label={metric.label}
              value={metric.value}
              hint={metric.hint}
              tone={metric.tone}
            />
          )
        })}
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.35fr_.65fr]">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Learning Trend</CardTitle>
              <CardDescription>最近 14 天学习分钟数（focus + reading + english）</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <TrendChart points={overview.trend} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Today Plan</CardTitle>
              <CardDescription>
                已完成 {completed} / {overview.tasks.length}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <Progress value={taskRate} />
            <ul className="space-y-2">
              {overview.tasks.map((task) => (
                <li key={task.id} className="flex items-start gap-2 rounded-xl bg-slate-50/80 p-3">
                  {task.completed ? (
                    <CircleCheck className="mt-0.5 size-4 shrink-0 text-emerald-500" />
                  ) : (
                    <Circle className="mt-0.5 size-4 shrink-0 text-slate-300" />
                  )}
                  <span className="min-w-0">
                    <span className={cn('block text-sm', task.completed ? 'text-muted line-through' : 'text-ink')}>
                      {task.title}
                    </span>
                    <span className="text-xs text-muted">
                      {task.kind} · {task.minutes} 分钟
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </section>

      <section>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
          <BrainCircuit className="size-4 text-primary" />
          Deterministic Insights
        </h2>
        <div className="grid gap-3 md:grid-cols-3">
          {overview.insights.map((insight, index) => (
            <article key={index} className="surface-card p-4">
              <p className="text-sm text-ink">{insight.title}</p>
              {typeof insight.confidence === 'number' ? (
                <p className="mt-2 text-xs text-muted">confidence {Math.round(insight.confidence * 100)}%</p>
              ) : null}
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
