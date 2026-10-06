import { Check } from 'lucide-react'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

const stages = [
  'Recent activity',
  'Course progress',
  'Goals',
  'Focus history',
]

export function ThinkingChecklist() {
  const [visible, setVisible] = useState(1)

  useEffect(() => {
    const timer = window.setInterval(() => {
      setVisible((value) => Math.min(value + 1, stages.length))
    }, 650)
    return () => window.clearInterval(timer)
  }, [])

  return (
    <div className="rounded-card border border-line bg-surface-subtle p-3.5">
      <p className="text-[13px] font-medium text-ink">
        Analyzing your learning data…
      </p>
      <ul className="mt-2.5 space-y-1.5">
        {stages.map((stage, index) => {
          const done = index < visible
          return (
            <li
              key={stage}
              className={cn(
                'flex items-center gap-2 text-xs transition-colors',
                done ? 'text-ink-secondary' : 'text-ink-faint',
              )}
            >
              <span
                className={cn(
                  'grid size-4 place-items-center rounded-full',
                  done ? 'bg-success-muted text-success' : 'border border-line',
                )}
              >
                {done ? <Check className="size-2.5" /> : null}
              </span>
              {stage}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
