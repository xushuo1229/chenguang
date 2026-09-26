import { useMemo } from 'react'
import { dateOffset, mondayOf } from './cgDate'
import type { ActivityPoint } from './analyticsMetrics'

function levelClass(count: number): string {
  if (count <= 0) return 'bg-black/[0.06] dark:bg-white/[0.06]'
  if (count === 1) return 'bg-primary/25'
  if (count === 2) return 'bg-primary/50'
  if (count === 3) return 'bg-primary/75'
  return 'bg-primary'
}

const MONTH_LABELS: Record<number, string> = {
  0: '1月',
  1: '2月',
  2: '3月',
  3: '4月',
  4: '5月',
  5: '6月',
  6: '7月',
  7: '8月',
  8: '9月',
  9: '10月',
  10: '11月',
  11: '12月',
}

export function ActivityHeatmap({
  points,
  weeks = 18,
  today,
}: {
  points: ActivityPoint[]
  weeks?: number
  today: string
}) {
  const { columns, totalActive } = useMemo(() => {
    const countByDate = new Map<string, number>()
    points.forEach((point) => countByDate.set(point.date, point.count))

    const lastMonday = mondayOf(today)
    const firstMonday = dateOffset(lastMonday, -(weeks - 1) * 7)
    const columns: Array<{
      monthLabel: string | null
      days: Array<{ key: string; count: number; future: boolean }>
    }> = []
    let active = 0
    let previousMonth = -1

    for (let column = 0; column < weeks; column++) {
      const weekStart = dateOffset(firstMonday, column * 7)
      const month = Number(weekStart.slice(5, 7)) - 1
      const monthLabel = month !== previousMonth ? MONTH_LABELS[month] : null
      previousMonth = month
      const days = []
      for (let weekday = 0; weekday < 7; weekday++) {
        const key = dateOffset(weekStart, weekday)
        const future = key > today
        const count = future ? 0 : countByDate.get(key) ?? 0
        if (!future && count > 0) active++
        days.push({ key, count, future })
      }
      columns.push({ monthLabel, days })
    }
    return { columns, totalActive: active }
  }, [points, weeks, today])

  return (
    <div>
      <div className="flex gap-[3px] overflow-x-auto pb-1">
        {columns.map((column, columnIndex) => (
          <div key={columnIndex} className="flex flex-col gap-[3px]">
            <span className="h-3.5 text-[10px] leading-3.5 text-ink-faint">
              {column.monthLabel}
            </span>
            {column.days.map((day, weekday) => (
              <div
                key={weekday}
                title={
                  day.future
                    ? undefined
                    : `${day.key} · ${day.count} 类活动`
                }
                className={`size-[11px] rounded-[2px] ${
                  day.future
                    ? 'bg-transparent'
                    : levelClass(day.count)
                }`}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-3 text-[11px] text-ink-faint">
        <span>{totalActive} 个活跃日</span>
        <span className="flex items-center gap-1">
          少
          <span className="size-[10px] rounded-[2px] bg-black/[0.06] dark:bg-white/[0.06]" />
          <span className="size-[10px] rounded-[2px] bg-primary/25" />
          <span className="size-[10px] rounded-[2px] bg-primary/50" />
          <span className="size-[10px] rounded-[2px] bg-primary/75" />
          <span className="size-[10px] rounded-[2px] bg-primary" />
          多
        </span>
      </div>
    </div>
  )
}
