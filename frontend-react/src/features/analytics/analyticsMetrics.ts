import type {
  ChenguangData,
  CourseRecord,
} from '@/services/analyticsService'
import { getWeeklyCourses } from './courseSchedule'
import {
  dateOffset,
  dateWeekday,
  dayDiff,
  isValidDateKey,
  semesterWeekOf,
  todayKey,
} from './cgDate'

function array<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

function positive(value: unknown): number {
  const number = Number(value)
  return Number.isFinite(number) ? Math.max(0, number) : 0
}

function text(value: unknown): string {
  return value == null ? '' : String(value)
}

export type DayAggregation = {
  checkin: number
  english: number
  words: number
  focus: number
  focusSessions: number
  sports: number
  sportMinutes: number
  calories: number
  readings: number
  readingPages: number
  readingMinutes: number
  todoTotal: number
  todoDone: number
  activity: number
}

function blankDay(): DayAggregation {
  return {
    checkin: 0,
    english: 0,
    words: 0,
    focus: 0,
    focusSessions: 0,
    sports: 0,
    sportMinutes: 0,
    calories: 0,
    readings: 0,
    readingPages: 0,
    readingMinutes: 0,
    todoTotal: 0,
    todoDone: 0,
    activity: 0,
  }
}

function eachDay(start: string, end: string): string[] {
  let from = start
  let to = end
  if (from > to) {
    const swap = from
    from = to
    to = swap
  }
  const out: string[] = []
  let current = from
  let guard = 0
  while (current <= to && guard <= 3660) {
    out.push(current)
    current = dateOffset(current, 1)
    guard++
  }
  return out
}

function semesterWeek(data: ChenguangData, key: string): number {
  const user = data.user ?? {}
  if (Number(user.currentWeek) > 0) return Number(user.currentWeek)
  if (typeof user.semesterStart === 'string') {
    return semesterWeekOf(key, user.semesterStart)
  }
  return 0
}

function courseOnDay(data: ChenguangData, key: string): boolean {
  const courses = array<CourseRecord>(data.courses)
  if (courses.length === 0) return false
  const weekday = dateWeekday(key)
  if (weekday < 0) return false
  return getWeeklyCourses(courses, semesterWeek(data, key))[weekday].items
    .length > 0
}

function buildDayData(
  data: ChenguangData,
  start: string,
  end: string,
): Record<string, DayAggregation> {
  const map: Record<string, DayAggregation> = {}
  const inRange = (key: string) => key >= start && key <= end
  const ensure = (key: string) => {
    if (!map[key]) map[key] = blankDay()
    return map[key]
  }

  array<{ date?: string; status?: string }>(data.checkins).forEach((record) => {
    const key = text(record.date)
    if (!isValidDateKey(key) || !inRange(key)) return
    if (record.status === 'done' || record.status === 'completed') {
      ensure(key).checkin = 1
    }
  })

  array<{ date?: string; minutes?: number; words?: number }>(data.english)
    .forEach((record) => {
      const key = text(record.date)
      if (!isValidDateKey(key) || !inRange(key)) return
      const day = ensure(key)
      day.english += positive(record.minutes)
      day.words += positive(record.words)
    })

  array<{ date?: string; minutes?: number }>(data.focus).forEach((record) => {
    const key = text(record.date)
    if (!isValidDateKey(key) || !inRange(key)) return
    const day = ensure(key)
    day.focus += positive(record.minutes)
    day.focusSessions++
  })

  array<{
    date?: string
    duration?: number
    minutes?: number
    calories?: number
  }>(data.sports).forEach((record) => {
    const key = text(record.date)
    if (!isValidDateKey(key) || !inRange(key)) return
    const day = ensure(key)
    day.sports++
    day.sportMinutes += positive(record.duration ?? record.minutes)
    day.calories += positive(record.calories)
  })

  array<{ date?: string; pages?: number; minutes?: number }>(data.readings)
    .forEach((record) => {
      const key = text(record.date)
      if (!isValidDateKey(key) || !inRange(key)) return
      const day = ensure(key)
      day.readings++
      day.readingPages += positive(record.pages)
      day.readingMinutes += positive(record.minutes)
    })

  array<{ date?: string; done?: boolean }>(data.todos).forEach((record) => {
    const key = text(record.date)
    if (!isValidDateKey(key) || !inRange(key)) return
    const day = ensure(key)
    day.todoTotal++
    if (record.done) day.todoDone++
  })

  return map
}

