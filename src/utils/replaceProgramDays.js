import { DAY_TYPES, LIFTING_DAY_TYPES } from '../constants/programTypes.js'
import { dayTypeDayNums, normalizeTrainingDays } from './trainingDays.js'

/**
 * Move an already-built program's days onto a different set of training days.
 *
 * Training days are normally applied when a program is pulled from the sheet,
 * which means deciding a pool's schedule after its programs exist would
 * otherwise do nothing to them. This re-runs that placement over a program
 * that already exists, using each day's `dayType` to work out where it belongs
 * — the same mapping the pull uses, so a re-placed program is indistinguishable
 * from one pulled with those days set from the start.
 *
 * Two deliberate constraints, both about not corrupting history:
 *
 *  - **The days array is never reordered, only renumbered.** Completions are
 *    normally keyed by exercise id and so survive anything, but there is a
 *    legacy fallback keyed by (week, day, exercise) POSITION — see keyForWrite
 *    in programIds. Renumbering in place keeps every index stable, so old
 *    completion documents keep pointing at the exercises they were recorded
 *    against instead of silently sliding onto different work.
 *
 *  - **A program with days that carry no day type is refused outright**, not
 *    partially moved. An untyped day has no principled new position: the only
 *    honest options are to invent one or to leave it where it is while
 *    everything around it moves, and the second quietly produces a week the
 *    coach never designed. Better to decline and say so.
 *
 * Days carrying no exercises don't block the operation — they're padding — but
 * they still get an explicit, unused day number so they can't collide with a
 * day that just moved onto their old slot. A collision is not cosmetic:
 * dayIndexFor matches the FIRST day with a given number, so a stray empty day
 * sitting on an occupied number makes the real day's work unreachable.
 *
 * Pure: returns a new weeks array and never touches Firestore, so the caller
 * can count what would change before committing to anything.
 */
export function replaceProgramDays(program, trainingDays) {
  const chosen = normalizeTrainingDays(trainingDays)
  if (!chosen.length) return { ok: false, reason: 'no-training-days' }

  const weeks = program?.weeks || []
  if (!weeks.length) return { ok: false, reason: 'no-weeks' }

  const typeList = (program?.programType === 'lifting' ? LIFTING_DAY_TYPES : DAY_TYPES)
  const placement = dayTypeDayNums(typeList.map(dt => dt.key), chosen)

  const knownType = (day) => day?.dayType && placement[day.dayType] != null
  const hasWork = (day) => (day?.exercises?.length || 0) > 0

  let typedWithWork = 0
  let untypedWithWork = 0
  weeks.forEach(week => (week.days || []).forEach(day => {
    if (!hasWork(day)) return
    if (knownType(day)) typedWithWork++
    else untypedWithWork++
  }))

  if (untypedWithWork) return { ok: false, reason: 'untyped-days', untypedDays: untypedWithWork }
  if (!typedWithWork) return { ok: false, reason: 'no-day-types' }

  let moved = 0
  const nextWeeks = weeks.map(week => {
    const days = week.days || []
    // Numbers claimed by placed days in THIS week, so the padding days below
    // can be given something that isn't one of them.
    const claimed = new Set(days.filter(knownType).map(d => placement[d.dayType]))
    const spare = [1, 2, 3, 4, 5, 6, 7].filter(n => !claimed.has(n))

    return {
      ...week,
      days: days.map((day, i) => {
        const current = day?.dayNum ?? i + 1
        const next = knownType(day) ? placement[day.dayType] : spare.shift()
        if (next == null || next === current) return day
        if (knownType(day)) moved++
        return { ...day, dayNum: next }
      }),
    }
  })

  if (!moved) return { ok: false, reason: 'unchanged' }
  return { ok: true, weeks: nextWeeks, moved }
}

/** Why a program was left alone, in words a coach can act on. */
export function skipReasonText(reason, extra = {}) {
  switch (reason) {
    case 'no-training-days': return 'the pool has no training days set'
    case 'no-weeks':         return 'it has no weeks yet'
    case 'no-day-types':     return 'none of its days are tagged with a day type'
    case 'untyped-days':     return `${extra.untypedDays} of its days aren't tagged with a day type`
    case 'unchanged':        return 'it already sits on these days'
    default:                 return 'it could not be placed'
  }
}
