import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { Check, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState, LoadingState } from '@/components/ui/state'
import {
  listCandidates,
  reviewCandidate,
  type ExtractionCandidate,
} from '@/services/courseSpaceService'

const typeLabel: Record<string, string> = {
  concept: '概念',
  definition: '定义',
  principle: '原理',
  procedure: '流程',
  formula: '公式',
  example: '示例',
  skill: '技能',
}

export function ReviewTab({ courseId }: { courseId: string }) {
  const queryClient = useQueryClient()
  const candidatesQuery = useQuery({
    queryKey: ['extraction-candidates', courseId],
    queryFn: () => listCandidates({ courseId, status: 'pending' }),
  })

  const reviewMutation = useMutation({
    mutationFn: ({
      candidateId,
      action,
    }: {
      candidateId: string
      action: 'accept' | 'reject'
    }) => reviewCandidate(candidateId, action),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ['extraction-candidates', courseId],
      }),
  })

  if (candidatesQuery.isPending) {
    return <LoadingState text="正在加载待审核候选..." />
  }
  if (candidatesQuery.isError) {
    return (
      <EmptyState
        title="候选加载失败"
        description="请检查网络或稍后重试。"
      />
    )
  }

  const candidates = candidatesQuery.data?.candidates ?? []
  if (candidates.length === 0) {
    return (
      <EmptyState
        title="没有待审核的候选"
        description="在「文档」中运行抽取后，AI 建议的知识点会进入这里等待你确认。"
      />
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-[13px] text-ink-muted">
        AI 只做建议；接受后才会写入知识图谱，拒绝则丢弃。共 {candidates.length} 条待处理。
      </p>
      {candidates.map((candidate: ExtractionCandidate) => (
        <Card key={candidate.id} className="p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="info">
                  {typeLabel[candidate.type] ?? candidate.type}
                </Badge>
                <span className="text-xs text-ink-muted tabular-nums">
                  置信度 {Math.round(candidate.confidence * 100)}%
                </span>
              </div>
              <h4 className="mt-2 text-sm font-semibold text-ink">
                {candidate.title}
              </h4>
              <p className="mt-1 text-[13px] leading-6 text-ink-secondary">
                {candidate.content}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={reviewMutation.isPending}
                onClick={() =>
                  reviewMutation.mutate({
                    candidateId: candidate.id,
                    action: 'reject',
                  })
                }
              >
                <X />
                拒绝
              </Button>
              <Button
                size="sm"
                disabled={reviewMutation.isPending}
                onClick={() =>
                  reviewMutation.mutate({
                    candidateId: candidate.id,
                    action: 'accept',
                  })
                }
              >
                <Check />
                接受
              </Button>
            </div>
          </div>
        </Card>
      ))}
    </div>
  )
}
