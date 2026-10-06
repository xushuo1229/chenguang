import { useEffect, useState, type FormEvent } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useUpdateSnapshot } from '@/features/snapshot/useSnapshot'
import { todayKey } from '@/features/analytics/cgDate'

export type QuickLogKind = 'checkin' | 'focus' | 'sport' | 'reading' | 'english'

const titles: Record<QuickLogKind, string> = {
  checkin: '每日打卡',
  focus: '记录专注',
  sport: '记录运动',
  reading: '记录阅读',
  english: '记录英语',
}

const successText: Record<QuickLogKind, string> = {
  checkin: '打卡成功',
  focus: '专注已记录',
  sport: '运动已记录',
  reading: '阅读已记录',
  english: '英语学习已记录',
}

function newId(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return `rec-${Date.now()}-${Math.floor(Math.random() * 1e6)}`
}

const inputClass =
  'h-[var(--control-h)] w-full rounded-control border border-line bg-surface px-3 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-primary'

function numberValue(value: string): number {
  const number = Number(value)
  return Number.isFinite(number) ? Math.max(0, number) : 0
}

export function QuickLogDialog({
  kind,
  onClose,
}: {
  kind: QuickLogKind
  onClose: () => void
}) {
  const [task, setTask] = useState('')
  const [minutes, setMinutes] = useState('')
  const [duration, setDuration] = useState('')
  const [sportType, setSportType] = useState('general')
  const [calories, setCalories] = useState('')
  const [pages, setPages] = useState('')
  const [bookName, setBookName] = useState('')
  const [totalPages, setTotalPages] = useState('')
  const [words, setWords] = useState('')
  const updateSnapshot = useUpdateSnapshot()
  const today = todayKey()

  useEffect(() => {
    updateSnapshot.reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind])

  const buildRecord = () => {
    const id = newId()
    if (kind === 'checkin') return { id, date: today, status: 'done' }
    if (kind === 'focus') {
      return { id, date: today, minutes: numberValue(minutes), task: task.trim() }
    }
    if (kind === 'sport') {
      return {
        id,
        date: today,
        duration: numberValue(duration),
        type: sportType,
        calories: numberValue(calories),
        name: '运动',
      }
    }
    if (kind === 'reading') {
      return {
        id,
        date: today,
        pages: numberValue(pages),
        totalPages: numberValue(totalPages),
        bookName: bookName.trim() || '书籍',
        minutes: numberValue(minutes),
      }
    }
    return {
      id,
      date: today,
      minutes: numberValue(minutes),
      words: numberValue(words),
    }
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (updateSnapshot.isPending) return
    const record = buildRecord()
    updateSnapshot.mutate(
      (draft) => {
        const collection =
          kind === 'checkin'
            ? 'checkins'
            : kind === 'focus'
              ? 'focus'
              : kind === 'sport'
                ? 'sports'
                : kind === 'reading'
                  ? 'readings'
                  : 'english'
        return {
          ...draft,
          [collection]: [...((draft[collection] as unknown[]) ?? []), record],
        }
      },
      {
        onSuccess: () => {
          toast.success(successText[kind])
          onClose()
        },
        onError: (submitError) => {
          const message =
            submitError instanceof Error ? submitError.message : '保存失败'
          toast.error(message)
        },
      },
    )
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{titles[kind]}</DialogTitle>
          <DialogDescription>{today}</DialogDescription>
        </DialogHeader>
        <form className="space-y-3" onSubmit={handleSubmit}>
          {kind === 'checkin' ? (
            <p className="rounded-control border border-line bg-surface-subtle p-3 text-[13px] text-ink-secondary">
              确认记录今天的打卡。
            </p>
          ) : null}

          {kind === 'focus' ? (
            <>
              <input
                value={minutes}
                onChange={(event) => setMinutes(event.target.value)}
                inputMode="numeric"
                placeholder="专注分钟数"
                className={inputClass}
                autoFocus
              />
              <input
                value={task}
                onChange={(event) => setTask(event.target.value)}
                placeholder="专注任务（可选）"
                className={inputClass}
              />
            </>
          ) : null}

          {kind === 'sport' ? (
            <>
              <input
                value={duration}
                onChange={(event) => setDuration(event.target.value)}
                inputMode="numeric"
                placeholder="运动时长（分钟）"
                className={inputClass}
                autoFocus
              />
              <select
                value={sportType}
                onChange={(event) => setSportType(event.target.value)}
                className={inputClass}
              >
                <option value="general">通用</option>
                <option value="run">跑步</option>
                <option value="strength">力量</option>
                <option value="bike">骑行</option>
                <option value="ball">球类</option>
              </select>
              <input
                value={calories}
                onChange={(event) => setCalories(event.target.value)}
                inputMode="numeric"
                placeholder="卡路里（可选）"
                className={inputClass}
              />
            </>
          ) : null}

          {kind === 'reading' ? (
            <>
              <input
                value={bookName}
                onChange={(event) => setBookName(event.target.value)}
                placeholder="书名"
                className={inputClass}
                autoFocus
              />
              <input
                value={pages}
                onChange={(event) => setPages(event.target.value)}
                inputMode="numeric"
                placeholder="本次页数"
                className={inputClass}
              />
              <input
                value={totalPages}
                onChange={(event) => setTotalPages(event.target.value)}
                inputMode="numeric"
                placeholder="总页数（可选）"
                className={inputClass}
              />
            </>
          ) : null}

          {kind === 'english' ? (
            <>
              <input
                value={minutes}
                onChange={(event) => setMinutes(event.target.value)}
                inputMode="numeric"
                placeholder="学习分钟数"
                className={inputClass}
                autoFocus
              />
              <input
                value={words}
                onChange={(event) => setWords(event.target.value)}
                inputMode="numeric"
                placeholder="单词数（可选）"
                className={inputClass}
              />
            </>
          ) : null}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              取消
            </Button>
            <Button type="submit" size="sm" disabled={updateSnapshot.isPending}>
              {updateSnapshot.isPending ? (
                <Loader2 className="animate-spin" />
              ) : null}
              保存
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}