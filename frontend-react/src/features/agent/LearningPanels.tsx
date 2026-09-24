import { CalendarCheck, BrainCircuit, Compass, ShieldAlert } from 'lucide-react'
import type { AgentContext } from '@/services/agentService'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/state'
import { Progress } from '@/components/ui/progress'

export function LearningPanels({ context }: { context: AgentContext | undefined }) {
  const behavior = context?.context?.behavior?.value
  const course = context?.context?.courses?.value?.[0]
  const memory = context?.context?.memories?.growth?.value
  const insights = context?.previousInsights || []
  const weakTopics = context?.context?.knowledgeStates?.value?.weakTopics || []

  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Today Tasks</CardTitle>
            <CardDescription>来自同步快照</CardDescription>
          </div>
          <CalendarCheck className="size-4 text-primary" />
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold text-ink">
            {behavior?.taskSummary?.completed || 0}
            <span className="text-base text-muted"> / {behavior?.taskSummary?.total || 0}</span>
          </p>
          <Progress value={behavior?.taskSummary?.total ? ((behavior.taskSummary.completed || 0) / behavior.taskSummary.total) * 100 : 0} className="mt-3" />
          <p className="mt-3 text-sm text-muted">今日专注 {behavior?.focusSummary?.minutes || 0} 分钟</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Recommended Next</CardTitle>
            <CardDescription>{course?.name || '当前没有选中课程'}</CardDescription>
          </div>
          <Compass className="size-4 text-primary" />
        </CardHeader>
        <CardContent className="space-y-3">
          {context?.review?.nextBestRecommendation ? (
            <div className="rounded-2xl bg-slate-50 p-3">
              <Badge tone="primary">next best</Badge>
              <p className="mt-2 font-medium text-ink">{context.review.nextBestRecommendation.nodeTitle}</p>
            </div>
          ) : weakTopics[0] ? (
            <div className="rounded-2xl bg-slate-50 p-3">
              <Badge tone="warning">review</Badge>
              <p className="mt-2 font-medium text-ink">{weakTopics[0]}</p>
            </div>
          ) : (
            <EmptyState title="暂无下一步推荐" description="补充学习记录后会自动生成。" />
          )}
          {behavior?.risks?.length ? (
            <div className="flex items-start gap-2 rounded-2xl bg-amber-50 p-3 text-sm text-amber-700">
              <ShieldAlert className="mt-0.5 size-4" />
              <span>{behavior.risks[0]?.message || behavior.risks[0]?.title}</span>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Growth Memory</CardTitle>
            <CardDescription>只读投影</CardDescription>
          </div>
          <BrainCircuit className="size-4 text-primary" />
        </CardHeader>
        <CardContent>
          {memory?.available && memory.items?.length ? (
            <ul className="space-y-2">
              {memory.items.slice(0, 3).map((item) => (
                <li key={item.id} className="rounded-xl bg-slate-50 p-3">
                  <p className="text-xs uppercase tracking-wide text-muted">{item.category}</p>
                  <p className="mt-1 text-sm text-ink">{item.content}</p>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="暂无成长记忆" description="AI 不会虚构记忆。" />
          )}
        </CardContent>
      </Card>

      <Card className="xl:col-span-3">
        <CardHeader>
          <div>
            <CardTitle>Agent Insights</CardTitle>
            <CardDescription>确定性洞察投影</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {insights.length ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {insights.slice(0, 6).map((insight, index) => (
                <article key={insight.title || index} className="rounded-2xl border border-line bg-slate-50/80 p-4">
                  <p className="text-sm text-ink">{insight.title}</p>
                  {typeof insight.confidence === 'number' ? (
                    <p className="mt-2 text-xs text-muted">confidence {Math.round(insight.confidence * 100)}%</p>
                  ) : null}
                </article>
              ))}
            </div>
          ) : (
            <EmptyState title="暂无结构化洞察" description="先产生一些学习行为，Agent 才能解释趋势。" />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
