import { useState, type FormEvent } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  useSnapshot,
  useUpdateSnapshot,
} from '@/features/snapshot/useSnapshot'

const inputClass =
  'h-9 w-full rounded-control border border-line bg-surface px-3 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-primary'

type Mode = 'progress' | 'add' | 'delete'

function newId(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return `course-${Date.now()}`
}

export function CourseLogDialog({
  onClose,
  initialMode = 'progress',
}: {
  onClose: () => void
  initialMode?: Mode
}) {
  const [mode, setMode] = useState<Mode>(initialMode)
  const snapshotQuery = useSnapshot()
  const updateSnapshot = useUpdateSnapshot()

  const courses = snapshotQuery.data?.data.courses ?? []
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [progress, setProgress] = useState('')
  const [name, setName] = useState('')

  const updateProgress = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const value = Number(progress)
    if (!(value >= 0 && value <= 100)) {
      toast.error('进度需要是 0-100 之间的数字')
      return
    }
    if (updateSnapshot.isPending) return
    const next = courses.map((course, index) => {
      if (index !== selectedIndex) return course
      const status =
        value >= 100 ? 'done' : value > 0 ? 'doing' : 'todo'
      return { ...course, progress: value, status }
    })
    updateSnapshot.mutate(
      (draft) => ({ ...draft, courses: next }),
      {
        onSuccess: () => toast.success('课程进度已更新'),
        onError: (submitError) =>
          toast.error(
            submitError instanceof Error ? submitError.message : '保存失败',
          ),
      },
    )
  }

  const addCourse = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!name.trim()) {
      toast.error('请填写课程名称')
      return
    }
    if (updateSnapshot.isPending) return
    updateSnapshot.mutate(
      (draft) => ({
        ...draft,
        courses: [
          ...courses,
          { id: newId(), name: name.trim(), progress: 0, status: 'todo' },
        ],
      }),
      {
        onSuccess: () => {
          toast.success('课程已添加')
          onClose()
        },
        onError: (submitError) =>
          toast.error(
            submitError instanceof Error ? submitError.message : '保存失败',
          ),
      },
    )
  }

  const removeCourse = () => {
    if (updateSnapshot.isPending) return
    const next = courses.filter((_, index) => index !== selectedIndex)
    updateSnapshot.mutate(
      (draft) => ({ ...draft, courses: next }),
      {
        onSuccess: () => {
          setSelectedIndex(0)
          toast.success('课程已删除')
        },
        onError: (submitError) =>
          toast.error(
            submitError instanceof Error ? submitError.message : '删除失败',
          ),
      },
    )
  }

  const modeButton = (id: Mode, label: string) => (
    <button
      key={id}
      type="button"
      onClick={() => setMode(id)}
      className={`flex-1 rounded-[5px] px-2 py-1.5 text-[13px] transition-colors ${
        mode === id
          ? 'bg-primary text-primary-foreground'
          : 'text-ink-secondary hover:bg-surface-muted'
      }`}
    >
      {label}
    </button>
  )

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>课程管理</DialogTitle>
        </DialogHeader>
        <div className="flex rounded-control border border-line p-0.5">
          {modeButton('progress', '更新进度')}
          {modeButton('add', '新增课程')}
          {modeButton('delete', '删除')}
        </div>

        {mode === 'add' ? (
          <form className="space-y-3" onSubmit={addCourse}>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="课程名称"
              className={inputClass}
              autoFocus
            />
            <div className="flex justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onClose}
              >
                取消
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={updateSnapshot.isPending}
              >
                {updateSnapshot.isPending ? (
                  <Loader2 className="animate-spin" />
                ) : null}
                添加
              </Button>
            </div>
          </form>
        ) : courses.length === 0 ? (
          <p className="rounded-control border border-dashed border-line p-3 text-[13px] text-ink-muted">
            还没有课程，先用「新增课程」。
          </p>
        ) : (
          <form className="space-y-3" onSubmit={updateProgress}>
            <select
              value={selectedIndex}
              onChange={(event) =>
                setSelectedIndex(Number(event.target.value))
              }
              className={inputClass}
            >
              {courses.map((course, index) => (
                <option key={course.id ?? index} value={index}>
                  {course.name || '未命名课程'}
                </option>
              ))}
            </select>

            {mode === 'progress' ? (
              <>
                <input
                  value={progress}
                  onChange={(event) => setProgress(event.target.value)}
                  inputMode="numeric"
                  placeholder="新进度（0-100）"
                  className={inputClass}
                  autoFocus
                />
                <div className="flex justify-end gap-2 pt-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={onClose}
                  >
                    取消
                  </Button>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={updateSnapshot.isPending}
                  >
                    {updateSnapshot.isPending ? (
                      <Loader2 className="animate-spin" />
                    ) : null}
                    保存进度
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex justify-end gap-2 pt-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={onClose}
                >
                  取消
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={updateSnapshot.isPending}
                  onClick={removeCourse}
                >
                  {updateSnapshot.isPending ? (
                    <Loader2 className="animate-spin" />
                  ) : null}
                  确认删除
                </Button>
              </div>
            )}
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}