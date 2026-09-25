import type { DashboardMetric } from '@/services/dashboardService'

export function KpiCard({ metric }: { metric: DashboardMetric }) {
  return (
    <div className="rounded-card border border-line bg-surface p-4 transition-colors hover:border-border-strong">
      <p className="text-[13px] text-ink-muted">{metric.label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-ink tabular-nums">
        {metric.value}
      </p>
      <p className="mt-1 text-xs text-ink-faint">{metric.hint}</p>
    </div>
  )
}
