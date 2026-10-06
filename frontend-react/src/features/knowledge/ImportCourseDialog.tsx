import { useState, type FormEvent } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Loader2, Upload, ArrowLeft, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { importCoursesFromUrl } from '@/services/courseService'
import type { ParsedCourse } from '@/services/courseService'
import { useUpdateSnapshot } from '@/features/snapshot/useSnapshot'

type Mode = 'url' | 'manual'

const weekdayLabel = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

const inputClass =
  'h-[var(--control-h)] min-w-0 flex-1 rounded-control border border-line bg-surface px-3 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-primary'

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
    if (!preview || preview.length === 0 || updateSnapshot.isPending) return
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
          toast.success(`已导入 ${created.length} 门课程`)
          const firstId = created[0].id
          close()
          onImported(firstId)
        },
        onError: (submitError) =>
          toast.error(
            submitError instanceof Error ? submitError.message : '导入失败',
          ),
      },
    )
  }

  const handleManualCreate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const name = courseName.trim()
    if (!name || updateSnapshot.isPending) return
    const created = { id: `course-${Date.now()}`, name }
    updateSnapshot.mutate(
      (draft) => ({
        ...draft,
        courses: [...(draft.courses ?? []), created],
      }),
      {
        onSuccess: () => {
          toast.success('课程已创建，可在文档页上传资料构建图谱')
          close()
          onImported(created.id)
        },
        onError: (submitError) =>
          toast.error(
            submitError instanceof Error ? submitError.message : '创建失败',
          ),
      },
    )
  }

  const tabButton = (id: Mode, label: string) => (
    <button
      key={id}
      type="button"
      onClick={() => {
        setMode(id)
        previewMutation.reset()
      }}
      className={`flex-1 rounded-[5px] px-3 py-1.5 text-[13px] transition-colors ${
        mode === id
          ? 'bg-primary text-primary-foreground'
          : 'text-ink-muted hover:text-ink'
      }`}
    >
      {label}
    </button>
  )

  return (
    <Dialog open={open} onOpenChange={(value) => !value && close()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="grid size-7 place-items-center rounded-control bg-primary-muted text-primary">
              <Upload className="size-4" />
            </span>
            导入课程
          </DialogTitle>
          <DialogDescription>
            课程是知识库的载体，先有课程才能构建图谱。
          </DialogDescription>
        </DialogHeader>

        <div className="flex rounded-control border border-line p-0.5">
          {tabButton('url', '教务链接导入')}
          {tabButton('manual', '手动建课')}
        </div>

        {mode === 'url' ? (
          <div>
            <form className="flex gap-2" onSubmit={handlePreview}>
              <input
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="粘贴可公开访问的课表页面链接"
                className={inputClass}
                autoFocus
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
              <div className="mt-3 rounded-card border border-warning/30 bg-surface-subtle p-3">
                <p className="flex items-start gap-2 text-[13px] leading-5 text-ink">
                  <AlertCircle className="mt-0.5 size-4 shrink-0 text-warning" />
                  {previewMutation.error instanceof Error
                    ? previewMutation.error.message
                    : '解析失败，请确认链接可公开访问。'}
                </p>
                <p className="mt-2 pl-6 text-xs leading-5 text-ink-muted">
                  多数教务系统需要登录，后端无法代为抓取。可以直接手动建课，
                  之后上传文档同样能构建知识图谱。
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setMode('manual')
                    previewMutation.reset()
                  }}
                  className="ml-6 mt-2 inline-flex items-center gap-1.5 text-[13px] font-medium text-primary hover:underline"
                >
                  <ArrowLeft className="size-3.5" />
                  改用手动建课
                </button>
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
                    {updateSnapshot.isPending ? (
                      <Loader2 className="animate-spin" />
                    ) : null}
                    确认导入
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <form className="space-y-3" onSubmit={handleManualCreate}>
            <input
              value={courseName}
              onChange={(event) => setCourseName(event.target.value)}
              placeholder="输入课程名称，如：高等数学"
              className="h-[var(--control-h)] w-full rounded-control border border-line bg-surface px-3 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-primary"
              autoFocus
            />
            <p className="text-xs leading-5 text-ink-muted">
              手动建课不依赖教务系统；创建后在「文档」页上传讲义或笔记，
              经你审核后生成知识图谱。
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={close}>
                取消
              </Button>
              <Button
                size="sm"
                type="submit"
                disabled={updateSnapshot.isPending}
              >
                {updateSnapshot.isPending ? (
                  <Loader2 className="animate-spin" />
                ) : null}
                创建课程
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}