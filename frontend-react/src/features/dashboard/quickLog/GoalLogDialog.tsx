import { useState, type FormEvent } from 'react'
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

const inputClass =
  'h-[var(--control-h)] w-full rounded-control border border-line bg-surface px-3 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-primary'

function newId(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return `goal-${Date.now()}`
}

export function GoalLogDialog({ onClose }: { onClose: () => void }) {
  const [title, setTitle] = useState('')
  const [targetValue, setTargetValue] = useState('')
  const [metric, setMetric] = useState('')
  const [period, setPeriod] = useState('custom')
  const updateSnapshot = useUpdateSnapshot()
  const today = todayKey()

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const target = Number(targetValue)
    if (!title.trim() || !(target > 0)) {
      toast.error('请填写目标标题和大于 0 的目标值')
      return
    }
    if (updateSnapshot.isPending) return
    const nowIso = new Date().toISOString()
    const goal = {
      id: newId(),
      title: title.trim(),
      type: '',
      metric: metric.trim(),
      targetValue: target,
      period,
      startDate: today,
      endDate: '',
      status: 'active',
      createdAt: nowIso,
      updatedAt: nowIso,
    }
    updateSnapshot.mutate(
      (draft) => ({
        ...draft,
        goals: [...(draft.goals ?? []), goal],
      }),
      {
        onSuccess: () => {
          toast.success('目标已创建')
          onClose()
        },
        onError: (submitError) => {
          toast.error(
            submitError instanceof Error ? submitError.message : '保存失败',
          )
        },
      },
    )
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>新建目标</DialogTitle>
          <DialogDescription>
            目标进度由 Goal Engine 实时计算，这里只记录目标定义。
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-3" onSubmit={handleSubmit}>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="目标标题，如：本月读完 4 本书"
            className={inputClass}
            autoFocus
          />
          <input
            value={targetValue}
            onChange={(event) => setTargetValue(event.target.value)}
            inputMode="numeric"
            placeholder="目标值（数值，如 4）"
            className={inputClass}
          />
          <input
            value={metric}
            onChange={(event) => setMetric(event.target.value)}
            placeholder="度量指标（可选，如 books / minutes）"
            className={inputClass}
          />
          <select
            value={period}
            onChange={(event) => setPeriod(event.target.value)}
            className={inputClass}
          >
            <option value="custom">自定义周期</option>
            <option value="weekly">每周</option>
            <option value="monthly">每月</option>
          </select>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              取消
            </Button>
            <Button type="submit" size="sm" disabled={updateSnapshot.isPending}>
              {updateSnapshot.isPending ? (
                <Loader2 className="animate-spin" />
              ) : null}
              创建目标
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}