function activityOf(day: DayAggregation, courseOn: boolean): number {
  let count = 0
  if (day.checkin) count++
  if (day.sports > 0) count++
  if (day.readings > 0) count++
  if (day.english > 0) count++
  if (day.focus > 0) count++
  if (day.todoDone > 0) count++
  if (courseOn) count++
  return count
}

type FilledDay = DayAggregation & { date: string }

function fillRange(
  data: ChenguangData,
  start: string,
  end: string,
): FilledDay[] {
  const dayData = buildDayData(data, start, end)
  return eachDay(start, end).map((key) => ({
    ...(dayData[key] ?? blankDay()),
    date: key,
  }))
}

function rateOf(done: number, total: number): number {
  return total > 0 ? Math.round((done / total) * 1000) / 10 : 0
}

export type Streaks = {
  currentStreak: number
  longestStreak: number
  lastDate: string | null
  todayDone: boolean
}

export function getStreaks(
  data: ChenguangData,
  today: string = todayKey(),
): Streaks {
  const set = new Set<string>()
  array<{ date?: string; status?: string }>(data.checkins).forEach((record) => {
    if (record.status !== 'done' && record.status !== 'completed') return
    const key = text(record.date)
    if (isValidDateKey(key) && key <= today) set.add(key)
  })
  const ordered = Array.from(set).sort()

  let longest = 0
  let currentRun = 0
  let previous: string | null = null
  ordered.forEach((key) => {
    currentRun = previous && dayDiff(previous, key) === 1 ? currentRun + 1 : 1
    if (currentRun > longest) longest = currentRun
    previous = key
  })

  const last = ordered[ordered.length - 1] ?? null
  const lastDiff = last ? dayDiff(last, today) : -1
  let current = 0
  if (last && lastDiff <= 1) {
    current = 1
    for (let i = ordered.length - 2; i >= 0; i--) {
      if (dayDiff(ordered[i], ordered[i + 1]) === 1) current++
      else break
    }
  }

  return {
    currentStreak: current,
    longestStreak: longest,
    lastDate: last,
    todayDone: lastDiff === 0,
  }
}

export type ActivityPoint = { date: string; count: number }

export function getActivityMap(
  data: ChenguangData,
  today: string = todayKey(),
): ActivityPoint[] {
  let min: string | null = null
  const keys: Array<'checkins' | 'english' | 'focus' | 'sports' | 'readings' | 'todos'> = [
    'checkins',
    'english',
    'focus',
    'sports',
    'readings',
    'todos',
  ]
  keys.forEach((collection) => {
    array<{ date?: string }>(data[collection]).forEach((record) => {
      const key = text(record.date)
      if (isValidDateKey(key) && key <= today && (!min || key < min)) min = key
    })
  })
  if (!min) return []

  return fillRange(data, min, today)
    .map((day) => ({
      date: day.date,
      count: activityOf(day, courseOnDay(data, day.date)),
    }))
    .filter((point) => point.count > 0)
}

export type StudySeriesPoint = {
  date: string
  focus: number
  reading: number
  english: number
}

export function buildStudySeries(
  data: ChenguangData,
  start: string,
  end: string,
): StudySeriesPoint[] {
  return fillRange(data, start, end).map((day) => ({
    date: day.date,
    focus: day.focus,
    reading: day.readingMinutes,
    english: day.english,
  }))
}

export type RangeSummary = {
  days: number
  activeDays: number
  checkinDays: number
  studyMinutes: number
  focusMinutes: number
  readingMinutes: number
  englishMinutes: number
  totalLearningMinutes: number
  focusSessions: number
  sportsCount: number
  sportsMinutes: number
  readingEntries: number
  readingPages: number
  todoTotal: number
  todoDone: number
  todoCompletionRate: number
  courseSessions: number
}

