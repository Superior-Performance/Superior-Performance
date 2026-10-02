// Roster status rules for the coach's dashboard.
//
// Split out of AdminDashboardPage because it is pure date arithmetic with a
// nasty edge case, and pure date arithmetic is the kind of thing that breaks
// quietly six months later. See tests/schedule.test.mjs.

/**
 * The moment this athlete first had a chance to do anything.
 *
 * The earliest start date among the programs they are on now, falling back to
 * when the account was created for a program with no start date. Returns null
 * when neither is known, which callers must read as "can't say" rather than
 * "a long time ago".
 *
 * Noon rather than midnight, matching how dates are read elsewhere in the app:
 * a bare 'YYYY-MM-DD' parses as UTC midnight, which is the previous evening in
 * Central and shifts the day by one.
 */
export function opportunitySinceMs(activePrograms, athleteCreatedAtMs) {
  const starts = (activePrograms || [])
    .map(p => (p?.startDate ? new Date(`${p.startDate}T12:00:00`).getTime() : NaN))
    .filter(ms => !Number.isNaN(ms))
  if (starts.length) return Math.min(...starts)
  return athleteCreatedAtMs || null
}

/**
 * Has this athlete gone quiet?
 *
 * The bug this replaces: "no activity on record" was treated as identical to
 * "last active a very long time ago", so an athlete handed a program this
 * morning was immediately flagged red, on the same row that said "Not started
 * yet". A cohort set up on Friday for a Monday start showed the whole group as
 * Inactive all weekend. The coach's first screen was accusing people who had
 * done nothing wrong.
 *
 * Quiet is only meaningful once there has been something to be quiet about, so
 * with no activity the clock runs from when training could have begun. An
 * athlete whose program started three weeks ago and who has never logged
 * anything is still — correctly — inactive.
 */
export function isInactive(activePrograms, lastActivityMs, athleteCreatedAtMs, inactiveDays, now = Date.now()) {
  if (!activePrograms?.length) return false          // nothing to be inactive on
  const since = lastActivityMs || opportunitySinceMs(activePrograms, athleteCreatedAtMs)
  if (!since) return false                           // no basis to judge
  return now - since > inactiveDays * 86400000
}
