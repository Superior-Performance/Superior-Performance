/**
 * Roster progress from a COUNT of completed exercises, not the documents.
 *
 * The dashboard only needs "what share of the work due so far is done" for
 * each athlete. Downloading every completion document to answer that cost
 * ~880 reads a load (about two thirds of the page); a server-side count
 * costs roughly one read per program.
 *
 * Approximate by construction, so it is for the roster only — the athlete's
 * own screens and the coach's athlete page still use the exact
 * countProgramProgress. Completion ids carry no week, so a count can't be
 * limited to the weeks elapsed, and it can't see either/or pairs or
 * exercises since deleted from a program. All three only ever push the
 * figure UP, and it is capped at 100, so the error is toward "on track"
 * rather than a false "Behind". Compared against the exact figure on
 * production data it matched 23 of 24 athletes; the other was 4 points high.
 */
import { computeTodayPosition } from './programSchedule.js'
import { buildSlots } from './programIds.js'

export function approxProgress(programs, doneCount) {
  if (!programs.length) return null
  const totalWeeks = Math.max(1, ...programs.map(p => p.weeks?.length || 0))
  const pos = computeTodayPosition(programs, totalWeeks)
  if (pos.notStartedYet) return null
  let total = 0
  programs.forEach(p => (p.weeks || []).forEach((week, wi) => {
    if (wi > pos.weekIdx) return
    ;(week.days || []).forEach(day => { total += buildSlots(day.exercises).length })
  }))
  return total ? Math.round((Math.min(doneCount, total) / total) * 100) : null
}