function scheduleStats(data: ChenguangData, start: string, end: string) {
  const names = new Set<string>()
  let sessions = 0
  eachDay(start, end).forEach((key) => {
    const weekday = dateWeekday(key)
    if (weekday < 0) return
    const days = getWeeklyCourses(
      array<CourseRecord>(data.courses),
      semesterWeek(data, key),
    )
    days[weekday].items.forEach((item) => {
      sessions++
      if (item.course.name) names.add(item.course.name)
    })
  })
  return { sessions, distinctCourses: names.size }
}

export function buildRangeSummary(
  data: ChenguangData,
  start: string,
  end: string,
): RangeSummary {
  const days = fillRange(data, start, end)
  const scheduled = scheduleStats(data, start, end)
  let activeDays = 0
  let checkinDays = 0
  let focusMinutes = 0
  let readingMinutes = 0
  let englishMinutes = 0
  let focusSessions = 0
  let sportsCount = 0
  let sportsMinutes = 0
  let readingEntries = 0
  let readingPages = 0
  let todoTotal = 0
  let todoDone = 0

  days.forEach((day) => {
    if (activityOf(day, courseOnDay(data, day.date)) > 0) activeDays++
    checkinDays += day.checkin
    focusMinutes += day.focus
    readingMinutes += day.readingMinutes
    englishMinutes += day.english
    focusSessions += day.focusSessions
    sportsCount += day.sports
    sportsMinutes += day.sportMinutes
    readingEntries += day.readings
    readingPages += day.readingPages
    todoTotal += day.todoTotal
    todoDone += day.todoDone
  })

  return {
    days: days.length,
    activeDays,
    checkinDays,
    studyMinutes: focusMinutes + englishMinutes,
    focusMinutes,
    readingMinutes,
    englishMinutes,
    totalLearningMinutes: focusMinutes + englishMinutes + readingMinutes,
    focusSessions,
    sportsCount,
    sportsMinutes,
    readingEntries,
    readingPages,
    todoTotal,
    todoDone,
    todoCompletionRate: rateOf(todoDone, todoTotal),
    courseSessions: scheduled.sessions,
  }
}

export type ComparisonItem = {
  id: string
  label: string
  direction: 'up' | 'down' | 'same'
  text: string
}

function compareNumber(
  id: string,
  label: string,
  current: number,
  previous: number,
  unit: string,
): ComparisonItem | null {
  if (current === 0 && previous === 0) return null
  const delta = Math.round((current - previous) * 10) / 10
  if (delta === 0) {
    return { id, label, direction: 'same', text: `${label}与上一周期持平（${current}${unit}）` }
  }
  const percent =
    previous > 0
      ? `，${Math.round(Math.abs(delta / previous) * 100)}%`
      : ''
  return {
    id,
    label,
    direction: delta > 0 ? 'up' : 'down',
    text: `${label}${delta > 0 ? '增加' : '减少'} ${Math.abs(delta)}${unit}${percent}`,
  }
}

export function buildPeriodComparison(
  data: ChenguangData,
  start: string,
  end: string,
): ComparisonItem[] {
  const length = dayDiff(start, end) + 1
  const previousEnd = dateOffset(start, -1)
  const previousStart = dateOffset(previousEnd, -(length - 1))
  if (previousStart < '1970-01-01') return []

  const current = buildRangeSummary(data, start, end)
  const previous = buildRangeSummary(data, previousStart, previousEnd)
  if (
    current.totalLearningMinutes === 0 &&
    previous.totalLearningMinutes === 0 &&
    current.todoTotal === 0 &&
    previous.todoTotal === 0
  ) {
    return []
  }

  return [
    compareNumber(
      'learning',
      '学习时长',
      current.totalLearningMinutes,
      previous.totalLearningMinutes,
      ' 分钟',
    ),
    compareNumber(
      'active',
      '有效学习日',
      current.activeDays,
      previous.activeDays,
      ' 天',
    ),
    compareNumber(
      'todo',
      '待办完成率',
      current.todoCompletionRate,
      previous.todoCompletionRate,
      '%',
    ),
  ].filter((item): item is ComparisonItem => item !== null)
}
