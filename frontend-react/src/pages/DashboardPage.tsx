import { useMemo, useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AreaChart,
  DonutChart,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '@tremor/react'
import { BrainCircuit, ListChecks, Plus, RefreshCw } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState, ErrorState } from '@/components/ui/state'
import { KpiCard } from '@/components/dashboard/KpiCard'
import { DashboardSkeleton } from '@/components/dashboard/DashboardSkeleton'
import { buildDashboardOverview } from '@/services/dashboardService'
import type { DashboardTask } from '@/services/dashboardService'
import { getAgentContext } from '@/services/agentService'
import {
  useSnapshot,
  useUpdateSnapshot,
} from '@/features/snapshot/useSnapshot'

const kindTone: Record<string, 'neutral' | 'info' | 'warning' | 'success'> = {
  architecture: 'neutral',
  ui: 'info',
  docs: 'warning',
  english: 'success',
  normal: 'neutral',
}

const kindLabel: Record<string, string> = {
  architecture: '架构',
  ui: '界面',
  docs: '文档',
  english: '英语',
  normal: '普通',
}

function todayKey(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export default function DashboardPage() {
  const snapshotQuery = useSnapshot()
  const contextQuery = useQuery({
    queryKey: ['zeno', 'agent-context'],
    queryFn: getAgentContext,
  })
  const updateSnapshot = useUpdateSnapshot()
  const [newTask, setNewTask] = useState('')

  const overview = useMemo(
    () =>
      buildDashboardOverview(
        snapshotQuery.data,
        contextQuery.data,
      ),
    [snapshotQuery.data, contextQuery.data],
  )

  if (snapshotQuery.isPending || contextQuery.isPending) {
    return <DashboardSkeleton />
  }
  if (snapshotQuery.isError) {
    return (
      <ErrorState
        text="工作台数据加载失败，请检查网络后重试。"
        className="mt-6"
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={() => void snapshotQuery.refetch()}
          >
            <RefreshCw />
            重试
          </Button>
        }
      />
    )
  }

  const refresh = () => {
    void snapshotQuery.refetch()
    void contextQuery.refetch()
  }

  const toggleTask = (task: DashboardTask) => {
    const today = todayKey()
    updateSnapshot.mutate((draft) => ({
      ...draft,
      todos: (draft.todos ?? []).map((todo) =>
        todo.id === task.id && todo.date === today
          ? { ...todo, done: !task.completed }
          : todo,
      ),
    }))
  }

  const handleAddTask = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const text = newTask.trim()
    if (!text || updateSnapshot.isPending) return
    const today = todayKey()
    updateSnapshot.mutate(
      (draft) => ({
        ...draft,
        todos: [
          ...(draft.todos ?? []),
          {
            id: `todo-${Date.now()}`,
            text,
            date: today,
            done: false,
            priority: 'normal',
          },
        ],
      }),
      { onSuccess: () => setNewTask('') },
    )
  }

  const chartData = overview.chart.map((point) => ({
    date: point.date,
    专注: point.focus,
    阅读: point.reading,
    英语: point.english,
  }))
  const knowledgeData = [
    { name: '已掌握', value: overview.knowledge.strong },
    { name: '薄弱', value: overview.knowledge.weak },
  ]
  const completed = overview.tasks.filter((task) => task.completed).length

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Zeno Workspace"
        title="今日成长概览"
        description={overview.summary}
        actions={
          <Button variant="outline" size="sm" onClick={refresh}>
            <RefreshCw />
            刷新
          </Button>
        }
      />

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {overview.metrics.map((metric) => (
          <KpiCard key={metric.id} metric={metric} />
        ))}
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-ink">学习时长趋势</h3>
            <p className="text-[13px] text-ink-muted">最近 14 天 · 分钟</p>
          </div>
          <AreaChart
            data={chartData}
            index="date"
            categories={['专注', '阅读', '英语']}
            colors={['blue', 'emerald', 'amber']}
            valueFormatter={(value) => `${value}m`}
            showLegend
            showGridLines
            curveType="monotone"
            yAxisWidth={44}
            className="h-72"
          />
        </Card>

        <Card>
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-ink">知识状态</h3>
            <p className="text-[13px] text-ink-muted">
              掌握率 {overview.knowledge.coverage}%
            </p>
          </div>
          <DonutChart
            data={knowledgeData}
            category="value"
            index="name"
            colors={['emerald', 'rose']}
            variant="donut"
            showLabel
            showTooltip
            className="h-56"
          />
        </Card>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="overflow-hidden p-0 xl:col-span-2">
          <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
            <h3 className="text-sm font-semibold text-ink">今日计划</h3>
            <span className="text-xs text-ink-muted tabular-nums">
              {completed}/{overview.tasks.length} 完成
            </span>
          </div>
          {overview.tasks.length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon={<ListChecks className="size-5" />}
                title="今日暂无计划任务"
                description="在下方添加今天的第一项任务，AI 不会虚构计划。"
              />
            </div>
          ) : (
            <Table className="text-sm">
              <TableHead>
                <TableRow className="bg-surface-muted/50">
                  <TableHeaderCell className="w-10 pl-5">状态</TableHeaderCell>
                  <TableHeaderCell>任务</TableHeaderCell>
                  <TableHeaderCell>类型</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {overview.tasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    onToggle={() => toggleTask(task)}
                  />
                ))}
              </TableBody>
            </Table>
          )}
          <form
            className="flex items-center gap-2 border-t border-line px-5 py-3"
            onSubmit={handleAddTask}
          >
            <input
              value={newTask}
              onChange={(event) => setNewTask(event.target.value)}
              placeholder="添加今日任务..."
              className="h-9 min-w-0 flex-1 rounded-control border border-line bg-surface px-3 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-primary"
            />
            <Button type="submit" size="sm" disabled={updateSnapshot.isPending}>
              <Plus />
              添加
            </Button>
          </form>
        </Card>

        <Card>
          <div className="mb-3 flex items-center gap-2">
            <BrainCircuit className="size-4 text-primary" />
            <h3 className="text-sm font-semibold text-ink">确定性洞察</h3>
          </div>
          <ul className="space-y-2.5">
            {overview.insights.length === 0 ? (
              <li className="rounded-control border border-dashed border-line p-3 text-[13px] text-ink-muted">
                接入 Agent 上下文后，这里展示确定性成长洞察。
              </li>
            ) : (
              overview.insights.map((insight, index) => (
                <li
                  key={index}
                  className="rounded-control border border-line bg-surface-subtle p-3"
                >
                  <p className="text-[13px] leading-5 text-ink">
                    {insight.title}
                  </p>
                  {typeof insight.confidence === 'number' ? (
                    <p className="mt-1 text-xs text-ink-muted tabular-nums">
                      置信度 {Math.round(insight.confidence * 100)}%
                    </p>
                  ) : null}
                </li>
              ))
            )}
          </ul>
        </Card>
      </section>
    </div>
  )
}

function TaskRow({
  task,
  onToggle,
}: {
  task: DashboardTask
  onToggle: () => void
}) {
  return (
    <TableRow className="hover:bg-surface-muted/40">
      <TableCell className="pl-5">
        <input
          type="checkbox"
          checked={task.completed}
          onChange={onToggle}
          className="size-4 accent-[var(--primary)]"
          aria-label={task.completed ? '已完成' : '未完成'}
        />
      </TableCell>
      <TableCell>
        <span
          className={
            task.completed ? 'text-ink-muted line-through' : 'text-ink'
          }
        >
          {task.title}
        </span>
      </TableCell>
      <TableCell>
        <Badge tone={kindTone[task.kind] ?? 'neutral'}>
          {kindLabel[task.kind] ?? task.kind}
        </Badge>
      </TableCell>
    </TableRow>
  )
}
