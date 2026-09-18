// Pure-logic tests for the calendar: how a program's weeks map onto dates,
// what each day holds per program type, and how close a program is to the
// document-size cap. No emulator, no browser — run with `npm run test:unit`.
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const { computeTodayPosition, dayStatsByType, dayCountForWeek } = await import(`${ROOT}src/utils/programSchedule.js`)
const { compactWeeks, estimateBytes, sizeStatus, FIRESTORE_DOC_LIMIT } = await import(`${ROOT}src/utils/programSize.js`)
const { matchesGroupFilter, groupsOf, suggestGroupColor, ALL_GROUPS, UNGROUPED } = await import(`${ROOT}src/constants/athleteGroups.js`)

let failures = 0
function t(name, fn) {
  try { fn(); console.log('ok  ', name) } catch (e) { failures++; console.log('FAIL', name, '-', e.message) }
}
const eq = (a, b, msg) => {
  const [x, y] = [JSON.stringify(a), JSON.stringify(b)]
  if (x !== y) throw new Error(`${msg || ''} expected ${y}, got ${x}`)
}

// Dates are fixed rather than relative to "now" so these don't drift.
const daysAgo = (n) => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

const prog = (id, type, days) => ({
  id, programType: type,
  weeks: [{ weekNum: 1, days }],
})
const day = (dayNum, exercises) => ({ dayNum, exercises })
const ex = (id) => ({ id, name: 'drill ' + id })

// ── where today lands ────────────────────────────────────────────────────────
t('day 1 of week 1 is the start date', () => {
  const pos = computeTodayPosition([{ startDate: daysAgo(0) }], 4)
  eq([pos.weekIdx, pos.dayNum], [0, 1])
})
t('day 8 rolls into week 2', () => {
  const pos = computeTodayPosition([{ startDate: daysAgo(7) }], 4)
  eq([pos.weekIdx, pos.dayNum], [1, 1])
})
t('mid-week lands on the right day', () => {
  const pos = computeTodayPosition([{ startDate: daysAgo(10) }], 4)
  eq([pos.weekIdx, pos.dayNum], [1, 4])
})
t('a start date in the future is flagged, not clamped into week 1', () => {
  const pos = computeTodayPosition([{ startDate: daysAgo(-3) }], 4)
  eq(pos.notStartedYet, true)
})
t('past the last week is flagged and clamped to the final week', () => {
  const pos = computeTodayPosition([{ startDate: daysAgo(70) }], 4)
  eq([pos.pastProgram, pos.weekIdx], [true, 3])
})
t('no start date falls back without a crash', () => {
  const pos = computeTodayPosition([{}], 4)
  eq(pos.hasStart, false)
})

// ── what's on a day, per type ────────────────────────────────────────────────
const programs = [
  prog('p-pre', 'correctives', [day(1, [ex('a'), ex('b')]), day(2, [])]),
  prog('p-throw', 'throwing', [day(1, [ex('c')]), day(2, [ex('d')])]),
  prog('p-lift', 'lifting', [day(1, [ex('e')])]),
]

t('a day lists every type scheduled on it', () => {
  const stats = dayStatsByType(programs, {}, 0, 0)
  eq(stats.map(s => s.type), ['correctives', 'throwing'])
})
t('lifting never colours a calendar day (its dayNum is a bucket, not a date)', () => {
  eq(dayStatsByType(programs, {}, 0, 0).some(s => s.type === 'lifting'), false)
})
t('types are returned in PROGRAM_TYPES order, not program order', () => {
  const reversed = [programs[1], programs[0]]
  eq(dayStatsByType(reversed, {}, 0, 0).map(s => s.type), ['correctives', 'throwing'])
})
t('a type with no work that day is left out', () => {
  eq(dayStatsByType(programs, {}, 0, 1).map(s => s.type), ['throwing'])
})
t('completions count toward the right type only', () => {
  const stats = dayStatsByType(programs, { 'p-pre_a': { completed: true } }, 0, 0)
  eq(stats.find(s => s.type === 'correctives'), { type: 'correctives', total: 2, done: 1 })
  eq(stats.find(s => s.type === 'throwing').done, 0)
})
t('a fully done type reports done === total', () => {
  const stats = dayStatsByType(programs, { 'p-throw_c': { completed: true } }, 0, 0)
  eq(stats.find(s => s.type === 'throwing'), { type: 'throwing', total: 1, done: 1 })
})
t('an empty day returns nothing to colour', () => {
  eq(dayStatsByType([prog('p', 'throwing', [day(1, [])])], {}, 0, 0), [])
})
t('dayCountForWeek takes the longest program', () => {
  eq(dayCountForWeek(programs, 0), 2)
})

