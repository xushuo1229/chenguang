import type {
  CgUser,
  CourseRecord,
  CourseSlot,
} from '@/services/analyticsService'
import { dateWeekday, weeksContain } from './cgDate'

const MAX_PERIOD = 20

const WEEKDAY_CN: Record<string, number> = {
  一: 0,
  二: 1,
  三: 2,
  四: 3,
  五: 4,
  六: 5,
  日: 6,
  天: 6,
}

function weekdayCN(value: string): number {
  const text = String(value ?? '').trim()
  if (text in WEEKDAY_CN) return WEEKDAY_CN[text]
  if (/^\d$/.test(text)) {
    const number = parseInt(text, 10) - 1
    return number >= 0 && number <= 6 ? number : NaN
  }
  return NaN
}

type LegacyTime = { weekday: number; periods: number[] } | null

function parseLegacyTime(timeStr: unknown): LegacyTime {
  const source = String(timeStr ?? '').trim()
  if (!source) return null
  const match = /(?:星期|礼拜|周)\s*(?:第)?\s*([一二三四五六日天\d])/.exec(
    source,
  )
  if (!match) return null
  const weekday = weekdayCN(match[1])
  if (Number.isNaN(weekday)) return null

  const stripped = source.replace(
    /(?:星期|礼拜|周)\s*[一二三四五六日天\d]/g,
    ' ',
  )
  const periodMatch =
    /第?\s*([0-9一二三四五六七八九十]+(?:[-~,，、]|[-\s])\s*[0-9一二三四五六七八九十]+|[0-9一二三四五六七八九十]+)\s*(?:[大]?节)?/.exec(
      stripped,
    )
  if (!periodMatch) return { weekday, periods: [] }

  const segments = periodMatch[1]
    .replace(/[～~至]/g, '-')
    .split(/[,\s]+/)
  const numbers: number[] = []
  segments.forEach((item) => {
    const cleaned = item.replace(/[^0-9-]/g, '')
    const pieces = cleaned.split('-')
    const start = parseInt(pieces[0], 10) || 0
    if (!start) return
    let end = pieces.length > 1 ? parseInt(pieces[1], 10) || start : start
    if (end < start) end = start
    if (end - start > 15) end = start
    for (let period = start; period <= end; period++) {
      if (period >= 1 && period <= MAX_PERIOD && !numbers.includes(period)) {
        numbers.push(period)
      }
    }
  })
  numbers.sort((a, b) => a - b)
  return { weekday, periods: numbers }
}

export type NormalizedSlot = {
  weekday: number
  periods: number[]
  weeks: string
  startTime: string
  endTime: string
}

function normalizeSlot(slot: CourseSlot | undefined): NormalizedSlot {
  const source = slot && typeof slot === 'object' ? slot : {}
  let weekday = Number(source.weekday)
  if (Number.isNaN(weekday) || weekday < 0 || weekday > 6) weekday = -1
  const rawPeriods = Array.isArray(source.periods)
    ? source.periods
    : source.period !== undefined
      ? [source.period]
      : []
  const periods = Array.from(
    new Set(
      rawPeriods
        .map((period) => Number(period))
        .filter((period) => period >= 1 && period <= MAX_PERIOD),
    ),
  ).sort((a, b) => a - b)
  return {
    weekday,
    periods,
    weeks: source.weeks != null ? String(source.weeks) : '',
    startTime: source.startTime != null ? String(source.startTime) : '',
    endTime: source.endTime != null ? String(source.endTime) : '',
  }
}

export type NormalizedCourse = Omit<CourseRecord, 'slots'> & {
  name: string
  slots: NormalizedSlot[]
  weeks: string
  location: string
}

export function normalizeCourse(course: CourseRecord): NormalizedCourse {
  const out: CourseRecord = { ...course }
  out.name = String(out.name ?? '').trim()
  let slots = Array.isArray(out.slots) ? out.slots.slice() : []

  if (slots.length === 0 && Array.isArray(course.schedule)) {
    slots = course.schedule.slice()
  }
  if (slots.length === 0 && course.time) {
    const legacy = parseLegacyTime(course.time)
    if (legacy && legacy.weekday >= 0 && legacy.periods.length) {
      slots = [
        {
          weekday: legacy.weekday,
          periods: legacy.periods,
          weeks: out.weeks ?? '',
        },
      ]
    }
  }

  let normalizedSlots = slots.map(normalizeSlot)
  if (out.weeks || out.location) {
    normalizedSlots = normalizedSlots.map((slot) => {
      if (slot.weeks) return slot
      return { ...slot, weeks: String(out.weeks ?? '') }
    })
  }

  return {
    ...out,
    name: out.name,
    slots: normalizedSlots,
    weeks: out.weeks ?? '',
    location: out.location ?? '',
  }
}

export type WeeklyCourseItem = {
  course: NormalizedCourse
  slot: NormalizedSlot
}

export type WeeklyDay = {
  weekday: number
  items: WeeklyCourseItem[]
}

export function getWeeklyCourses(
  courses: CourseRecord[] | undefined,
  week: number,
): WeeklyDay[] {
  const weekNumber = Number(week) || 0
  const days: WeeklyDay[] = Array.from({ length: 7 }, (_, weekday) => ({
    weekday,
    items: [],
  }))
  if (!Array.isArray(courses)) return days

  courses.forEach((raw) => {
    const course = normalizeCourse(raw)
    if (course.slots.length === 0) return
    course.slots.forEach((slot) => {
      if (slot.weekday < 0 || slot.weekday > 6) return
      if (weekNumber > 0 && !weeksContain(slot.weeks, weekNumber)) return
      days[slot.weekday].items.push({ course, slot })
    })
  })

  days.forEach((day) => {
    day.items.sort((a, b) => {
      const firstA = a.slot.periods.length ? a.slot.periods[0] : 99
      const firstB = b.slot.periods.length ? b.slot.periods[0] : 99
      return firstA - firstB
    })
  })
  return days
}

export function hasCourseOn(
  courses: CourseRecord[] | undefined,
  key: string,
  user: Pick<CgUser, 'currentWeek' | 'semesterStart'>,
): boolean {
  const week = Number(user.currentWeek) > 0
    ? Number(user.currentWeek)
    : semesterWeekOfLocal(key, user.semesterStart)
  const weekday = dateWeekday(key)
  if (weekday < 0) return false
  return getWeeklyCourses(courses, week)[weekday].items.length > 0
}

function semesterWeekOfLocal(key: string, start?: string): number {
  if (!start) return 0
  const DAY = 86_400_000
  const startDate = new Date(`${String(start).slice(0, 10)}T00:00:00`)
  const date = new Date(`${String(key).slice(0, 10)}T00:00:00`)
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(date.getTime())) {
    return 0
  }
  const diff = Math.floor((date.getTime() - startDate.getTime()) / DAY)
  if (diff < 0) return 0
  return Math.floor(diff / 7) + 1
}
