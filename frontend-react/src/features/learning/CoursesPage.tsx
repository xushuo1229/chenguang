import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { useSnapshot } from '@/features/snapshot/useSnapshot'
import { ImportCourseDialog } from '@/features/knowledge/ImportCourseDialog'
import { useNavigate } from 'react-router-dom'
import type { CourseRecord, CourseSlot } from '@/services/analyticsService'

const weekdayLabel = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

function slotSummary(slots: CourseSlot[] | undefined): string {
  if (!slots?.length) return '—'
  return slots
    .slice(0, 2)
    .map((slot) => {
      const day = typeof slot.weekday === 'number' ? weekdayLabel[slot.weekday - 1] : ''
      const periods = slot.periods?.length
        ? slot.periods.join('/')
        : typeof slot.period === 'number'
          ? slot.period
          : ''
      return `${day} 第${periods}节`.trim()
    })
    .join('，')
}

export default function CoursesPage() {
  const snapshotQuery = useSnapshot()
  const navigate = useNavigate()
  const [importOpen, setImportOpen] = useState(false)

  if (snapshotQuery.isPending) {
    return (
      <div className="space-y-3">
        <div className="h-9 w-full animate-pulse rounded-card bg-surface-muted" />
        <div className="h-10 w-full animate-pulse rounded bg-surface-muted" />
        <div className="h-10 w-full animate-pulse rounded bg-surface-muted" />
      </div>
    )
  }

  if (snapshotQuery.isError) {
    return (
      <div className="rounded-card border border-danger/30 bg-danger-muted p-6">
        <p className="text-sm font-medium text-danger">无法加载你的课程。</p>
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

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-ink">Courses</h1>
          <p className="mt-0.5 text-[13px] text-ink-muted">
            {courses.length ? `共 ${courses.length} 门课程` : '从教务 URL 导入，或手动添加课程。'}
          </p>
        </div>
        <Button size="sm" onClick={() => setImportOpen(true)}>
          <Plus className="size-4" />
          添加课程
        </Button>
      </div>

      {courses.length === 0 ? (
        <div className="rounded-card border border-dashed border-border-strong px-6 py-12 text-center">
          <p className="text-sm font-medium text-ink">还没有课程</p>
          <p className="mx-auto mt-1 max-w-xs text-[13px] leading-5 text-ink-muted">
            导入教务 URL，Zeno 会解析课程与上课时间；无法导入时可以手动建课。
          </p>
          <Button size="sm" variant="secondary" className="mt-4" onClick={() => setImportOpen(true)}>
            <Plus className="size-4" />
            添加第一门课
          </Button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-card border border-line bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-surface-muted/60 text-left text-xs text-ink-muted">
                <th className="px-4 py-2.5 font-medium">Course</th>
                <th className="w-[200px] px-4 py-2.5 font-medium">Progress</th>
                <th className="hidden w-[220px] px-4 py-2.5 font-medium md:table-cell">Schedule</th>
                <th className="w-24 px-4 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {courses.map((course: CourseRecord, index: number) => {
                const id = course.id || `idx-${index}`
                const progressValue = Math.min(100, Math.round(Number(course.progress) || 0))
                return (
                  <tr
                    key={id}
                    onClick={() => navigate(`/learning/courses/${id}`)}
                    className="cursor-pointer transition-colors hover:bg-surface-muted/50"
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-ink">{course.name || '未命名课程'}</p>
                      {course.credits ? (
                        <p className="mt-0.5 text-xs text-ink-faint">{course.credits} 学分</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <Progress value={progressValue} className="w-24" />
                        <span className="text-xs tabular-nums text-ink-muted">{progressValue}%</span>
                      </div>
                    </td>
                    <td className="hidden px-4 py-3 text-[13px] text-ink-muted md:table-cell">
                      {slotSummary(course.slots ?? course.schedule)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-ink-muted">{course.status || '进行中'}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <ImportCourseDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={(courseId) => navigate(`/learning/courses/${courseId}`)}
      />
    </div>
  )
}
