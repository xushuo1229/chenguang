import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { BrainCircuit, PanelRight, History } from 'lucide-react'
import { toast } from 'sonner'
import { AgentContextRail } from '@/features/agent/AgentContextRail'
import { AssistantMessageView } from '@/features/agent/AssistantMessageView'
import { ChatComposer, type AgentMode } from '@/features/agent/ChatComposer'
import { ConversationRail } from '@/features/agent/ConversationRail'
import {
  getAgentContext,
  sendAgentMessage,
  type AgentContext,
  type AgentSuggestion,
} from '@/services/agentService'
import {
  deleteConversation,
  getConversation,
  listConversations,
  renameConversation,
  saveConversation,
  type StoredConversation,
  type StoredMessage,
} from '@/services/conversationStore'
import { useUpdateSnapshot } from '@/features/snapshot/useSnapshot'
import { dateKey } from '@/lib/dateKey'
import { cn } from '@/lib/utils'

const suggestedPrompts = [
  '我今天应该学什么？',
  '帮我分析最近的学习状态。',
  '帮我安排今天的学习计划。',
  '我目前最应该解决什么问题？',
]

function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

export default function AgentWorkspace() {
  const params = useParams<{ conversationId?: string }>()
  const routeId = params.conversationId
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const [activeId, setActiveId] = useState<string | undefined>(routeId)
  const [messages, setMessages] = useState<StoredMessage[]>([])
  const [input, setInput] = useState('')
  const [mode, setMode] = useState<AgentMode>('personal')
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [errorId, setErrorId] = useState<string | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [contextOpen, setContextOpen] = useState(false)
  const [listVersion, setListVersion] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)
  const conversationKeyRef = useRef<string>(makeId('zeno'))

  useEffect(() => {
    if (routeId) {
      const stored = getConversation(routeId)
      setActiveId(routeId)
      setMessages(stored?.messages ?? [])
    } else {
      setActiveId(undefined)
      setMessages([])
    }
    setPendingId(null)
    setErrorId(null)
  }, [routeId])

  useEffect(() => {
    const draft = searchParams.get('q')
    if (draft) {
      setInput(draft)
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, setSearchParams])

  const conversations = useMemo<StoredConversation[]>(
    () => listConversations(),
    // Re-read after every mutation/route change; local adapter has no subscriptions.
    [listVersion, activeId, routeId],
  )

  const contextQuery = useQuery({
    queryKey: ['zeno', 'agent-context'],
    queryFn: getAgentContext,
  })

  const persist = (nextMessages: StoredMessage[], id: string) => {
    const existing = id ? getConversation(id) : undefined
    const now = Date.now()
    saveConversation({
      id,
      title: existing?.title ?? '',
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      messages: nextMessages,
    })
    if (!activeId) {
      setActiveId(id)
      navigate(`/agent/${id}`, { replace: true })
    }
    setListVersion((value) => value + 1)
  }

  const snapshotMutation = useUpdateSnapshot()

  const acceptAction = (action: AgentSuggestion) => {
    const text = action.title || action.text
    if (!text) return
    snapshotMutation.mutate(
      (draft) => {
        draft.todos = [
          ...(draft.todos ?? []),
          {
            id: makeId('todo'),
            text,
            date: dateKey(),
            done: false,
          },
        ]
        return draft
      },
      {
        onSuccess: () => toast.success('已加入今日任务'),
        onError: () => toast.error('加入失败，请重试'),
      },
    )
  }

  const requestReply = (question: string, chatMode: AgentMode) => {
    const conversationId = activeId ?? conversationKeyRef.current
    const timestamp = Date.now()
    const userMessage: StoredMessage = {
      id: makeId('user'),
      role: 'user',
      content: question,
      createdAt: timestamp,
    }
    const replyId = makeId('reply')
    const pendingMessage: StoredMessage = {
      id: replyId,
      role: 'assistant',
      content: '',
      mode: chatMode,
      createdAt: timestamp,
    }
    const baseMessages = [...messages, userMessage, pendingMessage]
    setMessages(baseMessages)
    setInput('')
    setPendingId(replyId)
    setErrorId(null)

    sendAgentMessage(question, chatMode, conversationId)
      .then((response) => {
        const nextMessages = baseMessages.map((message) =>
          message.id === replyId
            ? {
                ...message,
                content: response.answer,
                mode: response.mode,
                evidence: response.evidence,
                insights: response.insights,
                actions: response.actions,
                confidence: response.confidence,
                metadata: response.metadata,
              }
            : message,
        )
        setMessages(nextMessages)
        persist(nextMessages, conversationId)
      })
      .catch(() => setErrorId(replyId))
      .finally(() => setPendingId(null))
  }

  const submit = () => {
    const question = input.trim()
    if (!question || pendingId) return
    requestReply(question, mode)
  }

  const lastQuestion = [...messages].reverse().find((item) => item.role === 'user')?.content

  const retry = () => {
    if (lastQuestion && !pendingId) requestReply(lastQuestion, mode)
  }

  const resubmitGeneral = () => {
    if (lastQuestion && !pendingId) {
      setMode('general')
      requestReply(lastQuestion, 'general')
    }
  }

  const rename = (id: string, title: string) => {
    renameConversation(id, title)
    setListVersion((value) => value + 1)
  }

  const remove = (id: string) => {
    deleteConversation(id)
    if (id === activeId) {
      setActiveId(undefined)
      setMessages([])
      navigate('/agent', { replace: true })
    }
    setListVersion((value) => value + 1)
  }

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    })
  }, [messages, pendingId])

  const empty = messages.length === 0

  return (
    <div className="flex h-full min-h-0">
      <aside className="hidden w-[260px] shrink-0 border-r border-line bg-surface lg:block">
        <ConversationRail
          conversations={conversations}
          activeId={activeId}
          onRename={rename}
          onDelete={remove}
        />
      </aside>

      <MobileOverlay open={historyOpen} onClose={() => setHistoryOpen(false)} side="left">
        <ConversationRail
          conversations={conversations}
          activeId={activeId}
          onRename={rename}
          onDelete={remove}
          onNavigate={() => setHistoryOpen(false)}
        />
      </MobileOverlay>

      <section className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-1 border-b border-line px-3">
          <button
            type="button"
            onClick={() => setHistoryOpen(true)}
            aria-label="历史对话"
            className="grid size-8 place-items-center rounded-control text-ink-muted hover:bg-surface-muted hover:text-ink lg:hidden"
          >
            <History className="size-4" />
          </button>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold text-ink">Zeno</p>
          </div>
          <span className="ml-auto flex items-center gap-1.5 text-[11px] text-ink-faint">
            <span className="size-1.5 rounded-full bg-success" />
            Ready
          </span>
          <button
            type="button"
            onClick={() => setContextOpen((value) => !value)}
            aria-label="上下文面板"
            className="grid size-8 place-items-center rounded-control text-ink-muted hover:bg-surface-muted hover:text-ink xl:hidden"
          >
            <PanelRight className="size-4" />
          </button>
        </header>

        <button
          type="button"
          onClick={() => setContextOpen((value) => !value)}
          className="flex shrink-0 items-center justify-between border-b border-line bg-surface-subtle px-4 py-2 text-xs font-medium text-ink-secondary xl:hidden"
        >
          工作区上下文
          <BrainCircuit className="size-4" />
        </button>
        <AnimatePresence initial={false}>
          {contextOpen ? (
            <motion.div
              initial={{ height: 0 }}
              animate={{ height: 'auto' }}
              exit={{height: 0}}
              transition={{ duration: 0.18 }}
              className="max-h-[42dvh] shrink-0 overflow-hidden border-b border-line xl:hidden"
            >
              <div className="max-h-[42dvh] overflow-y-auto bg-surface-subtle">
                <ContextContent contextQuery={contextQuery} />
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto" aria-live="polite">
          {empty ? (
            <div className="mx-auto flex h-full max-w-xl flex-col items-center justify-center px-6 text-center">
              <p className="text-lg font-semibold text-ink">Zeno</p>
              <p className="mt-1 text-sm text-ink-muted">Your personal learning agent.</p>
              <div className="mt-6 grid w-full gap-2 sm:grid-cols-2">
                {suggestedPrompts.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => setInput(prompt)}
                    className="rounded-card border border-line bg-surface px-3 py-2.5 text-left text-[13px] text-ink-secondary transition-colors hover:border-primary hover:text-primary"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mx-auto w-full max-w-3xl space-y-7 px-4 py-6 lg:px-6">
              {messages.map((message) =>
                message.role === 'user' ? (
                  <div key={message.id} className="flex justify-end">
                    <p className="max-w-[85%] rounded-card bg-surface-muted px-3.5 py-2 text-[13.5px] leading-6 text-ink">
                      {message.content}
                    </p>
                  </div>
                ) : (
                  <AssistantMessageView
                    key={message.id}
                    message={message}
                    status={
                      message.id === pendingId
                        ? 'pending'
                        : message.id === errorId
                          ? 'error'
                          : 'done'
                    }
                    onRetry={retry}
                    onResubmitGeneral={resubmitGeneral}
                    onAcceptAction={acceptAction}
                  />
                ),
              )}
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-line bg-background px-4 py-3 pb-[76px] lg:px-6 lg:pb-3">
          <div className="mx-auto w-full max-w-3xl">
            <ChatComposer
              value={input}
              mode={mode}
              busy={!!pendingId}
              onChange={setInput}
              onModeChange={setMode}
              onSubmit={submit}
            />
          </div>
        </div>
      </section>

      <aside className="hidden w-[300px] shrink-0 overflow-y-auto border-l border-line bg-surface-subtle xl:block">
        <ContextContent contextQuery={contextQuery} />
      </aside>
    </div>
  )
}

function ContextContent({
  contextQuery,
}: {
  contextQuery: ReturnType<typeof useQuery>
}) {
  if (contextQuery.isPending) {
    return (
      <div className="space-y-3 p-4">
        <div className="h-4 w-24 animate-pulse rounded bg-surface-muted" />
        <div className="h-8 w-full animate-pulse rounded bg-surface-muted" />
        <div className="h-8 w-full animate-pulse rounded bg-surface-muted" />
      </div>
    )
  }
  if (contextQuery.isError) {
    return <p className="p-4 text-xs text-ink-faint">上下文加载失败，可稍后重试。</p>
  }
  return <AgentContextRail context={contextQuery.data as AgentContext} />
}

function MobileOverlay({
  open,
  onClose,
  side: _side,
  children,
}: {
  open: boolean
  onClose: () => void
  side: 'left' | 'right'
  children: React.ReactNode
}) {
  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-[var(--overlay)] lg:hidden"
            onClick={onClose}
          />
          <motion.aside
            initial={{ x: -300 }}
            animate={{ x: 0 }}
            exit={{ x: -300 }}
            transition={{ type: 'spring', damping: 30, stiffness: 340 }}
            className={cn(
              'fixed inset-y-0 left-0 z-50 w-[300px] border-r border-line bg-surface lg:hidden',
            )}
          >
            {children}
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>
  )
}
