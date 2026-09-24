import type { LucideIcon } from 'lucide-react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

type MetricTileProps = {
  icon: LucideIcon
  label: string
  value: string | number
  hint?: string
  tone?: 'primary' | 'secondary' | 'success' | 'warning'
}

const toneMap = {
  primary: 'bg-primary/10 text-primary',
  secondary: 'bg-secondary/10 text-secondary',
  success: 'bg-emerald-50 text-emerald-600',
  warning: 'bg-amber-50 text-amber-600',
}

export function MetricTile({ icon: Icon, label, value, hint, tone = 'primary' }: MetricTileProps) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="surface-card hover-lift h-full p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted">{label}</p>
          <p className="mt-2 text-2xl font-bold tracking-tight text-ink">{value}</p>
          {hint ? <p className="mt-2 text-xs text-muted">{hint}</p> : null}
        </div>
        <span className={cn('grid size-10 shrink-0 place-items-center rounded-2xl', toneMap[tone])}>
          <Icon className="size-5" />
        </span>
      </div>
    </motion.article>
  )
}
