import { useMemo, useState } from 'react'
import { AreaChart } from '@tremor/react'
import {
  ArrowDownRight,
  ArrowUpRight,
  Minus,
  PencilLine,
  RefreshCw,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ErrorState, LoadingState } from '@/components/ui/state'
import { KpiCard } from '@/components/dashboard/KpiCard'
import { useSnapshot } from '@/features/snapshot/useSnapshot'
import { dateOffset, todayKey } from '@/features/analytics/cgDate'
import {
  buildPeriodComparison,
  buildRangeSummary,
  buildStudySeries,
  getActivityMap,
  getStreaks,
} from '@/features/analytics/analyticsMetrics'
import { ActivityHeatmap } from '@/features/analytics/ActivityHeatmap'
import { RangeSelector } from '@/features/analytics/RangeSelector'

type RangeMode = number | 'custom'

export default function AnalyticsPage() {
  const snapshotQuery = useSnapshot()
  const [mode, setMode] = useState<RangeMode>(30)
  const [customRange, setCustomRange] = useState<[string, string] | null>(
    null,
  )
  const navigate = useNavigate()

  const data = snapshotQuery.data?.data
  const today = todayKey()
  const range = useMemo<[string, string]>(() => {
    if (mode === 'custom' && customRange) return customRange
    const days = typeof mode === 'number' ? mode : 30
    return [dateOffset(today, -(days - 1)), today]
  }, [mode, customRange, today])

  const derived = useMemo(() => {
    if (!data) return null
    const [start, end] = range
    return {
      summary: buildRangeSummary(data, start, end),
      series: buildStudySeries(data, start, end),
      comparison: buildPeriodComparison(data, start, end),
      streaks: getStreaks(data, today),
      activityMap: getActivityMap(data, today),
    }
  }, [data, range, today])

  if (snapshotQuery.isPending) {
    return <LoadingState text="正在加载成长分析..." className="mt-10" />
  }
  if (snapshotQuery.isError || !derived) {
    return (
      <ErrorState
        text="成长分析加载失败，请稍后重试。"
        className="mt-10"
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

  const { summary, series, comparison, streaks, activityMap } = derived
  const dailyAverage = Math.round(summary.totalLearningMinutes / summary.days)
  const noActivity =
    summary.totalLearningMinutes === 0 &&
    summary.activeDays === 0 &&
    streaks.currentStreak === 0 &&
    (data?.todos?.length ?? 0) === 0

  const metrics = [
    {
      id: 'learning',
      label: '总学习时长',
      value: summary.totalLearningMinutes,
      hint: '专注 + 阅读 + 英语 · 分钟',
      tone: 'primary' as const,
    },
    {
      id: 'active',
      label: '有效学习日',
      value: summary.activeDays,
      hint: `共 ${summary.days} 天`,
      tone: 'secondary' as const,
    },
    {
      id: 'average',
      label: '日均学习',
      value: dailyAverage,
      hint: '分钟 / 天',
      tone: 'secondary' as const,
    },
    {
      id: 'todo',
      label: '待办完成率',
      value: `${summary.todoCompletionRate}%`,
      hint: `${summary.todoDone}/${summary.todoTotal} 已完成`,
      tone: 'success' as const,
    },
    {
      id: 'streak',
      label: '连续打卡',
      value: streaks.currentStreak,
      hint: `最长 ${streaks.longestStreak} 天`,
      tone: 'warning' as const,
    },
  ]

  const chartData = series.map((point) => ({
    date: point.date.slice(5),
    专注: point.focus,
    阅读: point.reading,
    英语: point.english,
  }))

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Zeno Analytics"
        title="成长分析"
        description={`${range[0]} 至 ${range[1]} · 数据只读，口径与统一 Analytics 引擎一致。`}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => void snapshotQuery.refetch()}
          >
            <RefreshCw />
            刷新
          </Button>
        }
      />

      <RangeSelector
        active={mode}
        start={range[0]}
        end={range[1]}
        onPreset={(days) => {
          setMode(days)
          setCustomRange(null)
        }}
        onCustom={(start, end) => {
          setCustomRange([start, end])
          setMode('custom')
        }}
      />

      {noActivity ? (
        <Card className="flex flex-col gap-3 border-primary/30 bg-primary-muted/40 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-ink">
              当前周期还没有真实记录
            </h3>
            <p className="mt-1 text-[13px] leading-5 text-ink-secondary">
              下方所有数字均为 0，来自真实数据计算而非示例。记录一次专注或打卡后，
              这里会立即更新。
            </p>
          </div>
          <Button
            size="sm"
            className="shrink-0"
            onClick={() => navigate('/dashboard')}
          >
            <PencilLine />
            去记录
          </Button>
        </Card>
      ) : null}

      <section className="grid grid-cols-2 gap-3 xl:grid-cols-5">
        {metrics.map((metric) => (
          <KpiCard key={metric.id} metric={metric} />
        ))}
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-ink">学习时长趋势</h3>
            <p className="text-[13px] text-ink-muted">分钟 / 天</p>
          </div>
          <AreaChart
            data={chartData}
            index="date"
            categories={['专注', '阅读', '英语']}
            colors={['blue', 'emerald', 'amber']}
            valueFormatter={(value) => `${value}m`}
            showLegend
            showGridLines
            className="h-72"
            curveType="monotone"
          />
        </Card>

        <Card>
          <div className="mb-3 flex items-center gap-2">
            <h3 className="text-sm font-semibold text-ink">周期对比</h3>
          </div>
          <p className="text-[13px] text-ink-muted">
            本周期与上一等长周期对比
          </p>
          {comparison.length === 0 ? (
            <p className="mt-4 rounded-control border border-dashed border-line p-3 text-[13px] text-ink-muted">
              再积累一个周期的数据后，这里会显示确定性变化解读。
            </p>
          ) : (
            <ul className="mt-3 space-y-2.5">
              {comparison.map((item) => (
                <li
                  key={item.id}
                  className="flex items-start gap-2 rounded-control border border-line p-3"
                >
                  {item.direction === 'up' ? (
                    <ArrowUpRight className="mt-0.5 size-4 shrink-0 text-success" />
                  ) : item.direction === 'down' ? (
                    <ArrowDownRight className="mt-0.5 size-4 shrink-0 text-danger" />
                  ) : (
                    <Minus className="mt-0.5 size-4 shrink-0 text-ink-faint" />
                  )}
                  <span className="text-[13px] leading-5 text-ink">
                    {item.text}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      <Card>
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-ink">习惯活跃热力图</h3>
          <p className="text-[13px] text-ink-muted">
            近 18 周 · 颜色越深表示当天覆盖的成长行为类别越多
          </p>
        </div>
        <ActivityHeatmap points={activityMap} today={today} />
      </Card>
    </div>
  )
}
