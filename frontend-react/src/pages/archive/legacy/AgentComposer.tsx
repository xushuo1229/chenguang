import { useEffect, useRef } from 'react'
import { ArrowUp, Loader2, Paperclip, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const quickPrompts = [
  '我今天该推进什么？',
  '我的学习趋势怎么样？',
  '哪些知识需要优先复习？',
  '为什么最近专注下降了？',
]

type AgentComposerProps = {
  value: string
  mode: 'personal' | 'general'
  busy: boolean
  onChange: (value: string) => void
  onModeChange: (mode: 'personal' | 'general') => void
  onSubmit: () => void
}

const modes = [
  { id: 'personal', label: 'Personal Agent' },
  { id: 'general', label: 'General AI' },
] as const

export function AgentComposer({
  value,
  mode,
  busy,
  onChange,
  onModeChange,
  onSubmit,
}: AgentComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = 'auto'
    textarea.style.height = `${Math.min(textarea.scrollHeight, 144)}px`
  }, [value])

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap gap-1.5">
        {quickPrompts.map((prompt) => (
          <button
            key={prompt}
            type="button"
            disabled={busy}
            className="rounded-full border border-line bg-surface px-3 py-1.5 text-xs text-ink-muted transition-colors hover:border-primary/40 hover:text-primary disabled:opacity-50"
            onClick={() => onChange(prompt)}
          >
            {prompt}
          </button>
        ))}
      </div>

      <form
        className="rounded-card border border-line bg-surface shadow-sm transition-colors focus-within:border-primary/50"
        onSubmit={(event) => {
          event.preventDefault()
          onSubmit()
        }}
      >
        <div className="flex items-end gap-1.5 px-2.5 pt-2.5">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="上传附件（即将上线）"
            title="附件功能即将上线"
            disabled
            className="text-ink-faint"
          >
            <Paperclip className="size-4" />
          </Button>
          <textarea
            ref={textareaRef}
            rows={1}
            value={value}
            disabled={busy}
            placeholder="向 Zeno 提问…"
            className="max-h-36 min-h-9 min-w-0 flex-1 resize-none self-center bg-transparent px-1 py-2 text-sm leading-6 text-ink outline-none placeholder:text-ink-faint"
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                onSubmit()
              }
            }}
          />
          <Button
            type="submit"
            size="icon"
            disabled={busy || !value.trim()}
            aria-label="发送"
            className="mb-0.5"
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ArrowUp className="size-4" />
            )}
          </Button>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-line px-2.5 py-2">
          <div
            role="tablist"
            aria-label="Agent 模式"
            className="flex rounded-control bg-surface-muted p-0.5"
          >
            {modes.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={mode === item.id}
                onClick={() => onModeChange(item.id)}
                className={cn(
                  'rounded-[5px] px-2.5 py-1 text-xs font-medium transition-colors',
                  mode === item.id
                    ? 'bg-surface text-ink shadow-sm'
                    : 'text-ink-muted hover:text-ink-secondary',
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
          <span className="flex items-center gap-1 text-[11px] text-ink-faint">
            <ShieldCheck className="size-3" />
            AI 只读 · 写入需确认
          </span>
        </div>
      </form>
    </div>
  )
}