// ── document size ────────────────────────────────────────────────────────────
t('compactWeeks drops empty fields but keeps identity', () => {
  const [week] = compactWeeks([{
    weekNum: 1,
    days: [{ dayNum: 1, category: '', exercises: [{ id: 'x', name: 'Push-up', notes: '', sets: '3', videoUrl: undefined }] }],
  }])
  eq(week.days[0].exercises[0], { id: 'x', name: 'Push-up', sets: '3' })
  eq(week.days[0].dayNum, 1, 'dayNum survives')
})
t('compactWeeks keeps a zero, which is a real value', () => {
  const [week] = compactWeeks([{ weekNum: 1, days: [{ dayNum: 1, blockSlot: 0, exercises: [] }] }])
  eq(week.days[0].blockSlot, 0)
})
t('compaction actually shrinks a sparse program', () => {
  const weeks = [{
    weekNum: 1,
    days: Array.from({ length: 7 }, (_, d) => ({
      dayNum: d + 1, category: '',
      exercises: Array.from({ length: 20 }, (_, i) => ({ id: `e${d}${i}`, name: 'Drill', sets: '', reps: '', intensity: '', notes: '', videoUrl: '' })),
    })),
  }]
  const before = estimateBytes(weeks)
  const after = estimateBytes(compactWeeks(weeks))
  if (after >= before) throw new Error(`no saving: ${before} -> ${after}`)
})
t('size status crosses over at the Firestore limit', () => {
  eq(sizeStatus(0), 'ok')
  eq(sizeStatus(Math.floor(FIRESTORE_DOC_LIMIT * 0.8)), 'warn')
  eq(sizeStatus(FIRESTORE_DOC_LIMIT), 'over')
})
t('estimateBytes counts a string as its bytes plus one', () => {
  // {a: 'hi'} -> key 'a' (1+1) + value 'hi' (2+1) = 5
  eq(estimateBytes({ a: 'hi' }), 5)
})

// ── roster groups ────────────────────────────────────────────────────────────
const camp = { id: 'g-camp', name: 'Winter Camp', color: 'blue' }
const team = { id: 'g-team', name: 'Travel Team', color: 'purple' }
const groups = [camp, team]
const inBoth = { id: 'a1', groupIds: ['g-camp', 'g-team'] }
const campOnly = { id: 'a2', groupIds: ['g-camp'] }
const unfiled = { id: 'a3' }

t('all-athletes filter matches everyone, filed or not', () => {
  eq([inBoth, campOnly, unfiled].every(a => matchesGroupFilter(a, ALL_GROUPS)), true)
})
t('a group filter matches only its members', () => {
  eq([matchesGroupFilter(inBoth, 'g-camp'), matchesGroupFilter(campOnly, 'g-camp'), matchesGroupFilter(unfiled, 'g-camp')], [true, true, false])
})
t('an athlete in two groups shows up under each', () => {
  eq([matchesGroupFilter(inBoth, 'g-camp'), matchesGroupFilter(inBoth, 'g-team')], [true, true])
})
t('ungrouped finds exactly the unfiled', () => {
  eq([matchesGroupFilter(unfiled, UNGROUPED), matchesGroupFilter(campOnly, UNGROUPED)], [true, false])
})
t('an empty groupIds array still counts as ungrouped', () => {
  eq(matchesGroupFilter({ id: 'a4', groupIds: [] }, UNGROUPED), true)
})
t('a membership pointing at a deleted group shows no chip', () => {
  eq(groupsOf({ groupIds: ['g-gone'] }, groups), [])
})
t('chips come back in group order, not membership order', () => {
  eq(groupsOf({ groupIds: ['g-team', 'g-camp'] }, groups).map(g => g.id), ['g-camp', 'g-team'])
})
t('a new group is offered a colour nothing else uses', () => {
  const next = suggestGroupColor(groups)
  eq(groups.some(g => g.color === next), false)
})

console.log(failures ? `\n${failures} FAILED` : '\nall passed')
process.exit(failures ? 1 : 0)
