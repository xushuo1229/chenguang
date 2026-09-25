import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '@tremor/react'
import { Gauge } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { EmptyState, LoadingState } from '@/components/ui/state'
import type {
  KnowledgeMasteryState,
  KnowledgeState,
  ReviewItem,
  ReviewQueue,
} from '@/services/knowledgeStateService'

const stateLabel: Record<KnowledgeMasteryState, string> = {
  mastered: '已掌握',
  learning: '学习中',
  weak: '薄弱',
}

const stateTone: Record<
  KnowledgeMasteryState,
  'success' | 'info' | 'warning'
> = {
  mastered: 'success',
  learning: 'info',
  weak: 'warning',
}

export function MasteryTab({
  states,
  queue,
  isLoading,
  isError,
}: {
  states: KnowledgeState[] | undefined
  queue: ReviewQueue | undefined
  isLoading: boolean
  isError: boolean
}) {
  if (isLoading) return <LoadingState text="正在计算掌握度..." />
  if (isError) {
    return (
      <EmptyState
        icon={<Gauge className="size-5" />}
        title="掌握度加载失败"
        description="请检查网络或稍后重试。"
      />
    )
  }
  if (!states || states.length === 0) {
    return (
      <EmptyState
        icon={<Gauge className="size-5" />}
        title="还没有掌握度评估"
        description="完成练习或测评后，系统会投影每个知识点的掌握状态。"
      />
    )
  }

  const averageMastery = Math.round(
    (states.reduce((sum, state) => sum + state.masteryLevel, 0) /
      states.length) *
      100,
  )
  const countByState = (state: KnowledgeMasteryState) =>
    states.filter((item) => item.state === state).length

  return (
    <div className="space-y-4">
      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Card className="p-4">
          <p className="text-[13px] text-ink-muted">平均掌握度</p>
          <p className="mt-2 text-2xl font-semibold text-ink tabular-nums">
            {averageMastery}%
          </p>
        </Card>
        {(['mastered', 'learning', 'weak'] as const).map((state) => (
          <Card key={state} className="p-4">
            <p className="text-[13px] text-ink-muted">
              {stateLabel[state]}
            </p>
            <p className="mt-2 text-2xl font-semibold text-ink tabular-nums">
              {countByState(state)}
            </p>
          </Card>
        ))}
      </section>

      <Card className="p-5">
        <h3 className="text-sm font-semibold text-ink">知识点掌握分布</h3>
        <ul className="mt-4 space-y-3">
          {states.map((state) => (
            <li key={state.id}>
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-ink">{state.nodeTitle}</span>
                <span className="text-ink-muted tabular-nums">
                  {Math.round(state.masteryLevel * 100)}%
                </span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-muted">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${state.masteryLevel * 100}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="border-b border-line px-5 py-3.5">
          <h3 className="text-sm font-semibold text-ink">待复习队列</h3>
        </div>
        <Table className="text-sm">
          <TableHead>
            <TableRow className="bg-surface-muted/50">
              <TableHeaderCell>知识点</TableHeaderCell>
              <TableHeaderCell>状态</TableHeaderCell>
              <TableHeaderCell>原因</TableHeaderCell>
              <TableHeaderCell className="text-right">优先级</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {(queue?.items ?? []).map((item: ReviewItem) => (
              <TableRow key={item.knowledgeNodeId}>
                <TableCell className="font-medium text-ink">
                  {item.nodeTitle}
                </TableCell>
                <TableCell>
                  <Badge tone={stateTone[item.state]}>
                    {stateLabel[item.state]}
                  </Badge>
                </TableCell>
                <TableCell className="text-ink-secondary">
                  {item.reason}
                </TableCell>
                <TableCell className="text-right tabular-nums text-ink-secondary">
                  P{item.priority}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}
