import { useQuery } from '@tanstack/react-query'
import { BrainCircuit, CircleCheck, Database } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state'
import { getAgentContext } from '@/services/agentService'

export function ContextPanel() {
  const contextQuery = useQuery({ queryKey: ['personal-agent', 'context'], queryFn: getAgentContext })
  const context = contextQuery.data
  const behavior = context?.context?.behavior?.value
  const course = context?.context?.courses?.value?.[0]
  const knowledge = context?.context?.knowledgeStates?.value
  const memory = context?.context?.memories?.growth?.value

  if (contextQuery.isPending) return <LoadingState text="正在同步 Agent 上下文..." className="m-4" />
  if (contextQuery.isError) return <ErrorState text="上下文暂时不可用。" className="m-4" />

  return (
    <aside className="hidden w-[320px] shrink-0 border-l border-line/70 bg-white/58 p-4 backdrop-blur-xl xl:block">
      <div className="sticky top-4 space-y-4">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Context Intelligence</CardTitle>
              <CardDescription>确定性 Agent 上下文</CardDescription>
            </div>
            <Badge tone="primary">Deterministic</Badge>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-2xl bg-slate-50 p-3">
              <p className="text-xs text-muted">Today State</p>
              <p className="mt-1 font-semibold text-ink">
                {behavior?.taskSummary?.completed || 0}/{behavior?.taskSummary?.total || 0} 任务 · {behavior?.focusSummary?.minutes || 0} 分钟
              </p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-3">
              <p className="text-xs text-muted">Learning State</p>
              <p className="mt-1 font-semibold text-ink">
                {knowledge?.weakTopics?.length || 0} 薄弱 · {knowledge?.strongTopics?.length || 0} 掌握
              </p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-3">
              <p className="text-xs text-muted">Current Course</p>
              <p className="mt-1 truncate font-semibold text-ink">{course?.name || '未选择课程'}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Memory Projection</CardTitle>
              <CardDescription>只读成长记忆</CardDescription>
            </div>
            <BrainCircuit className="size-4 text-primary" />
          </CardHeader>
          <CardContent>
            {memory?.available && memory.items?.length ? (
              <ul className="space-y-2">
                {memory.items.slice(0, 3).map((item) => (
                  <li key={item.id} className="rounded-xl bg-slate-50 p-3 text-sm">
                    <span className="text-xs uppercase tracking-wide text-muted">{item.category}</span>
                    <p className="mt-1 text-ink">{item.content}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="暂无已确认记忆" description="完成学习记录后会生成只读投影。" />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Agent Boundary</CardTitle>
              <CardDescription>权限模型</CardDescription>
            </div>
            <Database className="size-4 text-primary" />
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="flex items-center gap-2 text-ink"><CircleCheck className="size-4 text-emerald-500" /> 分析学习状态</p>
            <p className="flex items-center gap-2 text-ink"><CircleCheck className="size-4 text-emerald-500" /> 生成建议</p>
            <p className="text-sm text-muted">AI 不会直接修改学习数据。</p>
          </CardContent>
        </Card>
      </div>
    </aside>
  )
}
