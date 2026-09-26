import { useState } from 'react'
import { CalendarRange } from 'lucide-react'

const presets = [
  { days: 7, label: '近 7 天' },
  { days: 30, label: '近 30 天' },
  { days: 90, label: '近 90 天' },
]

export function RangeSelector({
  active,
  start,
  end,
  onPreset,
  onCustom,
}: {
  active: number | 'custom'
  start: string
  end: string
  onPreset: (days: number) => void
  onCustom: (start: string, end: string) => void
}) {
  const [customStart, setCustomStart] = useState(start)
  const [customEnd, setCustomEnd] = useState(end)

  const applyCustom = () => {
    if (customStart && customEnd && customStart <= customEnd) {
      onCustom(customStart, customEnd)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex rounded-control border border-line p-0.5">
        {presets.map((preset) => (
          <button
            key={preset.days}
            type="button"
            onClick={() => onPreset(preset.days)}
            className={`rounded-[5px] px-3 py-1.5 text-[13px] transition-colors ${
              active === preset.days
                ? 'bg-primary text-primary-foreground'
                : 'text-ink-secondary hover:bg-surface-muted'
            }`}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1.5 rounded-control border border-line px-2 py-1">
        <CalendarRange className="size-3.5 text-ink-faint" />
        <input
          type="date"
          value={customStart}
          onChange={(event) => setCustomStart(event.target.value)}
          aria-label="开始日期"
          className="bg-transparent text-[13px] text-ink outline-none"
        />
        <span className="text-ink-faint">–</span>
        <input
          type="date"
          value={customEnd}
          onChange={(event) => setCustomEnd(event.target.value)}
          aria-label="结束日期"
          className="bg-transparent text-[13px] text-ink outline-none"
        />
        <button
          type="button"
          onClick={applyCustom}
          className="ml-1 rounded-[5px] bg-surface-muted px-2 py-1 text-[13px] text-ink-secondary hover:bg-surface-subtle"
        >
          应用
        </button>
      </div>
    </div>
  )
}