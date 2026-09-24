import { cn } from '@/lib/utils'

type ProgressProps = {
  value: number
  className?: string
  indicatorClassName?: string
}

export function Progress({ value, className, indicatorClassName }: ProgressProps) {
  const bounded = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0))
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(bounded)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn(
        'h-1.5 w-full overflow-hidden rounded-full bg-surface-muted',
        className,
      )}
    >
      <div
        className={cn(
          'h-full rounded-full bg-primary transition-[width] duration-200',
          indicatorClassName,
        )}
        style={{ width: `${bounded}%` }}
      />
    </div>
  )
}
