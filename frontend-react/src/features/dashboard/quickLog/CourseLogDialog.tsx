import { useState, type FormEvent } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
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

export function CourseLogDialog({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<Mode>('progress')
  const snapshotQuery = useSnapshot()
  const updateSnapshot = useUpdateSnapshot()

  const courses = snapshotQuery.data?.data.courses ?? []
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [progress, setProgress] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')

  const reset = () => setError('')

  const mutateCourses = (
    next: typeof courses,
    successMessage?: string,
  ) => {
    updateSnapshot.mutate(
      (draft) => ({ ...draft, courses: next }),
      {
        onSuccess: () => {
          if (mode === 'add') onClose()
          reset()
          if (successMessage) setError('')
        },
        onError: (submitError) =>
          setError(
            submitError instanceof Error ? submitError.message : '保存失败',
          ),
      },
    )
  }

  const updateProgress = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const value = Number(progress)
    if (!(value >= 0 && value <= 100)) {
      setError('进度需要是 0-100 之间的数字')
      return
    }
    if (updateSnapshot.isPending) return
    const next = courses.map((course, index) => {
      if (index !== selectedIndex) return course
      const status =
        value >= 100 ? 'done' : value > 0 ? 'doing' : 'todo'
      return { ...course, progress: value, status }
    })
    mutateCourses(next)
  }

  const addCourse = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!name.trim()) {
      setError('请填写课程名称')
      return
    }
    if (updateSnapshot.isPending) return
    mutateCourses([
      ...courses,
      { id: newId(), name: name.trim(), progress: 0, status: 'todo' },
    ])
  }

  const removeCourse = () => {
    if (updateSnapshot.isPending) return
    const next = courses.filter((_, index) => index !== selectedIndex)
    updateSnapshot.mutate(
      (draft) => ({ ...draft, courses: next }),
      {
        onSuccess: () => {
          setSelectedIndex(0)
        },
        onError: (submitError) =>
          setError(
            submitError instanceof Error ? submitError.message : '删除失败',
          ),
      },
    )
  }

  const modeButton = (id: Mode, label: string) => (
    <button
      key={id}
      type="button"
      onClick={() => {
        setMode(id)
        reset()
      }}
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
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <button
        type="button"
        aria-label="关闭"
        className="absolute inset-0 bg-black/30"
        onClick={onClose}
      />
      <div className="relative w-full max-w-md rounded-card border border-line bg-surface p-6">
        <h2 className="text-base font-semibold text-ink">课程管理</h2>
        <div className="mt-3 flex rounded-control border border-line p-0.5">
          {modeButton('progress', '更新进度')}
          {modeButton('add', '新增课程')}
          {modeButton('delete', '删除')}
        </div>

        {mode === 'add' ? (
          <form className="mt-4 space-y-3" onSubmit={addCourse}>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="课程名称"
              className={inputClass}
              autoFocus
            />
            {error ? <p className="text-xs text-danger">{error}</p> : null}
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
          <p className="mt-4 rounded-control border border-dashed border-line p-3 text-[13px] text-ink-muted">
            还没有课程，先用「新增课程」。
          </p>
        ) : (
          <form className="mt-4 space-y-3" onSubmit={updateProgress}>
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
            {error ? <p className="text-xs text-danger">{error}</p> : null}
          </form>
        )}
      </div>
    </div>
  )
}
