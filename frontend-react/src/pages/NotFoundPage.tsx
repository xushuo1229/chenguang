import { Link } from 'react-router-dom'
import { Compass } from 'lucide-react'

export default function NotFoundPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface p-6">
      <div className="w-full max-w-md rounded-card border border-line bg-surface p-8 text-center">
        <p className="text-5xl font-semibold tabular-nums text-ink">404</p>
        <h1 className="mt-3 text-base font-semibold text-ink">
          页面不存在
        </h1>
        <p className="mt-2 flex items-center justify-center gap-1.5 text-[13px] text-ink-muted">
          <Compass className="size-4" />
          你访问的地址可能已被移动或删除。
        </p>
        <Link
          to="/dashboard"
          className="mt-5 inline-flex h-9 items-center rounded-control bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          返回 Dashboard
        </Link>
      </div>
    </div>
  )
}