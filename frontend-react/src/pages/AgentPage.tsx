import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { AgentComposer } from '@/components/agent/AgentComposer'
import { MessageCard, type ChatMessage } from '@/components/agent/MessageCard'
import { LearningPanels } from '@/features/agent/LearningPanels'
import { ErrorState, LoadingState } from '@/components/ui/state'
import { getAgentContext, sendAgentMessage } from '@/services/agentService'

type Mode = 'personal' | 'general'
type SubmitPayload = { message: string; mode: Mode; pendingId: string }

const welcomeMessage: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  content: '你好，我是 Zeno（当前为 mock 模式）。可以问我今天该推进什么，也可以切换到 General AI。',
  mode: 'personal',
}

export default function AgentPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([welcomeMessage])
  const [input, setInput] = useState('')
  const [mode, setMode] = useState<Mode>('personal')
  const conversationId = useRef(`zeno-mock-${Date.now()}`)
  const scrollRef = useRef<HTMLDivElement>(null)

  const contextQuery = useQuery({ queryKey: ['zeno', 'agent-context'], queryFn: getAgentContext })

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
            ? { ...message, content: 'Agent 暂时不可用，请稍后再试。', streaming: false }
            : message,
        ),
      )
    },
    onSettled: () => {
      window.setTimeout(() => {
        setMessages((current) =>
          current.map((message) => (message.streaming ? { ...message, streaming: false } : message)),
        )
      }, 1500)
    },
  })

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
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
      { id: pendingId, role: 'assistant', content: '正在读取学习上下文...', streaming: true, mode },
    ])
    chatMutation.mutate({ message: question, mode, pendingId })
  }

  const context = contextQuery.data
  const course = context?.context?.courses?.value?.[0]
  const behavior = context?.context?.behavior?.value
  const knowledge = context?.context?.knowledgeStates?.value

  return (
    <div className="space-y-6">
      <section className="surface-card overflow-hidden p-0">
        <div className="grid lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="flex min-h-[64dvh] flex-col border-b border-line/70 lg:border-b-0 lg:border-r">
            <div className="flex items-center justify-between gap-3 border-b border-line/70 px-5 py-4">
              <div>
                <h2 className="font-semibold text-ink">Agent Conversation</h2>
                <p className="text-xs text-muted">Personal 读取上下文 · General 不访问个人数据</p>
              </div>
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-600">
                Read Only
              </span>
            </div>

            <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5" aria-live="polite">
              {messages.map((message) => (
                <MessageCard key={message.id} message={message} />
              ))}
            </div>

            <div className="border-t border-line/70 bg-white/60 p-5">
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

          <div className="bg-slate-50/52 p-5">
            <h2 className="text-sm font-semibold text-ink">Workspace Signals</h2>
            {contextQuery.isPending ? (
              <LoadingState text="正在加载上下文..." className="mt-4" />
            ) : contextQuery.isError ? (
              <ErrorState text="上下文加载失败。" className="mt-4" />
            ) : (
              <div className="mt-4 space-y-3">
                <div className="rounded-2xl border border-line bg-surface p-4">
                  <p className="text-xs text-muted">Current Course</p>
                  <p className="mt-1 truncate font-medium text-ink">{course?.name || '未选择课程'}</p>
                </div>
                <div className="rounded-2xl border border-line bg-surface p-4">
                  <p className="text-xs text-muted">Today</p>
                  <p className="mt-1 font-medium text-ink">
                    {behavior?.taskSummary?.completed || 0}/{behavior?.taskSummary?.total || 0} tasks ·{' '}
                    {behavior?.focusSummary?.minutes || 0}m
                  </p>
                </div>
                <div className="rounded-2xl border border-line bg-surface p-4">
                  <p className="text-xs text-muted">Knowledge</p>
                  <p className="mt-1 font-medium text-ink">
                    {knowledge?.weakTopics?.length || 0} weak · {knowledge?.strongTopics?.length || 0} strong
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      <LearningPanels context={context} />
    </div>
  )
}
