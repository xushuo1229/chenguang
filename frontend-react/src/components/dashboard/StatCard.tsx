import { motion } from 'framer-motion'
import type { LucideIcon } from 'lucide-react'
import { Card } from '@/components/ui/card'

type StatCardProps = {
  icon: LucideIcon
  label: string
  value: string | number
  hint: string
  tone?: 'primary' | 'secondary' | 'success' | 'warning'
}

const toneMap = {
  primary: 'bg-primary/10 text-primary',
  secondary: 'bg-secondary/10 text-secondary',
  success: 'bg-emerald-50 text-emerald-600',
  warning: 'bg-amber-50 text-amber-600',
}

export function StatCard({ icon: Icon, label, value, hint, tone = 'primary' }: StatCardProps) {
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
      <Card className="h-full">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm text-muted">{label}</p>
            <p className="mt-2 text-3xl font-bold tracking-tight text-ink">{value}</p>
            <p className="mt-2 text-xs text-muted">{hint}</p>
          </div>
          <span className={`grid size-10 shrink-0 place-items-center rounded-2xl ${toneMap[tone]}`}>
            <Icon className="size-5" />
          </span>
        </div>
      </Card>
    </motion.div>
  )
}
