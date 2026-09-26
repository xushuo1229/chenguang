const DAY_MS = 86_400_000
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export function todayKey(date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

export function isValidDateKey(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false
  const year = Number(value.slice(0, 4))
  const month = Number(value.slice(5, 7))
  const day = Number(value.slice(8, 10))
  if (year < 1970 || month < 1 || month > 12 || day < 1 || day > 31) {
    return false
  }
  const date = new Date(year, month - 1, day)
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  )
}

function parseDate(key: string): Date {
  return new Date(
    Number(key.slice(0, 4)),
    Number(key.slice(5, 7)) - 1,
    Number(key.slice(8, 10)),
  )
}

export function dayDiff(a: string, b: string): number {
  return Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / DAY_MS)
}

export function dateWeekday(key: string): number {
  const date = new Date(`${String(key ?? '').slice(0, 10)}T00:00:00`)
  if (Number.isNaN(date.getTime())) return -1
  return (date.getDay() + 6) % 7
}

export function dateOffset(key: string, days: number): string {
  const date = new Date(`${String(key ?? '').slice(0, 10)}T00:00:00`)
  if (Number.isNaN(date.getTime())) return todayKey()
  date.setDate(date.getDate() + (Number(days) || 0))
  return todayKey(date)
}

export function mondayOf(key: string): string {
  return dateOffset(key, -dateWeekday(key))
}

export type WeeksInfo = {
  ranges: Array<[number, number]>
  parity: 0 | 1 | 2
}

export function weeksInfo(weeksStr: unknown): WeeksInfo {
  const normalized = String(weeksStr ?? '')
    .replace(/[０-９]/g, (char) =>
      String.fromCharCode(char.charCodeAt(0) - 0xfee0),
    )
    .replace(/[－—―–～~至到]/g, '-')
    .replace(/\s+/g, '')
    .toLowerCase()
  if (!normalized) return { ranges: [], parity: 0 }

  let parity: 0 | 1 | 2 = 0
  const parityMatch = /[（(]([单双])[)）]|([单双])周|(?:周)?([单双])$/.exec(
    normalized,
  )
  if (parityMatch) {
    parity = (parityMatch[1] || parityMatch[2] || parityMatch[3]) === '双'
      ? 2
      : 1
  }

  const ranges: Array<[number, number]> = []
  normalized
    .replace(/[()（）单双周]/g, '')
    .split(',')
    .forEach((segment) => {
      const part = segment.trim()
      if (!part) return
      const pieces = part.split('-')
      const start = parseInt(pieces[0], 10)
      const end =
        pieces.length > 1 ? parseInt(pieces[1], 10) : start
      if (Number.isNaN(start) || Number.isNaN(end)) return
      ranges.push([start, end < start ? start : end])
    })

  return { ranges, parity }
}

export function weeksContain(weeksStr: unknown, week: number): boolean {
  if (
    weeksStr === undefined ||
    weeksStr === null ||
    String(weeksStr).trim() === ''
  ) {
    return true
  }
  const weekNumber = Number(week)
  const info = weeksInfo(weeksStr)
  if (info.parity === 1 && weekNumber % 2 !== 1) return false
  if (info.parity === 2 && weekNumber % 2 !== 0) return false
  if (!info.ranges.length) return true
  return info.ranges.some(
    ([start, end]) => weekNumber >= start && weekNumber <= end,
  )
}

export function semesterWeekOf(key: string, semesterStart?: string): number {
  if (!semesterStart) return 0
  const start = new Date(`${String(semesterStart).slice(0, 10)}T00:00:00`)
  const date = new Date(`${String(key ?? '').slice(0, 10)}T00:00:00`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(date.getTime())) return 0
  const diffDays = Math.floor((date.getTime() - start.getTime()) / DAY_MS)
  if (diffDays < 0) return 0
  return Math.floor(diffDays / 7) + 1
}