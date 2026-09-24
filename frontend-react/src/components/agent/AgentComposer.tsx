import { useRef } from 'react'
import { ArrowUp, Loader2, Paperclip, Sparkles } from 'lucide-react'
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

export function AgentComposer({ value, mode, busy, onChange, onModeChange, onSubmit }: AgentComposerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {quickPrompts.map((prompt) => (
          <button
            key={prompt}
            type="button"
            disabled={busy}
            className="rounded-full border border-line bg-surface px-3.5 py-2 text-sm text-muted transition-colors hover:border-primary/40 hover:text-primary disabled:opacity-50"
            onClick={() => onChange(prompt)}
          >
            {prompt}
          </button>
        ))}
      </div>

      <form
        className="surface-card p-3"
        onSubmit={(event) => {
          event.preventDefault()
          onSubmit()
        }}
      >
        <div className="flex items-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={() => fileInputRef.current?.value && onChange((value ? `${value}\n` : '') + '[附件已选择：文件内容尚未接入 Agent 上下文]')}
          />
          <Button type="button" variant="ghost" size="icon" aria-label="上传文件" disabled={busy} onClick={() => fileInputRef.current?.click()}>
            <Paperclip className="size-4" />
          </Button>
          <textarea
            rows={1}
            value={value}
            disabled={busy}
            placeholder="输入问题，例如：我今天该推进什么？"
            className="max-h-36 min-h-11 flex-1 resize-none bg-transparent px-1 py-2.5 text-sm text-ink outline-none placeholder:text-slate-400"
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                onSubmit()
              }
            }}
          />
          <Button type="submit" size="icon" disabled={busy || !value.trim()} aria-label="发送">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
          </Button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
          {(['personal', 'general'] as const).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => onModeChange(item)}
              className={cn(
                'rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors',
                mode === item ? 'bg-primary text-white' : 'bg-slate-100 text-muted hover:text-ink',
              )}
            >
              {item === 'personal' ? 'Personal Agent' : 'General AI'}
            </button>
          ))}
          <span className="ml-auto flex items-center gap-1 text-xs text-muted">
            <Sparkles className="size-3" /> Evidence Bound
          </span>
        </div>
      </form>
    </div>
  )
}
