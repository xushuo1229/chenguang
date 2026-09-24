import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { Compass, ShieldCheck, Sparkles } from 'lucide-react'

const principles = [
  { icon: Compass, title: '基于真实行为', text: '所有成长洞察只来自你的同步数据' },
  { icon: Sparkles, title: 'AI 成长陪伴', text: 'Zeno 与你一起复盘、规划和提问' },
  { icon: ShieldCheck, title: '安全只读', text: 'AI 建议 → 你确认 → 才会写入' },
]

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <aside className="hidden flex-col justify-between border-r border-line/60 bg-white/46 p-12 lg:flex">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-2xl bg-gradient-to-br from-primary to-secondary text-white shadow-lg shadow-primary/20">
            <Sparkles className="size-5" />
          </span>
          <div>
            <p className="text-sm font-bold text-ink">Zeno</p>
            <p className="text-xs text-muted">AI Personal Growth OS</p>
          </div>
        </div>

        <div className="space-y-8">
          <h1 className="text-4xl font-bold leading-tight tracking-tight text-ink">
            让每一天的努力
            <br />
            都被看见
          </h1>
          <div className="space-y-4">
            {principles.map(({ icon: Icon, title, text }) => (
              <div key={title} className="flex items-start gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="size-4" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-ink">{title}</p>
                  <p className="text-xs text-muted">{text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="text-xs text-muted">© 2026 Zeno · Personal Growth OS</p>
      </aside>

      <main className="flex items-center justify-center px-5 py-10 sm:px-8">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="w-full max-w-md"
        >
          {children}
        </motion.div>
      </main>
    </div>
  )
}
