import { useState, type FormEvent } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useUpdateSnapshot } from '@/features/snapshot/useSnapshot'
import { todayKey } from '@/features/analytics/cgDate'

const inputClass =
  'h-9 w-full rounded-control border border-line bg-surface px-3 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-primary'

function newId(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return `goal-${Date.now()}`
}

export function GoalLogDialog({ onClose }: { onClose: () => void }) {
  const [title, setTitle] = useState('')
  const [targetValue, setTargetValue] = useState('')
  const [metric, setMetric] = useState('')
  const [period, setPeriod] = useState('custom')
  const [error, setError] = useState('')
  const updateSnapshot = useUpdateSnapshot()
  const today = todayKey()

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const target = Number(targetValue)
    if (!title.trim() || !(target > 0)) {
      setError('请填写目标标题和大于 0 的目标值')
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
        onSuccess: onClose,
        onError: (submitError) =>
          setError(
            submitError instanceof Error ? submitError.message : '保存失败',
          ),
      },
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <button
        type="button"
        aria-label="关闭"
        className="absolute inset-0 bg-black/30"
        onClick={onClose}
      />
      <div className="relative w-full max-w-md rounded-card border border-line bg-surface p-6">
        <h2 className="text-base font-semibold text-ink">新建目标</h2>
        <p className="mt-1 text-[13px] text-ink-muted">
          目标进度由 Goal Engine 实时计算，这里只记录目标定义。
        </p>
        <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
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
          {error ? <p className="text-xs text-danger">{error}</p> : null}
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
      </div>
    </div>
  )
}