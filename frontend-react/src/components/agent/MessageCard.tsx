import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { ChevronDown, FileText, Lightbulb, Quote, ShieldCheck, Sparkles, User } from 'lucide-react'
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
  const [display, setDisplay] = useState(message.streaming ? '' : message.content)
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

  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      className={cn('flex gap-3', !isAssistant && 'justify-end')}
    >
      {isAssistant ? (
        <span className="mt-1 grid size-9 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-primary to-secondary text-white">
          <Sparkles className="size-4" />
        </span>
      ) : null}

      <div className={cn('min-w-0 max-w-[760px] rounded-3xl border p-4', isAssistant ? 'border-line bg-surface/84 shadow-sm' : 'border-primary/20 bg-primary/10')}>
        <div className="mb-2 flex items-center gap-2">
          <span className="text-xs font-semibold text-muted">{isAssistant ? 'Learning Agent' : 'You'}</span>
          {message.mode ? <Badge tone={message.mode === 'personal' ? 'primary' : 'info'}>{message.mode}</Badge> : null}
          {message.streaming ? <span className="text-xs text-primary">streaming</span> : null}
        </div>
        <div className="whitespace-pre-wrap text-sm leading-7 text-ink">
          {display}
          {message.streaming && display.length < message.content.length ? <span className="ml-0.5 inline-block h-4 w-[2px] animate-pulse bg-primary align-middle" /> : null}
        </div>

        {message.insights?.length ? (
          <div className="mt-3 rounded-2xl bg-amber-50/70 p-3">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-amber-700">
              <Lightbulb className="size-3.5" /> Growth Observation
            </p>
            <ul className="space-y-1.5 text-sm text-amber-800">
              {message.insights.map((insight, index) => (
                <li key={insight.id || index} className="flex items-start justify-between gap-3">
                  <span>{insight.title}</span>
                  {typeof insight.confidence === 'number' ? <span className="text-xs text-amber-600">{Math.round(insight.confidence * 100)}%</span> : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {message.evidence?.length ? (
          <div className="mt-3 rounded-2xl border border-line bg-slate-50/70">
            <button type="button" className="flex w-full items-center justify-between gap-2 p-3 text-left" onClick={() => setShowEvidence((value) => !value)}>
              <span className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                <Quote className="size-3.5" /> Evidence Bound · {message.evidence.length}
              </span>
              <ChevronDown className={cn('size-4 text-slate-500 transition-transform', showEvidence && 'rotate-180')} />
            </button>
            {showEvidence ? (
              <ul className="space-y-2 border-t border-line p-3">
                {message.evidence.map((item) => (
                  <li key={item.id} className="rounded-xl bg-white p-3">
                    <p className="text-sm text-ink">{item.title}</p>
                    <p className="mt-1 flex items-center gap-1 text-xs text-muted">
                      <FileText className="size-3" /> {item.source}
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
              <div key={action.id || index} className="rounded-2xl border border-primary/18 bg-primary/6 p-3">
                <p className="text-sm font-medium text-ink">{action.title}</p>
                <p className="mt-1 text-xs text-muted">{action.reason || '学习状态建议'}</p>
                <p className="mt-2 flex items-center gap-1 text-xs font-medium text-primary">
                  <ShieldCheck className="size-3.5" /> Action Proposal · 需要你确认
                </p>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {!isAssistant ? (
        <span className="mt-1 grid size-9 shrink-0 place-items-center rounded-2xl bg-slate-100 text-slate-500">
          <User className="size-4" />
        </span>
      ) : null}
    </motion.article>
  )
}
