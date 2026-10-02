import { useState } from 'react'
import {
  BookOpen,
  Dumbbell,
  Flame,
  GraduationCap,
  Languages,
  Target,
  Timer,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import {
  QuickLogDialog,
  type QuickLogKind,
} from './QuickLogDialog'
import { GoalLogDialog } from './GoalLogDialog'
import { CourseLogDialog } from './CourseLogDialog'

type ActivePanel = QuickLogKind | 'goal' | 'course'

const actions: Array<{
  id: ActivePanel
  label: string
  icon: typeof Flame
}> = [
  { id: 'checkin', label: '打卡', icon: Flame },
  { id: 'focus', label: '专注', icon: Timer },
  { id: 'sport', label: '运动', icon: Dumbbell },
  { id: 'reading', label: '阅读', icon: BookOpen },
  { id: 'english', label: '英语', icon: Languages },
  { id: 'goal', label: '目标', icon: Target },
  { id: 'course', label: '课程', icon: GraduationCap },
]

export function QuickLogBar() {
  const [active, setActive] = useState<ActivePanel | null>(null)

  return (
    <Card className="flex flex-wrap items-center gap-1.5 p-2">
      <span className="px-2 text-[13px] font-medium text-ink-secondary">
        快速记录
      </span>
      {actions.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => setActive(id)}
          className="flex items-center gap-1.5 rounded-control px-3 py-1.5 text-[13px] text-ink-secondary transition-colors hover:bg-surface-muted hover:text-ink"
        >
          <Icon className="size-4 text-ink-muted" />
          {label}
        </button>
      ))}

      {active && active !== 'goal' && active !== 'course' ? (
        <QuickLogDialog kind={active} onClose={() => setActive(null)} />
      ) : null}
      {active === 'goal' ? (
        <GoalLogDialog onClose={() => setActive(null)} />
      ) : null}
      {active === 'course' ? (
        <CourseLogDialog onClose={() => setActive(null)} />
      ) : null}
    </Card>
  )
}
