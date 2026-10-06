import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Clock, MapPin } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { useSnapshot } from '@/features/snapshot/useSnapshot'
import type { CourseSlot } from '@/services/analyticsService'
import { cn } from '@/lib/utils'

const weekdayLabel = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

type TabId = 'overview' | 'knowledge' | 'progress'

const tabs: Array<{ id: TabId; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'knowledge', label: 'Knowledge' },
  { id: 'progress', label: 'Progress' },
]

export default function CourseDetailPage() {
  const params = useParams<{ id: string }>()
  const key = params.id ?? ''
  const snapshotQuery = useSnapshot()
  const navigate = useNavigate()
  const [tab, setTab] = useState<TabId>('overview')

  if (snapshotQuery.isPending) {
    return <div className="h-48 w-full animate-pulse rounded-card bg-surface-muted" />
  }
  if (snapshotQuery.isError) {
    return (
      <div className="rounded-card border border-danger/30 bg-danger-muted p-6">
        <p className="text-sm font-medium text-danger">无法加载课程详情。</p>
        <button
          type="button"
          onClick={() => void snapshotQuery.refetch()}
          className="mt-3 text-[13px] font-medium text-primary hover:underline"
        >
          重试
        </button>
      </div>
    )
  }

  const courses = snapshotQuery.data.data.courses ?? []
  const index = courses.findIndex((course, index2) =>
    course.id ? course.id === key : `idx-${index2}` === key,
  )
  if (index < 0) {
    return (
      <div className="rounded-card border border-line bg-surface p-8 text-center">
        <p className="text-sm text-ink-muted">找不到这门课程，它可能已被删除。</p>
        <Link to="/learning/courses" className="mt-3 inline-block text-[13px] font-medium text-primary hover:underline">
          返回 Courses
        </Link>
      </div>
    )
  }

  const course = courses[index]
  const progressValue = Math.min(100, Math.round(Number(course.progress) || 0))
  const slots = course.slots ?? course.schedule ?? []
  const focusRecords = (snapshotQuery.data.data.focus ?? []).filter(
    (record) => record.task && course.name && record.task.includes(course.name),
  )
  const totalMinutes = focusRecords.reduce(
    (sum, record) => sum + (Number(record.minutes) || 0),
    0,
  )

  return (
    <div className="space-y-6">
      <Link
        to="/learning/courses"
        className="inline-flex items-center gap-1.5 text-[13px] text-ink-muted transition-colors hover:text-ink"
      >
        <ArrowLeft className="size-3.5" />
        Courses
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold tracking-tight text-ink">
            {course.name || '未命名课程'}
          </h1>
          <div className="mt-2 flex items-center gap-3 text-[13px] text-ink-muted">
            <span className="flex items-center gap-1.5">
              <Clock className="size-3.5" />
              已投入 {totalMinutes} 分钟
            </span>
            {course.location ? (
              <span className="flex items-center gap-1.5">
                <MapPin className="size-3.5" />
                {course.location}
              </span>
            ) : null}
          </div>
        </div>
        <Button onClick={() => navigate(`/learning/knowledge?tab=graph&course=${encodeURIComponent(key)}`)}>
          Continue Learning
          <ArrowRight className="size-4" />
        </Button>
      </div>

      <div className="flex items-center gap-3 rounded-card border border-line bg-surface px-4 py-3">
        <span className="text-[13px] text-ink-muted">课程进度</span>
        <Progress value={progressValue} className="w-40" />
        <span className="text-xs tabular-nums text-ink-muted">{progressValue}%</span>
      </div>

      <div className="flex gap-1 border-b border-line">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-[13px] font-medium transition-colors',
              tab === item.id
                ? 'border-primary text-ink'
                : 'border-transparent text-ink-muted hover:text-ink-secondary',
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'overview' ? (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Detail label="学分" value={course.credits ? String(course.credits) : '—'} />
            <Detail label="类型" value={course.courseType || '—'} />
            <Detail label="周次" value={course.weeks || '—'} />
          </div>
          <div>
            <h2 className="mb-2 text-sm font-semibold text-ink">上课安排</h2>
            {slots.length === 0 ? (
              <p className="rounded-card border border-dashed border-border-strong px-4 py-5 text-center text-[13px] text-ink-muted">
                暂无排课时间。
              </p>
            ) : (
              <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
                {slots.map((slot: CourseSlot, slotIndex: number) => (
                  <li key={slotIndex} className="flex items-center gap-3 px-4 py-2.5 text-[13px]">
                    <span className="w-12 text-ink-muted">
                      {typeof slot.weekday === 'number' ? weekdayLabel[slot.weekday - 1] : '—'}
                    </span>
                    <span className="text-ink-secondary">
                      第{slot.periods?.length ? slot.periods.join('/') : slot.period}节
                    </span>
                    {slot.startTime ? (
                      <span className="ml-auto text-xs tabular-nums text-ink-faint">
                        {slot.startTime}{slot.endTime ? `–${slot.endTime}` : ''}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}

      {tab === 'knowledge' ? (
        <div className="rounded-card border border-line bg-surface p-6">
          <p className="text-sm font-medium text-ink">课程知识图谱</p>
          <p className="mt-1 text-[13px] leading-5 text-ink-muted">
            为课程添加文档后，Zeno 会抽取知识点、建立掌握度与复习队列。
          </p>
          <Button
            variant="secondary"
            size="sm"
            className="mt-4"
            onClick={() => navigate(`/learning/knowledge?tab=graph&course=${encodeURIComponent(key)}`)}
          >
            打开 Knowledge
            <ArrowRight className="size-4" />
          </Button>
        </div>
      ) : null}

      {tab === 'progress' ? (
        <div>
          {focusRecords.length === 0 ? (
            <p className="rounded-card border border-dashed border-border-strong px-4 py-8 text-center text-[13px] text-ink-muted">
              还没有这门课的专注记录。
            </p>
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
              {focusRecords
                .slice()
                .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
                .slice(0, 12)
                .map((record, recordIndex) => (
                  <li key={recordIndex} className="flex items-center gap-3 px-4 py-2.5 text-[13px]">
                    <span className="text-ink">{record.task}</span>
                    <span className="ml-auto text-xs tabular-nums text-ink-muted">{record.minutes} 分钟</span>
                    <span className="w-16 text-right text-xs tabular-nums text-ink-faint">{record.date?.slice(5)}</span>
                  </li>
                ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-card border border-line bg-surface px-4 py-3">
      <p className="text-xs text-ink-faint">{label}</p>
      <p className="mt-1 text-sm font-medium text-ink">{value}</p>
    </div>
  )
}
