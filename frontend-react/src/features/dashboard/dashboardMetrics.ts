import type { AgentContext } from '@/services/agentService'
import type { SyncSnapshot } from '@/services/analyticsService'

export type FocusTrendPoint = { date: string; value: number }

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function buildFocusTrend(snapshot: SyncSnapshot | undefined, windowDays = 14): FocusTrendPoint[] {
  const focusRecords = snapshot?.data?.focus || []
  const readingRecords = snapshot?.data?.readings || []
  const englishRecords = snapshot?.data?.english || []
  const recordsByDate = new Map<string, number>()

  const add = (records: Array<{ date?: string; minutes?: number }> | undefined) => {
    records?.forEach((record) => {
      if (!record.date) return
      const minutes = Number(record.minutes) || 0
      recordsByDate.set(record.date, (recordsByDate.get(record.date) || 0) + minutes)
    })
  }

  add(focusRecords)
  add(readingRecords)
  add(englishRecords)

  return Array.from({ length: windowDays }, (_, index) => {
    const date = dateKey(new Date(Date.now() - (windowDays - 1 - index) * 24 * 60 * 60 * 1000))
    return { date: date.slice(5), value: recordsByDate.get(date) || 0 }
  })
}

export function buildTaskCompletion(snapshot: SyncSnapshot | undefined) {
  const today = dateKey(new Date())
  const todos = (snapshot?.data?.todos || []).filter((todo) => todo.date === today)
  const total = todos.length
  const completed = todos.filter((todo) => todo.completed).length
  return { total, completed, rate: total ? completed / total : 0 }
}

export function buildGrowthIndex({
  snapshot,
  context,
}: {
  snapshot: SyncSnapshot | undefined
  context: AgentContext | undefined
}) {
  const task = buildTaskCompletion(snapshot)
  const behavior = context?.context?.behavior?.value
  const focusMinutes = behavior?.recent7?.focusMinutes || 0
  const focusScore = Math.min(1, focusMinutes / 420)
  const studyScore = Math.min(1, (behavior?.recent7?.studyActiveDays || 0) / 5)
  const score = Math.round((task.rate * 0.4 + focusScore * 0.35 + studyScore * 0.25) * 100)
  return score
}

export function buildKnowledgeCoverage(context: AgentContext | undefined) {
  const knowledge = context?.context?.knowledgeStates?.value
  const strong = knowledge?.strongTopics?.length || 0
  const weak = knowledge?.weakTopics?.length || 0
  const total = strong + weak
  return {
    strong,
    weak,
    total,
    coverage: total ? Math.round((strong / total) * 100) : 0,
  }
}
