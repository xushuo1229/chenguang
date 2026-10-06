import { useState } from 'react'
import { Plus, Target, Trash2, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useSnapshot, useUpdateSnapshot } from '@/features/snapshot/useSnapshot'
import { GoalLogDialog } from '@/features/dashboard/quickLog/GoalLogDialog'
import { cn } from '@/lib/utils'

type GoalView = {
  id?: string
  title?: string
  progress?: number
  targetValue?: number
  metric?: string
  status?: string
  endDate?: string
}

export default function GoalsPage() {
  const snapshotQuery = useSnapshot()
  const updateSnapshot = useUpdateSnapshot()
  const [createOpen, setCreateOpen] = useState(false)
  const [editing, setEditing] = useState<GoalView | null>(null)
  const [progressInput, setProgressInput] = useState('')

  if (snapshotQuery.isPending) {
    return (
      <div className="space-y-3">
        <div className="h-[var(--control-h)] w-full animate-pulse rounded-card bg-surface-muted" />
        <div className="h-16 w-full animate-pulse rounded-card bg-surface-muted" />
        <div className="h-16 w-full animate-pulse rounded-card bg-surface-muted" />
      </div>
    )
  }
  if (snapshotQuery.isError) {
    return (
      <div className="rounded-card border border-danger/30 bg-danger-muted p-6">
        <p className="text-sm font-medium text-danger">无法加载你的目标。</p>
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

  const goals = (snapshotQuery.data.data.goals ?? []) as GoalView[]

  const openEdit = (goal: GoalView) => {
    setEditing(goal)
    setProgressInput(String(Math.round(Number(goal.progress) || 0)))
  }

  const saveProgress = () => {
    if (!editing?.id) return
    const value = Math.max(0, Math.min(100, Number(progressInput) || 0))
    updateSnapshot.mutate(
      (draft) => ({
        ...draft,
        goals: (draft.goals ?? []).map((goal) =>
          goal.id === editing.id
            ? { ...goal, progress: value, updatedAt: new Date().toISOString() }
            : goal,
        ),
      }),
      {
        onSuccess: () => setEditing(null),
      },
    )
  }

  const removeGoal = (goal: GoalView) => {
    if (!goal.id) return
    updateSnapshot.mutate((draft) => ({
      ...draft,
      goals: (draft.goals ?? []).filter((item) => item.id !== goal.id),
    }))
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-ink">Goals</h1>
          <p className="mt-0.5 text-[13px] text-ink-muted">
            {goals.length ? `共 ${goals.length} 个目标` : '目标连接你的日常行动与长期方向。'}
          </p>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" />
          新建目标
        </Button>
      </div>

      {goals.length === 0 ? (
        <div className="rounded-card border border-dashed border-border-strong px-6 py-12 text-center">
          <span className="mx-auto grid size-10 place-items-center rounded-card bg-surface-muted text-ink-muted">
            <Target />
          </span>
          <p className="mt-3 text-sm font-medium text-ink">还没有目标</p>
          <p className="mx-auto mt-1 max-w-xs text-[13px] text-ink-muted">
            定义一个有明确目标值与周期的目标，Zeno 会结合你的记录给出建议。
          </p>
          <Button size="sm" variant="secondary" className="mt-4" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
            创建第一个目标
          </Button>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {goals.map((goal, index) => {
            const progressValue = Math.max(
              0,
              Math.min(100, Math.round(Number(goal.progress) || 0)),
            )
            return (
              <li
                key={goal.id || `goal-${index}`}
                className="rounded-card border border-line bg-surface px-4 py-3.5"
              >
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{goal.title}</p>
                    <div className="mt-2.5 flex items-center gap-2.5">
                      <Progress value={progressValue} className="w-40" />
                      <span className="text-xs tabular-nums text-ink-muted">{progressValue}%</span>
                      {goal.targetValue ? (
                        <span className="text-xs text-ink-faint">
                          目标 {goal.targetValue}
                          {goal.metric ? ` ${goal.metric}` : ''}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className={cn('flex shrink-0 items-center gap-0.5')}>
                    <button
                      type="button"
                      aria-label="更新进度"
                      onClick={() => openEdit(goal)}
                      className="grid size-8 place-items-center rounded-control text-ink-muted hover:bg-surface-muted hover:text-ink"
                    >
                      <Pencil className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label="删除目标"
                      onClick={() => removeGoal(goal)}
                      className="grid size-8 place-items-center rounded-control text-ink-muted hover:bg-danger-muted hover:text-danger"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {createOpen ? <GoalLogDialog onClose={() => setCreateOpen(false)} /> : null}

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>更新进度 · {editing?.title}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <label className="block text-[13px] text-ink-muted">
              当前完成度（0–100%）
              <input
                type="number"
                min={0}
                max={100}
                value={progressInput}
                onChange={(event) => setProgressInput(event.target.value)}
                className="mt-1.5 h-[var(--control-h)] w-full rounded-control border border-line bg-surface px-3 text-sm text-ink outline-none focus:border-primary"
              />
            </label>
            <Button size="sm" className="w-full" onClick={saveProgress}>
              保存进度
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
