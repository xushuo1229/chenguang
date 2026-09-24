import { useQuery } from '@tanstack/react-query'
import { BarChart3, BrainCircuit, Layers, Sparkles, Target } from 'lucide-react'
import { StatCard } from '@/components/Cards/StatCard'
import { TrendChart } from '@/components/Dashboard/TrendChart'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/UI/card'
import { Badge } from '@/components/UI/badge'
import { EmptyState, ErrorState, LoadingState } from '@/components/UI/state'
import { Progress } from '@/components/UI/progress'
import { getAgentHomeInsights, getSyncSnapshot } from '@/services/analyticsService'
import { getAgentContext } from '@/services/agentService'
import { buildFocusTrend, buildKnowledgeCoverage } from '@/features/dashboard/dashboardMetrics'

function buildAbilityBars(context: Awaited<ReturnType<typeof getAgentContext>> | undefined) {
  const behavior = context?.context?.behavior?.value
  const focus = Math.min(100, Math.round(((behavior?.recent7?.focusMinutes || 0) / 420) * 100))
  const consistency = Math.min(100, Math.round(((behavior?.recent7?.studyActiveDays || 0) / 5) * 100))
  const taskRate = behavior?.taskSummary?.total
    ? Math.round(((behavior.taskSummary.completed || 0) / behavior.taskSummary.total) * 100)
    : 0
  return [
    { label: '任务执行', value: taskRate },
    { label: '专注投入', value: focus },
    { label: '学习一致性', value: consistency },
  ]
}

export default function AnalyticsPage() {
  const contextQuery = useQuery({ queryKey: ['personal-agent', 'context'], queryFn: getAgentContext })
  const snapshotQuery = useQuery({ queryKey: ['sync', 'snapshot'], queryFn: getSyncSnapshot })
  const insightsQuery = useQuery({ queryKey: ['agent-home', 'insights'], queryFn: getAgentHomeInsights })

  if (contextQuery.isPending || snapshotQuery.isPending) return <LoadingState text="正在加载分析..." className="mt-6" />
  if (contextQuery.isError || snapshotQuery.isError) return <ErrorState text="成长分析暂时不可用。" className="mt-6" />

  const context = contextQuery.data
  const snapshot = snapshotQuery.data
  const trend = buildFocusTrend(snapshot, 21)
  const abilities = buildAbilityBars(context)
  const knowledge = buildKnowledgeCoverage(context)
  const nodes = context?.context?.courseKnowledge?.value?.nodes || []
  const evidence = context?.context?.courseKnowledge?.value?.evidence || []
  const reports = insightsQuery.data?.insights || []
  const totalMinutes = trend.reduce((sum, point) => sum + point.value, 0)
  const activeDays = trend.filter((point) => point.value > 0).length

  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={BarChart3} label="近 21 天学习" value={`${totalMinutes}m`} hint="专注 + 阅读 + 英语" />
        <StatCard icon={Layers} label="有效学习日" value={activeDays} hint="以 21 天窗口计算" tone="secondary" />
        <StatCard icon={BrainCircuit} label="知识覆盖" value={`${knowledge.coverage}%`} hint="掌握节点 / 可评估节点" tone="success" />
        <StatCard icon={Target} label="证据条目" value={evidence.length} hint="课程知识证据" tone="warning" />
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.4fr_.6fr]">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Learning Trend</CardTitle>
              <CardDescription>最近 21 天学习分钟数</CardDescription>
            </div>
          </CardHeader>
          <CardContent><TrendChart points={trend} /></CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Ability Analysis</CardTitle>
              <CardDescription>基于同步行为的确定性投影</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {abilities.map((ability) => (
              <div key={ability.label}>
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="text-ink">{ability.label}</span>
                  <span className="text-muted">{ability.value}%</span>
                </div>
                <Progress value={ability.value} />
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-5 xl:grid-cols-[.6fr_1.4fr]">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Knowledge Nodes</CardTitle>
              <CardDescription>课程知识覆盖</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {nodes.length ? (
              <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
                {nodes.slice(0, 20).map((node, index) => (
                  <article key={node.id || index} className="rounded-2xl bg-slate-50 p-3">
                    <p className="text-sm font-medium text-ink">{node.title}</p>
                    {node.summary ? <p className="mt-1 line-clamp-2 text-xs text-muted">{node.summary}</p> : null}
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState title="暂无知识节点" description="导入课程或生成知识后显示。" />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>AI Growth Report</CardTitle>
              <CardDescription>确定性洞察与证据来源</CardDescription>
            </div>
            <Sparkles className="size-4 text-primary" />
          </CardHeader>
          <CardContent>
            {reports.length ? (
              <div className="grid gap-3 md:grid-cols-2">
                {reports.slice(0, 8).map((report, index) => (
                  <article key={report.title || index} className="rounded-2xl border border-line bg-slate-50/80 p-4">
                    <Badge tone="primary">insight</Badge>
                    <p className="mt-2 text-sm text-ink">{report.title}</p>
                    {typeof report.confidence === 'number' ? (
                      <p className="mt-2 text-xs text-muted">confidence {Math.round(report.confidence * 100)}%</p>
                    ) : null}
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState title="暂无成长报告" description="更多学习数据会生成趋势洞察。" />
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
