import {
  BookOpen,
  BrainCircuit,
  Compass,
  Gauge,
  ShieldAlert,
  Target,
} from 'lucide-react'
import type { AgentContext } from '@/services/agentService'
import { Badge } from '@/components/ui/badge'

function RailSection({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="border-b border-line px-4 py-4 last:border-b-0">
      <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
        <Icon className="size-3.5 text-ink-faint" />
        {title}
      </h3>
      <div className="mt-3">{children}</div>
    </section>
  )
}

function SignalRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
}) {
  return (
    <div className="flex items-center gap-2.5 py-1.5">
      <span className="grid size-7 shrink-0 place-items-center rounded-control bg-surface-muted text-ink-muted">
        <Icon className="size-3.5" />
      </span>
      <span className="shrink-0 text-xs text-ink-muted">{label}</span>
      <span className="ml-auto truncate pl-2 text-xs font-medium text-ink-secondary" title={value}>
        {value}
      </span>
    </div>
  )
}

export function AgentContextRail({ context }: { context: AgentContext | undefined }) {
  const behavior = context?.context?.behavior?.value
  const course = context?.context?.courses?.value?.[0]
  const memory = context?.context?.memories?.growth?.value
  const insights = context?.previousInsights ?? []
  const weakTopics = context?.context?.knowledgeStates?.value?.weakTopics ?? []
  const strongCount =
    context?.context?.knowledgeStates?.value?.strongTopics?.length ?? 0
  const risk = behavior?.risks?.[0]
  const recommendation = context?.review?.nextBestRecommendation?.nodeTitle

  return (
    <div className="flex h-full flex-col">
      <RailSection icon={Gauge} title="Workspace Signals">
        <div className="-my-1.5">
          <SignalRow
            icon={BookOpen}
            label="当前课程"
            value={course?.name || '未选择'}
          />
          <SignalRow
            icon={Target}
            label="今日任务"
            value={`${behavior?.taskSummary?.completed ?? 0}/${behavior?.taskSummary?.total ?? 0}`}
          />
          <SignalRow
            icon={Gauge}
            label="今日专注"
            value={`${behavior?.focusSummary?.minutes ?? 0}m`}
          />
          <SignalRow
            icon={BrainCircuit}
            label="薄弱 / 掌握"
            value={`${weakTopics.length} · ${strongCount}`}
          />
        </div>
      </RailSection>

      <RailSection icon={Compass} title="Recommended Next">
        {recommendation ? (
          <div className="space-y-2">
            <Badge tone="primary">next best</Badge>
            <p className="text-[13px] leading-5 text-ink-secondary">
              {recommendation}
            </p>
          </div>
        ) : weakTopics[0] ? (
          <div className="space-y-2">
            <Badge tone="warning">review</Badge>
            <p className="text-[13px] leading-5 text-ink-secondary">
              {weakTopics[0]}
            </p>
          </div>
        ) : (
          <p className="text-xs text-ink-faint">补充学习记录后自动生成推荐。</p>
        )}
        {risk ? (
          <p className="mt-3 flex items-start gap-2 rounded-control bg-warning-muted p-2.5 text-xs leading-5 text-warning">
            <ShieldAlert className="mt-0.5 size-3.5 shrink-0" />
            {risk.message || risk.title}
          </p>
        ) : null}
      </RailSection>

      <RailSection icon={BrainCircuit} title="Growth Memory">
        {memory?.available && memory.items?.length ? (
          <ul className="space-y-2">
            {memory.items.slice(0, 3).map((item) => (
              <li
                key={item.id}
                className="rounded-control bg-surface-muted px-2.5 py-2"
              >
                <p className="text-[10px] font-medium uppercase tracking-wide text-ink-faint">
                  {item.category}
                </p>
                <p className="mt-0.5 text-xs leading-5 text-ink-secondary">
                  {item.content}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-ink-faint">AI 不会虚构记忆。</p>
        )}
      </RailSection>

      <RailSection icon={Target} title="确定性洞察">
        {insights.length ? (
          <ul className="space-y-2.5">
            {insights.slice(0, 5).map((insight, index) => (
              <li key={insight.title || index} className="text-xs leading-5">
                <p className="text-ink-secondary">{insight.title}</p>
                {typeof insight.confidence === 'number' ? (
                  <p className="mt-0.5 tabular-nums text-ink-faint">
                    置信度 {Math.round(insight.confidence * 100)}%
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-ink-faint">暂无结构化洞察。</p>
        )}
      </RailSection>
    </div>
  )
}
