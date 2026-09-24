import type { ReactNode } from 'react'
import { Compass, ShieldCheck, Sparkles } from 'lucide-react'

const principles = [
  {
    icon: Compass,
    title: '基于真实行为',
    text: '成长洞察只来自你的同步数据，不由 AI 编造',
  },
  {
    icon: Sparkles,
    title: 'AI 成长陪伴',
    text: 'Zeno 与你一起复盘、规划与提问',
  },
  {
    icon: ShieldCheck,
    title: '安全只读',
    text: 'AI 建议 → 你确认 → 才会写入',
  },
]

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh bg-background lg:grid-cols-2">
      <aside className="hidden flex-col justify-between border-r border-line bg-surface p-12 lg:flex">
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-control bg-primary text-primary-foreground">
            <svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden>
              <path
                d="M5 15c5 0 5-8 10-8 2.4 0 4 1.6 4 3.6"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
              <circle cx="5" cy="11" r="1.8" fill="currentColor" />
              <circle cx="19" cy="13.4" r="1.5" fill="currentColor" />
            </svg>
          </span>
          <div>
            <p className="text-sm font-semibold leading-tight text-ink">
              Zeno
            </p>
            <p className="text-[11px] text-ink-muted">AI Personal Growth OS</p>
          </div>
        </div>

        <div className="max-w-md space-y-8">
          <h1 className="text-3xl font-semibold leading-tight tracking-tight text-ink">
            让每一天的努力
            <br />
            都被看见、被理解
          </h1>
          <ul className="space-y-5">
            {principles.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex items-start gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-control bg-surface-muted text-ink-secondary">
                  <Icon className="size-4" />
                </span>
                <div>
                  <p className="text-sm font-medium text-ink">{title}</p>
                  <p className="mt-0.5 text-[13px] text-ink-muted">{text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex items-center justify-between text-[11px] text-ink-faint">
          <span>© 2026 Zeno</span>
          <span>Enterprise Workspace</span>
        </div>
      </aside>

      <main className="flex items-center justify-center px-5 py-10 sm:px-8">
        <div className="w-full max-w-[400px]">{children}</div>
      </main>
    </div>
  )
}
