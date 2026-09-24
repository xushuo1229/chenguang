import { AlertTriangle, Inbox, Loader2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function LoadingState({
  text = '正在加载...',
  className,
}: {
  text?: string
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-control bg-surface-muted px-4 py-3 text-sm text-ink-muted',
        className,
      )}
    >
      <Loader2 className="size-4 animate-spin text-primary" />
      <span>{text}</span>
    </div>
  )
}

export function ErrorState({
  title = '出错了',
  text = '暂时无法读取数据，请稍后重试。',
  className,
  action,
}: {
  title?: string
  text?: string
  className?: string
  action?: ReactNode
}) {
  return (
    <div
      role="alert"
      className={cn(
        'flex items-start gap-3 rounded-control border border-line bg-danger-muted px-4 py-3 text-sm text-danger',
        className,
      )}
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="font-medium">{title}</p>
        <p className="mt-0.5 text-[13px] opacity-90">{text}</p>
        {action ? <div className="mt-2">{action}</div> : null}
      </div>
    </div>
  )
}

export function EmptyState({
  title,
  description,
  icon,
  action,
  className,
}: {
  title: string
  description?: string
  icon?: ReactNode
  className?: string
  action?: ReactNode
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-card border border-dashed border-line bg-surface-subtle px-6 py-10 text-center',
        className,
      )}
    >
      <span className="mb-3 grid size-10 place-items-center rounded-full bg-surface-muted text-ink-muted">
        {icon ?? <Inbox className="size-5" />}
      </span>
      <p className="text-sm font-medium text-ink">{title}</p>
      {description ? (
        <p className="mt-1 max-w-sm text-[13px] text-ink-muted">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}
