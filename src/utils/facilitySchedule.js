import { addDays, format, parseISO, getDay } from 'date-fns'

/**
 * Given a recurring weekly series ({ dayOfWeek: 0-6 (Sun-Sat), startDate,
 * endDate | null }) and a target [fromDate, toDate] window (both
 * 'YYYY-MM-DD'), returns every 'YYYY-MM-DD' the series should have a
 * concrete slot on — clamped to whichever is later of the series' own
 * start and the requested window, and whichever is earlier of the series'
 * own end (if any) and the requested window.
 *
 * Pure and Firestore-free on purpose — generateSeriesSlots (firestore.js)
 * just diffs this list against what already exists for the series and
 * writes the gap, so calling this again ("Generate more") is always safe.
 */
export function generateSeriesDates(series, fromDate, toDate) {
  const rangeStart = series.startDate > fromDate ? series.startDate : fromDate
  const rangeEnd = series.endDate && series.endDate < toDate ? series.endDate : toDate
  if (rangeStart > rangeEnd) return []

  const dates = []
  let cursor = parseISO(rangeStart)
  // Advance to the first date on/after rangeStart that falls on the
  // series' weekday — at most 6 steps.
  while (getDay(cursor) !== series.dayOfWeek) cursor = addDays(cursor, 1)

  let cursorStr = format(cursor, 'yyyy-MM-dd')
  while (cursorStr <= rangeEnd) {
    dates.push(cursorStr)
    cursor = addDays(cursor, 7)
    cursorStr = format(cursor, 'yyyy-MM-dd')
  }
  return dates
}

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
