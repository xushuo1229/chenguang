import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import type { DashboardMetric } from '@/services/dashboardService'
import { cn } from '@/lib/utils'

export function KpiCard({ metric }: { metric: DashboardMetric }) {
  const up = metric.trend === 'up'
  return (
    <div className="rounded-card border border-line bg-surface p-4 transition-colors hover:border-border-strong">
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-ink-muted">{metric.label}</p>
        {metric.delta ? (
          <span
            className={cn(
              'flex items-center gap-0.5 text-xs font-medium tabular-nums',
              up ? 'text-success' : 'text-danger',
            )}
          >
            {up ? (
              <ArrowUpRight className="size-3.5" />
            ) : (
              <ArrowDownRight className="size-3.5" />
            )}
            {metric.delta}
          </span>
        ) : null}
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-ink tabular-nums">
        {metric.value}
      </p>
      <p className="mt-1 text-xs text-ink-faint">{metric.hint}</p>
    </div>
  )
}
