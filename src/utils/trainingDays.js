/**
 * Which weekdays an athlete actually trains on, and how a program's day
 * types land on them.
 *
 * Background. Two different things in this app are both called a "day
 * number", and conflating them is the bug this file exists to prevent:
 *
 *   - `dayNum` on a program day is an OFFSET FROM startDate. cellDate()
 *     computes startDate + (week * 7) + (dayNum - 1), so dayNum 1 is the
 *     start date itself, whatever weekday that happens to be.
 *   - The Outputs sheet's Day column, when it holds a weekday name, is
 *     mapped Monday=1 .. Sunday=7 (WEEKDAY_TO_NUM in sheetRows).
 *
 * Those two agree ONLY when a program's startDate is a Monday. That
 * assumption was implicit and unenforced; isMondayStart below makes it
 * checkable, and the admin program editor warns on it rather than silently
 * shifting an athlete's whole week by a day or two.
 *
 * Note this is a DIFFERENT numbering from facilitySchedule.js, which works
 * in JavaScript's native getDay() (Sunday=0 .. Saturday=6) because booking
 * slots come from date-fns. Never pass a number from one into the other.
 * Everything here is Monday=1 .. Sunday=7, to match dayNum.
 */

export const WEEKDAYS = [
  { num: 1, label: 'Monday',    short: 'Mon' },
  { num: 2, label: 'Tuesday',   short: 'Tue' },
  { num: 3, label: 'Wednesday', short: 'Wed' },
  { num: 4, label: 'Thursday',  short: 'Thu' },
  { num: 5, label: 'Friday',    short: 'Fri' },
  { num: 6, label: 'Saturday',  short: 'Sat' },
  { num: 7, label: 'Sunday',    short: 'Sun' },
]

const ALL_DAY_NUMS = WEEKDAYS.map(d => d.num)

/**
 * Clean a stored trainingDays array: keep whole numbers 1-7 only, drop
 * duplicates, sort ascending.
 *
 * Ascending order is not cosmetic — dayTypeDayNums below pairs the Nth day
 * type with the Nth training day, so the sort is what makes "High Intent"
 * land on the earliest training day of the week rather than wherever the
 * coach happened to tap first.
 */
export function normalizeTrainingDays(days) {
  const seen = new Set()
  ;(days || []).forEach(d => {
    const n = Number(d)
    if (Number.isInteger(n) && n >= 1 && n <= 7) seen.add(n)
  })
  return [...seen].sort((a, b) => a - b)
}

/** 'Mon, Tue, Thu, Fri' — for roster chips and the pool header. */
export function formatTrainingDays(days) {
  const nums = normalizeTrainingDays(days)
  if (!nums.length) return 'Not set'
  return nums.map(n => WEEKDAYS[n - 1].short).join(', ')
}

/**
 * The training days that apply to an athlete: their own if they have them,
 * otherwise inherited from the Premier pool they belong to, otherwise none.
 *
 * "Otherwise none" is deliberate rather than a hardcoded Mon/Wed/Fri
 * default. An empty result makes dayTypeDayNums fall back to exactly the
 * numbering this app used before training days existed, so an athlete
 * nobody has configured keeps behaving the way they do today instead of
 * having a schedule invented for them.
 *
 * An athlete's own setting wins over the pool's — that is the whole point
 * of "roughly the same schedule": the pool sets the shape, and one guy who
 * lifts Tuesdays because of a class can say so without leaving the pool.
 */
export function effectiveTrainingDays(athlete, groups = []) {
  const own = normalizeTrainingDays(athlete?.trainingDays)
  if (own.length) return own
  const memberOf = new Set(athlete?.groupIds || [])
  const pool = groups.find(g => memberOf.has(g.id) && normalizeTrainingDays(g.trainingDays).length)
  return pool ? normalizeTrainingDays(pool.trainingDays) : []
}

/**
 * Which dayNum each day type should occupy, given the athlete's training
 * days — e.g. with trainingDays [1,2,4,5] the four throwing day types land
 * on Mon/Tue/Thu/Fri instead of the consecutive 1/2/3/4 they used to.
 *
 * `dayTypeKeys` is in the authoring order the day types are declared in
 * (DAY_TYPES or LIFTING_DAY_TYPES) — the coach's intended progression
 * through the week, so pairing it positionally with the ascending training
 * days is what makes the week read correctly.
 *
 * Two fallbacks, both chosen so nothing silently collides:
 *   - No training days set at all: 1-based positions, byte-for-byte the old
 *     behaviour.
 *   - More day types than training days: the extras take the earliest
 *     weekdays nobody is training on. Overflow has to go somewhere, and a
 *     real rest day is a better place for it than on top of another day
 *     type, which would merge two sessions into one.
 */
export function dayTypeDayNums(dayTypeKeys, trainingDays) {
  const keys = dayTypeKeys || []
  const chosen = normalizeTrainingDays(trainingDays)
  if (!chosen.length) return Object.fromEntries(keys.map((k, i) => [k, i + 1]))

  const used = new Set(chosen)
  const spare = ALL_DAY_NUMS.filter(n => !used.has(n))
  const out = {}
  keys.forEach((key, i) => {
    out[key] = i < chosen.length ? chosen[i] : (spare.shift() ?? 7)
  })
  return out
}

/**
 * Is this program's startDate a Monday? See the header — the sheet's
 * weekday mapping assumes it is, and a Wednesday start shifts every named
 * weekday in the program by two days.
 *
 * Returns null for a missing or unparseable date rather than false, so a
 * caller can tell "no start date yet" apart from "starts on a Thursday"
 * and not warn about the former.
 */
export function isMondayStart(startDate) {
  if (!startDate) return null
  const d = new Date(`${startDate}T12:00:00`)
  if (Number.isNaN(d.getTime())) return null
  return d.getDay() === 1 // native getDay: 0=Sun..6=Sat
}
