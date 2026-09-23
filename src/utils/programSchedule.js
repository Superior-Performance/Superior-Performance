import { buildSlots, isSlotComplete } from './programIds.js'
import { PROGRAM_TYPES } from '../constants/programTypes.js'

const PROGRAM_TYPE_ORDER = PROGRAM_TYPES.map(t => t.key)

/**
 * Where "today" falls inside a program's week/day grid.
 *
 * Programs carry an adjustable `startDate` — day 1 of week 1 (see
 * ProgramEditorModal) — so today's position is just how many calendar days
 * have passed since then. Shared by the Today tab (which day to show) and
 * the Progress tab (which week to anchor on, streak calculation).
 *
 * Falls back to today's real weekday at week 0 for programs that predate
 * `startDate` — best-effort, not calendar-accurate, but keeps old programs
 * from crashing rather than rendering nothing.
 */
export function computeTodayPosition(programs, totalWeeks) {
  const withStart = programs.find(p => p.startDate)
  if (!withStart) {
    const jsDay = new Date().getDay() // 0=Sun..6=Sat
    return { weekIdx: 0, dayNum: jsDay === 0 ? 7 : jsDay, hasStart: false, notStartedYet: false, pastProgram: false }
  }
  const start = new Date(`${withStart.startDate}T00:00:00`)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diffDays = Math.floor((today - start) / 86400000)
  const clampedDays = Math.max(0, diffDays)
  const weekIdx = Math.min(Math.floor(clampedDays / 7), Math.max(totalWeeks - 1, 0))
  const dayNum = (clampedDays % 7) + 1
  return {
    weekIdx,
    dayNum,
    hasStart: true,
    notStartedYet: diffDays < 0,
    pastProgram: Math.floor(diffDays / 7) >= totalWeeks,
    startDate: withStart.startDate,
  }
}

/**
 * The programs an athlete is actually following.
 *
 * `active` alone is NOT enough, and assuming it was put other athletes' work
 * on someone's schedule: the admin page's program list deliberately includes
 * the general library (templates carry `athleteId: null` and are created
 * active), because that page also offers them for assignment. A template is
 * not something this athlete is doing, so it has no business on their
 * schedule — one active pre-throw template showed up as a second pre-throw
 * program for every athlete in the gym.
 */
export function activeProgramsForAthlete(programs, athleteId) {
  return (programs || []).filter(p => p?.active && p.athleteId && p.athleteId === athleteId)
}

/**
 * The calendar date of a given week/day, or null when the program has no
 * startDate (older programs, and College Remote ones, which have no dates at
 * all by design).
 *
 * The inverse of computeTodayPosition: startDate + (week * 7) + (dayNum - 1).
 * Lived in three copies — the coach's month grid, the athlete's day strip and
 * the athlete's schedule page — which is three chances for them to disagree
 * about what date a day is.
 */
export function cellDate(startDate, weekIdx, dayNum) {
  if (!startDate) return null
  const start = new Date(`${startDate}T00:00:00`)
  if (Number.isNaN(start.getTime())) return null
  const d = new Date(start)
  d.setDate(d.getDate() + weekIdx * 7 + (dayNum - 1))
  return d
}

/**
 * Where the day numbered `dayNum` actually sits in a week's days array, or -1.
 *
 * These two are NOT the same thing, and assuming they were was a real bug:
 * buildProgramWeeksFromRows (utils/sheetPrograms) only creates an entry for
 * each day number the coach's sheet actually mentions, with no padding. A
 * Mon/Wed/Fri program is therefore three entries at positions 0, 1, 2 holding
 * dayNum 1, 3, 5 — so days[dayNum - 1] silently returns the wrong day, and the
 * athlete sees Wednesday's workout counted against Tuesday.
 *
 * The array position is still what legacy positional completion keys are built
 * from (see utils/programIds), so callers get the index back rather than the
 * day object: look the day up by its number, then key completions by where it
 * really sits.
 */
export function dayIndexFor(program, wi, dayNum) {
  const days = program?.weeks?.[wi]?.days
  if (!Array.isArray(days)) return -1
  return days.findIndex((d, i) => (d?.dayNum ?? i + 1) === dayNum)
}

