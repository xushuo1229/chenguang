import { useQuery } from '@tanstack/react-query'
import { Brain, Database, Info } from 'lucide-react'
import { getAgentContext } from '@/services/agentService'

function formatDate(value: string | undefined): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`
}

export default function MemoryPage() {
  const contextQuery = useQuery({
    queryKey: ['zeno', 'agent-context'],
    queryFn: getAgentContext,
  })

  if (contextQuery.isPending) {
    return (
      <div className="space-y-3">
        <div className="h-[var(--control-h)] w-full animate-pulse rounded-card bg-surface-muted" />
        <div className="h-24 w-full animate-pulse rounded-card bg-surface-muted" />
      </div>
    )
  }
  if (contextQuery.isError) {
    return (
      <div className="rounded-card border border-danger/30 bg-danger-muted p-6">
        <p className="text-sm font-medium text-danger">无法加载 Growth Memory。</p>
        <button
          type="button"
          onClick={() => void contextQuery.refetch()}
          className="mt-3 text-[13px] font-medium text-primary hover:underline"
        >
          重试
        </button>
      </div>
    )
  }

  const context = contextQuery.data
  const memory = context.context?.memories?.growth?.value
  const items = memory?.available ? memory.items ?? [] : []
  const insights = context.previousInsights ?? []
  const grouped = new Map<string, typeof items>()
  items.forEach((item) => {
    const list = grouped.get(item.category) ?? []
    list.push(item)
    grouped.set(item.category, list)
  })

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold tracking-tight text-ink">Growth Memory</h1>
        <p className="mt-0.5 text-[13px] text-ink-muted">
          Zeno 对你长期学习状态的理解。记忆会随新的记录更新。
        </p>
      </div>

      <p className="flex items-start gap-2 rounded-card border border-line bg-surface-subtle px-3.5 py-2.5 text-[12.5px] leading-5 text-ink-muted">
        <Info className="mt-0.5 size-3.5 shrink-0 text-ink-faint" />
        以下为 Agent 基于你的记录产生的推断，不等同于客观事实；置信度反映推断的可靠程度。
      </p>

      {items.length === 0 ? (
        <div className="rounded-card border border-dashed border-border-strong px-6 py-12 text-center">
          <span className="mx-auto grid size-10 place-items-center rounded-card bg-surface-muted text-ink-muted">
            <Brain />
          </span>
          <p className="mt-3 text-sm font-medium text-ink">还没有形成记忆</p>
          <p className="mx-auto mt-1 max-w-xs text-[13px] text-ink-muted">
            持续记录学习活动后，Zeno 会总结你的偏好、优势与薄弱环节。
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {Array.from(grouped.entries()).map(([category, categoryItems]) => (
            <section key={category}>
              <h2 className="mb-2 text-[13px] font-semibold text-ink">{category}</h2>
              <ul className="space-y-2">
                {categoryItems.map((item) => (
                  <li
                    key={item.id}
                    className="rounded-card border border-line bg-surface px-4 py-3"
                  >
                    <p className="text-[13.5px] leading-6 text-ink-secondary">{item.content}</p>
                    <div className="mt-2 flex items-center justify-between text-[11px] text-ink-faint">
                      <span className="flex items-center gap-1">
                        <Database className="size-3" />
                        Agent 推断
                      </span>
                      <span className="tabular-nums">
                        {typeof item.confidence === 'number'
                          ? `置信度 ${Math.round(item.confidence * 100)}% · `
                          : ''}
                        {formatDate(item.updatedAt)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {insights.length ? (
        <section>
          <h2 className="mb-2 text-[13px] font-semibold text-ink">确定性洞察</h2>
          <ul className="space-y-2">
            {insights.slice(0, 6).map((insight, index) => (
              <li
                key={insight.title || index}
                className="flex items-center justify-between gap-3 rounded-card border border-line bg-surface px-4 py-2.5 text-[13px] text-ink-secondary"
              >
                <span>{insight.title}</span>
                {typeof insight.confidence === 'number' ? (
                  <span className="shrink-0 text-xs tabular-nums text-ink-faint">
                    {Math.round(insight.confidence * 100)}%
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
