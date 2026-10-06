import { useState } from 'react'
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Copy,
  FileText,
  Lightbulb,
  Plus,
  Quote,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { AgentSuggestion } from '@/services/agentService'
import type { StoredMessage } from '@/services/conversationStore'
import { MarkdownMessage } from './MarkdownMessage'
import { ThinkingChecklist } from './ThinkingChecklist'

export type MessageStatus = 'pending' | 'error' | 'done'

type AssistantMessageViewProps = {
  message: StoredMessage
  status: MessageStatus
  onRetry: () => void
  onResubmitGeneral: () => void
  onAcceptAction: (action: AgentSuggestion) => void
}

export function AssistantMessageView({
  message,
  status,
  onRetry,
  onResubmitGeneral,
  onAcceptAction,
}: AssistantMessageViewProps) {
  const [showEvidence, setShowEvidence] = useState(false)
  const [copied, setCopied] = useState(false)

  const copyContent = async () => {
    try {
      await navigator.clipboard.writeText(message.content)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    } catch {
      // Non-essential action.
    }
  }

  return (
    <div className="space-y-3">
      {status === 'pending' ? (
        <ThinkingChecklist />
      ) : status === 'error' ? (
        <div className="rounded-card border border-danger/30 bg-danger-muted p-3.5">
          <p className="flex items-center gap-2 text-[13px] font-medium text-danger">
            <AlertTriangle className="size-4" />
            Agent 暂时没有响应
          </p>
          <p className="mt-1.5 text-xs leading-5 text-ink-muted">
            可能是网络中断、服务超时或模型暂时不可用。你可以重试，或切换到 General AI。
          </p>
          <div className="mt-3 flex gap-2">
            <Button size="sm" onClick={onRetry}>
              <RotateCcw />
              重试
            </Button>
            <Button size="sm" variant="secondary" onClick={onResubmitGeneral}>
              用 General AI
            </Button>
          </div>
        </div>
      ) : (
        <>
          <MarkdownMessage content={message.content} />

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={copyContent}
              aria-label="复制回复"
              className="grid size-7 place-items-center rounded-control text-ink-faint transition-colors hover:bg-surface-muted hover:text-ink-secondary"
            >
              {copied ? (
                <Check className="size-3.5 text-success" />
              ) : (
                <Copy className="size-3.5" />
              )}
            </button>
            {typeof message.confidence === 'number' ? (
              <span className="ml-1 text-[11px] tabular-nums text-ink-faint">
                置信度 {Math.round(message.confidence * 100)}%
              </span>
            ) : null}
          </div>
        </>
      )}

      {message.insights?.length ? (
        <div className="rounded-card bg-warning-muted p-3">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-warning">
            <Lightbulb className="size-3.5" />
            Growth Observation
          </p>
          <ul className="space-y-1.5">
            {message.insights.map((insight, index) => (
              <li
                key={insight.id || index}
                className="flex items-start justify-between gap-3 text-[13px] leading-6 text-ink-secondary"
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
        </div>
      ) : null}

      {message.evidence?.length ? (
        <div className="rounded-card border border-line bg-surface">
          <button
            type="button"
            className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
            onClick={() => setShowEvidence((value) => !value)}
            aria-expanded={showEvidence}
          >
            <span className="flex items-center gap-2 text-xs font-semibold text-ink-secondary">
              <Quote className="size-3.5 text-primary" />
              Evidence · {message.evidence.length}
            </span>
            <ChevronDown
              className={cn(
                'size-4 text-ink-faint transition-transform duration-200',
                showEvidence && 'rotate-180',
              )}
            />
          </button>
          {showEvidence ? (
            <ul className="space-y-2 border-t border-line p-3">
              {message.evidence.map((item) => (
                <li key={item.id} className="rounded-control bg-surface-muted p-2.5">
                  <p className="text-[13px] leading-5 text-ink-secondary">{item.title}</p>
                  <p className="mt-1 flex items-center gap-1 text-xs text-ink-faint">
                    <FileText className="size-3" />
                    {item.source}
                  </p>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {message.actions?.length ? (
        <div className="space-y-2">
          {message.actions.map((action, index) => (
            <div
              key={action.id || index}
              className="rounded-card border border-primary/25 bg-primary-muted p-3"
            >
              <p className="text-sm font-medium text-ink">{action.title || action.text}</p>
              {action.reason ? (
                <p className="mt-1 text-xs leading-5 text-ink-muted">{action.reason}</p>
              ) : null}
              <div className="mt-2.5 flex items-center justify-between gap-2">
                <span className="flex items-center gap-1 text-[11px] font-medium text-primary">
                  <ShieldCheck className="size-3" />
                  AI 建议 · 需要你确认
                </span>
                {status === 'done' ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => onAcceptAction(action)}
                  >
                    <Plus className="size-3.5" />
                    加入今日任务
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {status === 'done' &&
      message.mode === 'general' &&
      message.metadata?.fallback &&
      (message.metadata.fallbackReason === 'llm_not_configured' ||
        message.metadata.fallbackReason === 'provider_unavailable') ? (
        <p className="flex items-start gap-2 rounded-card border border-warning/30 bg-surface-subtle p-3 text-[13px] leading-5 text-warning">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          General AI 服务当前不可用，这是离线兜底回答。
        </p>
      ) : null}
    </div>
  )
}
