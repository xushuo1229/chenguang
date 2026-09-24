import { motion } from 'framer-motion'
import { EmptyState } from '@/components/ui/state'

export type TrendPoint = {
  date: string
  value: number
  label?: string
}

export function TrendChart({ points }: { points: TrendPoint[] }) {
  if (!points.length) {
    return <EmptyState title="暂无趋势数据" description="记录专注或学习行为后会生成趋势。" />
  }

  const width = 640
  const height = 180
  const padding = 28
  const maxValue = Math.max(...points.map((point) => point.value), 30)
  const stepX = points.length > 1 ? (width - padding * 2) / (points.length - 1) : 0
  const coords = points.map((point, index) => ({
    x: padding + stepX * index,
    y: height - padding - (point.value / maxValue) * (height - padding * 2),
  }))
  const linePath = coords.map((coord, index) => `${index === 0 ? 'M' : 'L'} ${coord.x} ${coord.y}`).join(' ')
  const areaPath = `${linePath} L ${coords[coords.length - 1]?.x} ${height - padding} L ${coords[0]?.x} ${height - padding} Z`

  return (
    <div className="w-full overflow-hidden rounded-2xl bg-slate-50/70 p-4">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-48 w-full" role="img" aria-label="学习趋势图">
        <defs>
          <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6366f1" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {[0, 0.5, 1].map((ratio) => (
          <line key={ratio} x1={padding} x2={width - padding} y1={padding + ratio * (height - padding * 2)} y2={padding + ratio * (height - padding * 2)} stroke="#e2e8f0" />
        ))}
        <motion.path initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }} d={areaPath} fill="url(#trendFill)" />
        <motion.path
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          d={linePath}
          fill="none"
          stroke="#6366f1"
          strokeWidth="3"
          strokeLinecap="round"
        />
        {coords.map((coord, index) => (
          <circle key={points[index]?.date || index} cx={coord.x} cy={coord.y} r="4" fill="#fff" stroke="#6366f1" strokeWidth="2" />
        ))}
        <text x={padding} y={18} fontSize="12" fill="#64748b">{points[0]?.date}</text>
        <text x={width - padding} y={18} fontSize="12" textAnchor="end" fill="#64748b">{points[points.length - 1]?.date}</text>
      </svg>
    </div>
  )
}
