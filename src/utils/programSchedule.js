import { buildSlots, isSlotComplete } from './programIds'

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
 * Current streak of fully-completed days, counting backward from yesterday
 * (today doesn't break a streak while it's still in progress), plus whether
 * today itself is already fully done. Days with nothing scheduled (rest
 * days) are skipped rather than breaking the streak.
 */
export function computeStreak(programs, completions, totalWeeks) {
  const pos = computeTodayPosition(programs, totalWeeks)

  function dayStats(wi, di) {
    let total = 0, done = 0
    programs.forEach(p => {
      const slots = buildSlots(p.weeks?.[wi]?.days?.[di]?.exercises)
      total += slots.length
      done += slots.filter(s => isSlotComplete(completions, p.id, s, wi, di)).length
    })
    return { total, done }
  }

  const dayCount = (wi) => Math.max(0, ...programs.map(p => p.weeks?.[wi]?.days?.length || 0))

  let streak = 0
  let wi = pos.weekIdx
  let di = pos.dayNum - 2 // the day before today, 0-indexed
  let stopped = false
  while (wi >= 0 && !stopped) {
    while (di >= 0) {
      const { total, done } = dayStats(wi, di)
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

  const todayStats = dayStats(pos.weekIdx, pos.dayNum - 1)
  const todayDone = todayStats.total > 0 && todayStats.done === todayStats.total
  if (todayDone) streak++

  return { streak, todayDone, todayTotal: todayStats.total, todayDoneCount: todayStats.done, pos }
}
