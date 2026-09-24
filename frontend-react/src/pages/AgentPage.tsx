import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { ChevronDown, ShieldCheck } from 'lucide-react'
import { AgentComposer } from '@/components/agent/AgentComposer'
import { MessageCard, type ChatMessage } from '@/components/agent/MessageCard'
import { AgentContextRail } from '@/features/agent/AgentContextRail'
import { Badge } from '@/components/ui/badge'
import { ErrorState, LoadingState } from '@/components/ui/state'
import { getAgentContext, sendAgentMessage } from '@/services/agentService'
import { cn } from '@/lib/utils'

type Mode = 'personal' | 'general'
type SubmitPayload = { message: string; mode: Mode; pendingId: string }

const welcomeMessage: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  content:
    '你好，我是 Zeno（当前为 mock 模式）。可以问我今天该推进什么，也可以切换到 General AI。',
  mode: 'personal',
}

export default function AgentPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([welcomeMessage])
  const [input, setInput] = useState('')
  const [mode, setMode] = useState<Mode>('personal')
  const [contextOpen, setContextOpen] = useState(false)
  const conversationId = useRef(`zeno-mock-${Date.now()}`)
  const scrollRef = useRef<HTMLDivElement>(null)

  const contextQuery = useQuery({
    queryKey: ['zeno', 'agent-context'],
    queryFn: getAgentContext,
  })

  const chatMutation = useMutation({
    mutationFn: ({ message, mode: chatMode }: SubmitPayload) =>
      sendAgentMessage(message, chatMode, conversationId.current),
    onSuccess: (response, variables) => {
      setMessages((current) =>
        current.map((message) =>
          message.id === variables.pendingId
            ? {
                ...message,
                content: response.answer,
                evidence: response.evidence,
                insights: response.insights,
                actions: response.actions,
                confidence: response.confidence,
                mode: response.mode,
                streaming: true,
              }
            : message,
        ),
      )
    },
    onError: (_error, variables) => {
      setMessages((current) =>
        current.map((message) =>
          message.id === variables.pendingId
            ? {
                ...message,
                content: 'Agent 暂时不可用，请稍后再试。',
                streaming: false,
              }
            : message,
        ),
      )
    },
    onSettled: () => {
      window.setTimeout(() => {
        setMessages((current) =>
          current.map((message) =>
            message.streaming ? { ...message, streaming: false } : message,
          ),
        )
      }, 1500)
    },
  })

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    })
  }, [messages])

  const submit = () => {
    const question = input.trim()
    if (!question || chatMutation.isPending) return
    const timestamp = Date.now()
    const pendingId = `reply-${timestamp}`
    setInput('')
    setMessages((current) => [
      ...current,
      { id: `user-${timestamp}`, role: 'user', content: question },
      {
        id: pendingId,
        role: 'assistant',
        content: '正在读取学习上下文...',
        streaming: true,
        mode,
      },
    ])
    chatMutation.mutate({ message: question, mode, pendingId })
  }

  const context = contextQuery.data

  return (
    <div className="flex h-full min-h-0 flex-col lg:flex-row">
      <section className="flex min-h-0 flex-1 flex-col border-b border-line lg:border-b-0 lg:border-r">
        <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-line px-4 lg:px-6">
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold text-ink">
              Zeno Agent
            </h1>
            <p className="truncate text-xs text-ink-muted">
              Personal 读取学习上下文 · General 不访问个人数据
            </p>
          </div>
          <Badge tone="success" className="shrink-0 whitespace-nowrap">
            <ShieldCheck className="size-3" />
            Read Only
          </Badge>
        </header>

        <button
          type="button"
          onClick={() => setContextOpen((value) => !value)}
          className="flex shrink-0 items-center justify-between border-b border-line bg-surface-subtle px-4 py-2.5 text-xs font-medium text-ink-secondary lg:hidden"
        >
          工作区上下文
          <ChevronDown
            className={cn(
              'size-4 transition-transform duration-200',
              contextOpen && 'rotate-180',
            )}
          />
        </button>
        {contextOpen ? (
          <div className="max-h-[45dvh] shrink-0 overflow-y-auto border-b border-line bg-surface lg:hidden">
            {contextQuery.isPending ? (
              <LoadingState text="正在加载上下文..." className="p-4" />
            ) : contextQuery.isError ? (
              <ErrorState text="上下文加载失败。" className="p-4" />
            ) : (
              <AgentContextRail context={context} />
            )}
          </div>
        ) : null}

        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-y-auto"
          aria-live="polite"
        >
          <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6 lg:px-6">
            {messages.map((message) => (
              <MessageCard key={message.id} message={message} />
            ))}
          </div>
        </div>

        <div className="shrink-0 border-t border-line bg-background pb-[68px] lg:pb-0">
          <div className="mx-auto w-full max-w-3xl px-4 py-3 lg:px-6">
            <AgentComposer
              value={input}
              mode={mode}
              busy={chatMutation.isPending}
              onChange={setInput}
              onModeChange={setMode}
              onSubmit={submit}
            />
          </div>
        </div>
      </section>

      <aside className="hidden w-[320px] shrink-0 overflow-y-auto bg-surface-subtle lg:block xl:w-[340px]">
        {contextQuery.isPending ? (
          <LoadingState text="正在加载上下文..." className="p-4" />
        ) : contextQuery.isError ? (
          <ErrorState text="上下文加载失败。" className="p-4" />
        ) : (
          <AgentContextRail context={context} />
        )}
      </aside>
    </div>
  )
}
