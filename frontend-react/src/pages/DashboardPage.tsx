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
import { BrainCircuit, RefreshCw } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ErrorState, LoadingState } from '@/components/ui/state'
import { KpiCard } from '@/components/dashboard/KpiCard'
import { getDashboardOverview } from '@/services/dashboardService'
import type { DashboardTask } from '@/services/dashboardService'

const kindTone: Record<string, 'neutral' | 'info' | 'warning' | 'success'> = {
  architecture: 'neutral',
  ui: 'info',
  docs: 'warning',
  english: 'success',
}

const kindLabel: Record<string, string> = {
  architecture: '架构',
  ui: '界面',
  docs: '文档',
  english: '英语',
}

export default function DashboardPage() {
  const overviewQuery = useQuery({
    queryKey: ['zeno', 'dashboard'],
    queryFn: getDashboardOverview,
  })

  if (overviewQuery.isPending) {
    return <LoadingState text="正在加载 Zeno 工作台..." className="mt-6" />
  }
  if (overviewQuery.isError) {
    return <ErrorState text="工作台暂时不可用，请稍后刷新。" className="mt-6" />
  }

  const overview = overviewQuery.data
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
  const completed = overview.tasks.filter((t) => t.completed).length

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Zeno Workspace"
        title="今日成长概览"
        description="所有数字由服务层从同步快照派生；当前为 mock 数据。"
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => void overviewQuery.refetch()}
            disabled={overviewQuery.isFetching}
          >
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
            valueFormatter={(v) => `${v}m`}
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
          <Table className="text-sm">
            <TableHead>
              <TableRow className="bg-surface-muted/50">
                <TableHeaderCell className="w-10 pl-5">状态</TableHeaderCell>
                <TableHeaderCell>任务</TableHeaderCell>
                <TableHeaderCell>类型</TableHeaderCell>
                <TableHeaderCell className="text-right pr-5">
                  时长
                </TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {overview.tasks.map((task) => (
                <TaskRow key={task.id} task={task} />
              ))}
            </TableBody>
          </Table>
        </Card>

        <Card>
          <div className="mb-3 flex items-center gap-2">
            <BrainCircuit className="size-4 text-primary" />
            <h3 className="text-sm font-semibold text-ink">确定性洞察</h3>
          </div>
          <ul className="space-y-2.5">
            {overview.insights.map((insight, i) => (
              <li
                key={i}
                className="rounded-control border border-line bg-surface-subtle p-3"
              >
                <p className="text-[13px] leading-5 text-ink">{insight.title}</p>
                {typeof insight.confidence === 'number' ? (
                  <p className="mt-1 text-xs text-ink-muted tabular-nums">
                    置信度 {Math.round(insight.confidence * 100)}%
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      </section>
    </div>
  )
}

function TaskRow({ task }: { task: DashboardTask }) {
  return (
    <TableRow className="hover:bg-surface-muted/40">
      <TableCell className="pl-5">
        <input
          type="checkbox"
          checked={task.completed}
          readOnly
          className="size-4 accent-[var(--primary)]"
          aria-label={task.completed ? '已完成' : '未完成'}
        />
      </TableCell>
      <TableCell>
        <span className={task.completed ? 'text-ink-muted line-through' : 'text-ink'}>
          {task.title}
        </span>
      </TableCell>
      <TableCell>
        <Badge tone={kindTone[task.kind] ?? 'neutral'}>
          {kindLabel[task.kind] ?? task.kind}
        </Badge>
      </TableCell>
      <TableCell className="pr-5 text-right tabular-nums text-ink-secondary">
        {task.minutes}m
      </TableCell>
    </TableRow>
  )
}
