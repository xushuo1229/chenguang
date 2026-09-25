import { useState, type FormEvent } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Loader2, Upload } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ErrorState } from '@/components/ui/state'
import { importCoursesFromUrl } from '@/services/courseService'
import type { ParsedCourse } from '@/services/courseService'
import { useUpdateSnapshot } from '@/features/snapshot/useSnapshot'

type Mode = 'url' | 'manual'

const weekdayLabel = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

export function ImportCourseDialog({
  open,
  onClose,
  onImported,
}: {
  open: boolean
  onClose: () => void
  onImported: (courseId: string) => void
}) {
  const [mode, setMode] = useState<Mode>('url')
  const [url, setUrl] = useState('')
  const [courseName, setCourseName] = useState('')
  const [preview, setPreview] = useState<ParsedCourse[] | null>(null)
  const updateSnapshot = useUpdateSnapshot()

  const previewMutation = useMutation({
    mutationFn: () => importCoursesFromUrl(url.trim()),
    onSuccess: (result) => setPreview(result.courses),
  })

  if (!open) return null

  const reset = () => {
    setUrl('')
    setCourseName('')
    setPreview(null)
    previewMutation.reset()
  }

  const close = () => {
    reset()
    onClose()
  }

  const handlePreview = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (url.trim()) previewMutation.mutate()
  }

  const confirmParsed = () => {
    if (!preview || preview.length === 0) return
    const created = preview.map((course, index) => ({
      id: `course-${Date.now()}-${index}`,
      name: course.name,
      slots: course.slots,
    }))
    updateSnapshot.mutate(
      (draft) => ({
        ...draft,
        courses: [...(draft.courses ?? []), ...created],
      }),
      {
        onSuccess: () => {
          onImported(created[0].id)
          close()
        },
      },
    )
  }

  const handleManualCreate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const name = courseName.trim()
    if (!name) return
    const created = { id: `course-${Date.now()}`, name }
    updateSnapshot.mutate(
      (draft) => ({
        ...draft,
        courses: [...(draft.courses ?? []), created],
      }),
      {
        onSuccess: () => {
          onImported(created.id)
          close()
        },
      },
    )
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <button
        type="button"
        aria-label="关闭导入窗口"
        className="absolute inset-0 bg-black/30"
        onClick={close}
      />
      <div className="relative w-full max-w-lg rounded-card border border-line bg-surface p-6">
        <div className="flex items-center gap-2">
          <span className="grid size-8 place-items-center rounded-control bg-primary-muted text-primary">
            <Upload className="size-4" />
          </span>
          <div>
            <h2 className="text-base font-semibold text-ink">导入课程</h2>
            <p className="text-xs text-ink-muted">
              课程是知识库的载体，先有课程才能构建图谱
            </p>
          </div>
        </div>

        <div className="mt-4 flex rounded-control border border-line p-0.5">
          <button
            type="button"
            onClick={() => setMode('url')}
            className={`flex-1 rounded-[5px] px-3 py-1.5 text-[13px] ${mode === 'url' ? 'bg-surface-muted text-ink' : 'text-ink-muted'}`}
          >
            教务链接导入
          </button>
          <button
            type="button"
            onClick={() => setMode('manual')}
            className={`flex-1 rounded-[5px] px-3 py-1.5 text-[13px] ${mode === 'manual' ? 'bg-surface-muted text-ink' : 'text-ink-muted'}`}
          >
            手动建课
          </button>
        </div>

        {mode === 'url' ? (
          <div className="mt-4">
            <form className="flex gap-2" onSubmit={handlePreview}>
              <input
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="粘贴教务系统课表页面链接"
                className="h-9 min-w-0 flex-1 rounded-control border border-line bg-surface px-3 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-primary"
              />
              <Button
                type="submit"
                size="sm"
                disabled={previewMutation.isPending}
              >
                {previewMutation.isPending ? (
                  <Loader2 className="animate-spin" />
                ) : null}
                解析
              </Button>
            </form>

            {previewMutation.isError ? (
              <div className="mt-3">
                <ErrorState
                  title="解析失败"
                  text={
                    previewMutation.error instanceof Error
                      ? previewMutation.error.message
                      : '请确认链接可公开访问'
                  }
                />
              </div>
            ) : null}

            {preview ? (
              <div className="mt-4 space-y-2">
                <p className="text-[13px] text-ink-muted">
                  解析到 {preview.length} 门课程，确认后合并入库：
                </p>
                {preview.map((course) => (
                  <div
                    key={course.name}
                    className="rounded-control border border-line p-3"
                  >
                    <p className="text-[13px] font-medium text-ink">
                      {course.name}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {course.slots.map((slot, index) => (
                        <Badge key={index} tone="neutral">
                          {weekdayLabel[slot.weekday] ?? '?'} · 第
                          {slot.period}节
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
                <div className="flex justify-end gap-2 pt-1">
                  <Button variant="ghost" size="sm" onClick={close}>
                    取消
                  </Button>
                  <Button
                    size="sm"
                    onClick={confirmParsed}
                    disabled={updateSnapshot.isPending}
                  >
                    确认导入
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <form className="mt-4 space-y-3" onSubmit={handleManualCreate}>
            <input
              value={courseName}
              onChange={(event) => setCourseName(event.target.value)}
              placeholder="输入课程名称，如：高等数学"
              className="h-9 w-full rounded-control border border-line bg-surface px-3 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-primary"
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={close}>
                取消
              </Button>
              <Button
                size="sm"
                type="submit"
                disabled={updateSnapshot.isPending}
              >
                创建课程
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
