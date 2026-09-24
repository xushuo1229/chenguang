import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  ChevronDown,
  FileText,
  Lightbulb,
  Quote,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { AgentChatResponse } from '@/services/agentService'

export type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  confidence?: number
  evidence?: AgentChatResponse['evidence']
  insights?: AgentChatResponse['insights']
  actions?: AgentChatResponse['actions']
  mode?: AgentChatResponse['mode']
  streaming?: boolean
}

export function MessageCard({ message }: { message: ChatMessage }) {
  const isAssistant = message.role === 'assistant'
  const [display, setDisplay] = useState(
    message.streaming ? '' : message.content,
  )
  const [showEvidence, setShowEvidence] = useState(false)
  const cursorRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!message.streaming) {
      setDisplay(message.content)
      return
    }

    let index = 0
    cursorRef.current = setInterval(() => {
      index += 3
      setDisplay(message.content.slice(0, index))
      if (index >= message.content.length && cursorRef.current) {
        clearInterval(cursorRef.current)
      }
    }, 18)

    return () => {
      if (cursorRef.current) clearInterval(cursorRef.current)
    }
  }, [message.content, message.streaming])

  if (!isAssistant) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
        className="flex justify-end"
      >
        <div className="max-w-[85%] rounded-card rounded-br-sm border border-line bg-surface-muted px-3.5 py-2.5">
          <p className="whitespace-pre-wrap text-sm leading-6 text-ink">
            {message.content}
          </p>
        </div>
      </motion.div>
    )
  }

  const typing =
    message.streaming && display.length < message.content.length

  return (
    <motion.article
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
      className="flex gap-3"
    >
      <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-control bg-primary-muted text-primary">
        <Sparkles className="size-4" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-2">
          <span className="text-xs font-semibold text-ink-secondary">
            Zeno
          </span>
          {message.mode ? (
            <Badge tone={message.mode === 'personal' ? 'primary' : 'neutral'}>
              {message.mode}
            </Badge>
          ) : null}
          {message.streaming ? (
            <span className="size-1.5 animate-pulse rounded-full bg-primary" />
          ) : null}
        </div>

        <div className="whitespace-pre-wrap text-sm leading-7 text-ink">
          {display}
          {typing ? (
            <span className="ml-0.5 inline-block h-4 w-[2px] animate-pulse bg-primary align-middle" />
          ) : null}
        </div>

        {message.insights?.length ? (
          <div className="mt-3 rounded-card bg-warning-muted p-3">
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
          <div className="mt-3 rounded-card border border-line bg-surface">
            <button
              type="button"
              className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
              onClick={() => setShowEvidence((value) => !value)}
              aria-expanded={showEvidence}
            >
              <span className="flex items-center gap-2 text-xs font-semibold text-ink-secondary">
                <Quote className="size-3.5 text-primary" />
                Evidence Bound · {message.evidence.length}
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
                  <li
                    key={item.id}
                    className="rounded-control bg-surface-muted p-2.5"
                  >
                    <p className="text-[13px] leading-5 text-ink-secondary">
                      {item.title}
                    </p>
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
          <div className="mt-3 space-y-2">
            {message.actions.map((action, index) => (
              <div
                key={action.id || index}
                className="rounded-card border border-primary/25 bg-primary-muted p-3"
              >
                <p className="text-sm font-medium text-ink">{action.title}</p>
                {action.reason ? (
                  <p className="mt-1 text-xs leading-5 text-ink-muted">
                    {action.reason}
                  </p>
                ) : null}
                <p className="mt-2 flex items-center gap-1 text-xs font-medium text-primary">
                  <ShieldCheck className="size-3.5" />
                  Action Proposal · 需要你确认
                </p>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </motion.article>
  )
}
