import { addDays, format, parseISO, getDay } from 'date-fns'

/**
 * The Sunday-through-Saturday week 'YYYY-MM-DD' (a plain date, not a full
 * range) that contains the given date — used as a grouping key so the
 * athlete's Book page can bucket open slots into weeks. Deliberately its
 * own tiny function rather than date-fns' startOfWeek/endOfWeek directly:
 * those return Date objects in local time, and everything else in this
 * file (and the slot data itself) works in plain 'YYYY-MM-DD' strings, so
 * this keeps the string-in/string-out contract consistent everywhere.
 */
export function weekStartFor(dateStr) {
  const d = parseISO(dateStr)
  const sunday = addDays(d, -getDay(d)) // getDay: 0=Sun..6=Sat
  return format(sunday, 'yyyy-MM-dd')
}

export function weekEndFor(dateStr) {
  return format(addDays(parseISO(weekStartFor(dateStr)), 6), 'yyyy-MM-dd')
}

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

/**
 * Formats a stored 'HH:MM' (24h) time as a 12-hour clock time — e.g.
 * '16:00' -> '4:00 PM'. Slot times are entered and stored as plain local
 * wall-clock strings with no timezone attached (the facility has one
 * location), so there's no real conversion happening here, just a
 * readable format instead of military time.
 */
export function formatSlotTime(hhmm) {
  if (!hhmm) return ''
  const [h, m] = hhmm.split(':').map(Number)
  return format(new Date(2000, 0, 1, h, m), 'h:mm a')
}

/** '16:00', '17:00' -> '4:00 PM–5:00 PM CT' */
export function formatSlotTimeRange(startTime, endTime) {
  return `${formatSlotTime(startTime)}–${formatSlotTime(endTime)} CT`
}
