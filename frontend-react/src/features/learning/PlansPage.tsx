import { Link } from 'react-router-dom'
import { CalendarRange, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'

const planPrompts = [
  '根据我的课程和目标，帮我制定本周学习计划。',
  '帮我安排今天的学习时间块。',
  '考试临近，帮我做一个两周复习计划。',
]

export default function PlansPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold tracking-tight text-ink">Plans</h1>
        <p className="mt-0.5 text-[13px] text-ink-muted">
          学习计划由 Zeno 基于你的课程、目标与近期表现生成。
        </p>
      </div>

      <div className="rounded-card border border-line bg-surface p-8">
        <span className="grid size-10 place-items-center rounded-card bg-surface-muted text-ink-muted">
          <CalendarRange />
        </span>
        <h2 className="mt-4 text-sm font-semibold text-ink">用对话生成计划</h2>
        <p className="mt-1 max-w-md text-[13px] leading-5 text-ink-muted">
          计划功能以 Agent 对话的形式提供：告诉 Zeno 你的时间安排与目标，它会给出可确认执行的计划。
          确认后的任务会写入你的今日计划。
        </p>
        <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {planPrompts.map((prompt) => (
            <Link
              key={prompt}
              to={`/agent?q=${encodeURIComponent(prompt)}`}
              className="rounded-card border border-line bg-surface px-3.5 py-3 text-left text-[13px] leading-5 text-ink-secondary transition-colors hover:border-primary hover:text-primary"
            >
              {prompt}
            </Link>
          ))}
        </div>
        <Button asChild size="sm" className="mt-5">
          <Link to={`/agent?q=${encodeURIComponent(planPrompts[0])}`}>
            <Sparkles className="size-4" />
            开始生成计划
          </Link>
        </Button>
      </div>
    </div>
  )
}