/**
 * Current streak of fully-completed days, counting backward from yesterday
 * (today doesn't break a streak while it's still in progress), plus whether
 * today itself is already fully done. Days with nothing scheduled (rest
 * days) are skipped rather than breaking the streak.
 */
/**
 * How much of one day is scheduled and how much is done, summed across every
 * program the athlete is running that day.
 *
 * Exported because the day strip needs exactly this to mark a day complete,
 * partial, or missed — and a second implementation of "is this day done" would
 * be a place for the strip and the streak to quietly disagree.
 *
 * `total: 0` means nothing was scheduled: a rest day, not an unfinished one.
 */
export function dayStats(programs, completions, wi, di) {
  let total = 0, done = 0
  programs.forEach(p => {
    const idx = dayIndexFor(p, wi, di + 1)
    if (idx === -1) return
    const slots = buildSlots(p.weeks[wi].days[idx].exercises)
    total += slots.length
    done += slots.filter(s => isSlotComplete(completions, p.id, s, wi, idx)).length
  })
  return { total, done }
}

/**
 * Same day, broken out per program type — what the athlete actually has on
 * that date, so the schedule can colour a day by the work in it rather than
 * reducing everything to one dot.
 *
 * Lifting is deliberately excluded: a lift day is Upper/Lower, not a calendar
 * weekday, so its dayNum is a 1-4 bucket with no relationship to this date
 * (see LIFTING_DAY_TYPE_DAYNUM and LiftingBrowser). Including it would paint
 * lifting onto days it has nothing to do with.
 *
 * Returns one entry per type present that day, in PROGRAM_TYPES order, each
 * `{ type, total, done }`. A day with nothing scheduled returns [].
 */
export function dayStatsByType(programs, completions, wi, di) {
  const byType = new Map()
  programs.forEach(p => {
    const type = p.programType || 'correctives'
    if (type === 'lifting') return
    const idx = dayIndexFor(p, wi, di + 1)
    if (idx === -1) return
    const slots = buildSlots(p.weeks[wi].days[idx].exercises)
    if (slots.length === 0) return
    const entry = byType.get(type) || { type, total: 0, done: 0 }
    entry.total += slots.length
    entry.done += slots.filter(s => isSlotComplete(completions, p.id, s, wi, idx)).length
    byType.set(type, entry)
  })
  return PROGRAM_TYPE_ORDER.filter(t => byType.has(t)).map(t => byType.get(t))
}

/**
 * How many day slots a week spans — the highest day NUMBER present, not the
 * length of the days array. A Mon/Wed/Fri program stores three days carrying
 * dayNum 1, 3 and 5; asking for its length says "3" and the calendar then
 * stops at Wednesday, leaving Friday unreachable. Tuesday and Thursday come
 * back from dayStats as rest days, which is what they are.
 */
export function dayCountForWeek(programs, wi) {
  return Math.max(0, ...programs.map(p =>
    (p.weeks?.[wi]?.days || []).reduce((max, d, i) => Math.max(max, d?.dayNum ?? i + 1), 0)
  ))
}

export function computeStreak(programs, completions, totalWeeks) {
  const pos = computeTodayPosition(programs, totalWeeks)
  const stats = (wi, di) => dayStats(programs, completions, wi, di)
  const dayCount = (wi) => dayCountForWeek(programs, wi)

  let streak = 0
  let wi = pos.weekIdx
  let di = pos.dayNum - 2 // the day before today, 0-indexed
  let stopped = false
  while (wi >= 0 && !stopped) {
    while (di >= 0) {
      const { total, done } = stats(wi, di)
      if (total > 0) {
        if (done === total) streak++
        else { stopped = true; break }
      }
      di--
    }
    if (stopped) break
    wi--
    di = wi >= 0 ? dayCount(wi) - 1 : -1
  }

  const todayStats = stats(pos.weekIdx, pos.dayNum - 1)
  const todayDone = todayStats.total > 0 && todayStats.done === todayStats.total
  if (todayDone) streak++

  return { streak, todayDone, todayTotal: todayStats.total, todayDoneCount: todayStats.done, pos }
}
