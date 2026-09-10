/**
 * Shared logic for pulling program content from the coach's Google Sheet and
 * turning it into a draft program doc — extracted out of
 * AdminAthleteDetail.jsx so both the single-athlete page and the roster's
 * bulk "Generate Programs" action call the exact same parsing/creation code
 * rather than maintaining two copies of the Week/Day parsing rules (this
 * codebase has a history of that parsing silently regressing when it drifts
 * between two call sites).
 *
 * Pure parsing helpers (parseWeekOrDayRange, buildProgramWeeksFromRows) take
 * no Firestore/network dependencies. The generate* functions do the network
 * fetch + Firestore write and are safe to call for one athlete at a time,
 * in a loop, from either the detail page or a bulk action.
 */
import { createProgram, deleteProgram, getProgramsForAthlete } from '../firebase/firestore'
import { DAY_TYPES, LIFTING_DAY_TYPES, matchDayType, matchLiftingDayType } from '../constants/programTypes'
import { makeExerciseId } from './programIds'

// Each day type's stable position in the draft's day grid — see
// buildProgramWeeksFromRows below.
const DAY_TYPE_DAYNUM = Object.fromEntries(DAY_TYPES.map((dt, i) => [dt.key, i + 1]))
// Lifting's day types get their own stable day-bucket numbering — separate
// map, separate vocabulary (Upper/Lower vs. High Intent/Hybrid/Synergy/
// Recovery), same purpose.
const LIFTING_DAY_TYPE_DAYNUM = Object.fromEntries(LIFTING_DAY_TYPES.map((dt, i) => [dt.key, i + 1]))

const WEEKDAY_TO_NUM = { monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6, sunday: 7 }

// Coaches write Week/Day as either a single number ("2"), a labeled number
// ("Day 2", "Week 2"), a repeating range ("1-4", "1-3 (every training
// day)") to mean "this block runs on every one of these weeks/days," or —
// for in-house athletes with set training days — a weekday name
// ("Monday", "Friday (optional)"). Weekday names map to a stable
// Mon=1..Sun=7 so each real day lands on its own bucket instead of
// collapsing into Day 1 — and "Day 1"/"Day 2"/"Day 3" must have their
// label stripped first or they'd all fail to parse and collapse the same way.
export function parseWeekOrDayRange(raw) {
  const str = String(raw ?? '').trim().replace(/^(day|week)\s+/i, '')
  const range = str.match(/^(\d+)\s*-\s*(\d+)/)
  if (range) {
    const start = Number(range[1])
    const end   = Number(range[2])
    // A stray value in the Week/Day cell (a date serial, an ID, a typo)
    // can still match this pattern with a huge span — no real program
    // block runs more than a couple months, so cap it rather than
    // spinning a loop with millions of iterations and freezing the tab.
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start || end - start > 60) {
      return [1]
    }
    const nums = []
    for (let n = start; n <= end; n++) nums.push(n)
    return nums.length ? nums : [1]
  }
  const single = Number(str.match(/^\d+/)?.[0])
  if (Number.isFinite(single)) return [single]
  const weekday = WEEKDAY_TO_NUM[str.replace(/\(.*?\)/g, '').trim().toLowerCase()]
  return weekday ? [weekday] : [1]
}

// The coach's Sheet splits its exercise output across several tabs now —
// Mobilization/Correctives/Movement Activation in "Pre-Throw Outputs", the
// plyo routines in "Plyo Outputs", and one tab each for Mobility and
// Lifting. Throwing/Post-Throw and Pre-Throw each pull two tabs and still
// land as one program with category tiles; Mobility and Lifting each pull
// a single tab into their own program.
export const OUTPUT_PULL_GROUPS = [
  { tabs: ['Pre-Throw Outputs'],                             programType: 'correctives', nameSuffix: 'Program',  label: 'Pre-Throw' },
  { tabs: ['Throwing/Post-Throw Outputs', 'Plyo Outputs'],   programType: 'throwing',    nameSuffix: 'Throwing', label: 'Throwing/Post-Throw' },
  { tabs: ['Lifting Outputs'],                                programType: 'lifting',     nameSuffix: 'Lifting',  label: 'Lifting' },
  { tabs: ['Mobility Outputs'],                               programType: 'mobility',    nameSuffix: 'Mobility', label: 'Mobility' },
]

// Shared by every Outputs-tab pull — all end up with the same flat row
// shape (Week, Day, Category, Exercise, Sets, Reps, Intensity, Notes,
// Video URL, plus an optional Alternate Exercise/Sets/Reps/Intensity/
// Notes/Video URL for a same-row either/or option). Pure — no network or
// Firestore calls — so it's cheap to unit-reason about independent of the
// fetch/create side.
export function buildProgramWeeksFromRows(rows, programType = 'correctives') {
  const weeksMap = {}
  rows.forEach(row => {
    const weekNums = parseWeekOrDayRange(row['Week'])
    // College Remote Athletes' rows put a day-type label ("High Intent
    // Day", "Medium Day", "Recovery Day" — or, for lifting, "Upper Day 1"
    // etc., a separate vocabulary) directly in the Day column instead of a
    // weekday name. parseWeekOrDayRange can't parse that as a number, so
    // it'd otherwise fall back to [1] for every row — silently collapsing
    // every day type into one Day 1. Detect it and give each type its own
    // stable day bucket, tagged automatically so the athlete's day-type
    // picker (see SchedulePage) works right after the pull instead of
    // needing the coach to re-tag it by hand.
    const dayTypeKey = programType === 'lifting' ? matchLiftingDayType(row['Day']) : matchDayType(row['Day'])
    const dayNumMap = programType === 'lifting' ? LIFTING_DAY_TYPE_DAYNUM : DAY_TYPE_DAYNUM
    const dayNums = dayTypeKey
      ? [dayNumMap[dayTypeKey]]
      : (row['Day'] !== undefined && row['Day'] !== '' ? parseWeekOrDayRange(row['Day']) : [1])
    const dayOptional = /\(optional\)/i.test(String(row['Day'] ?? ''))
    weekNums.forEach(wk => {
      if (!weeksMap[wk]) weeksMap[wk] = { weekNum: wk, days: {} }
      dayNums.forEach(day => {
        if (!weeksMap[wk].days[day]) {
          weeksMap[wk].days[day] = {
            dayNum: day,
            optional: dayOptional,
            exercises: [],
            ...(dayTypeKey ? { dayType: dayTypeKey } : {}),
          }
        }
        // Lifting Outputs has its own column shape: Block (A/B/C — a group
        // of lifts done together) and Slot # (order within that block)
        // replace the other tabs' Category/Type column; its "Type" column
        // (Upper/Lower) is redundant with the Day column's day type and is
        // ignored here rather than leaking in as a category. "Block A"
        // doubles as the exercise's `category` so it reuses the exact same
        // grouping/accordion machinery every other category already has —
        // see buildCategoryBlocks (SchedulePage) and buildDayGroups
        // (ProgramEditorModal); `blockSlot` is just for ordering exercises
        // within that block correctly.
        const isLifting = programType === 'lifting'
        const category = isLifting
          ? (row['Block'] ? `Block ${String(row['Block']).trim().toUpperCase()}` : '')
          : (row['Category'] || row['Type'] || '')
        const slotRaw = row['Slot #'] ?? row['Slot#'] ?? row['Slot']
        const blockSlot = isLifting && slotRaw !== undefined && slotRaw !== '' ? Number(slotRaw) : NaN
        weeksMap[wk].days[day].exercises.push({
          id:        makeExerciseId(),   // stable across later edits — see utils/programIds
          name:      row['Exercise']  || '',
          sets:      row['Sets']      || '',
          reps:      row['Reps']      || '',
          intensity: row['Intensity'] || '',
          notes:     row['Notes']     || '',
          // Per-exercise, not per-day — one day can mix Mobilization,
          // Correctives, Movement Activation and a plyo routine. See
          // constants/programTypes.js for the category taxonomy. "Type" is
          // the outputs tab's name for the same column.
          category,
          videoUrl:  row['Video URL'] || row['Video'] || '',
          ...(Number.isFinite(blockSlot) ? { blockSlot } : {}),
        })

        // The sheet can carry a second, either/or option on the same row —
        // same column names with "Alternate " in front (Alternate
        // Exercise, Alternate Sets, ...). When filled in, pair it with the
        // exercise just pushed via a shared altGroup so the athlete sees
        // them as one "choose one" slot instead of two separate exercises.
        const altName = row['Alternate Exercise'] || ''
        if (altName.trim()) {
          const exercises = weeksMap[wk].days[day].exercises
          const group = makeExerciseId()
          exercises[exercises.length - 1].altGroup = group
          exercises.push({
            id:        makeExerciseId(),
            name:      altName,
            sets:      row['Alternate Sets']      || '',
            reps:      row['Alternate Reps']      || '',
            intensity: row['Alternate Intensity'] || '',
            notes:     row['Alternate Notes']     || '',
            category,
            videoUrl:  row['Alternate Video URL'] || row['Alternate Video'] || '',
            altGroup:  group,
          })
        }
      })
    })
  })

  const weeks = Object.values(weeksMap)
    .sort((a, b) => a.weekNum - b.weekNum)
    .map(w => ({
      ...w,
      days: Object.values(w.days).sort((a, b) => a.dayNum - b.dayNum),
    }))

  return weeks
}

// No toast/UI here — callers (single-athlete page, bulk action) decide how
// to report results. A hard timeout so a non-responding Apps Script
// surfaces an error instead of hanging the caller forever.
export async function fetchOutputRows(scriptUrl, athleteName, tabs) {
  const results = await Promise.all(tabs.map(async (tabName) => {
    const params = new URLSearchParams()
    params.set('action', 'pullOutputs')
    params.set('tab', tabName)
    params.set('athleteName', athleteName)
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000)
    let res
    try {
      res = await fetch(`${scriptUrl}?${params.toString()}`, { signal: controller.signal })
    } catch (err) {
      if (err.name === 'AbortError') throw new Error(`The sheet took too long to respond (${tabName}). Try again.`)
      throw err
    } finally {
      clearTimeout(timeoutId)
    }
    return res.json()
  }))

  const failed = results.find(r => !r.success)
  const rows = results.flatMap(r => r.program || [])
  return { rows, error: failed?.error }
}

// Creates a draft program (active: false) for one athlete/group, replacing
// any of that type's previous not-yet-reviewed drafts — otherwise
// re-pulling while iterating on the sheet leaves stale drafts stacking up.
// `existingPrograms` lets a caller that already has this athlete's programs
// loaded (the detail page) skip a redundant read; bulk callers can omit it.
export async function generateDraftProgram(scriptUrl, uid, athleteName, group, existingPrograms = null) {
  const { rows, error } = await fetchOutputRows(scriptUrl, athleteName, group.tabs)
  if (!rows.length) return { label: group.label, ok: false, error: error || `No rows in ${group.tabs.join(' or ')}` }

  const programs = existingPrograms ?? (await getProgramsForAthlete(uid)).docs.map(d => ({ id: d.id, ...d.data() }))
  const staleDrafts = programs.filter(p =>
    p.athleteId === uid && p.active === false && !p.archived && (p.programType || 'correctives') === group.programType
  )
  await Promise.all(staleDrafts.map(p => deleteProgram(p.id)))

  const weeks = buildProgramWeeksFromRows(rows, group.programType)
  await createProgram({
    name:       `${athleteName} — ${group.nameSuffix}`,
    athleteId:  uid,
    programType: group.programType,
    totalWeeks: weeks.length,
    weeks,
    // Defaults to today — the coach can adjust it in the review editor
    // before publishing, since it's what sets the athlete's Day 1.
    startDate:  new Date().toISOString().slice(0, 10),
    active:     false,
  })
  return { label: group.label, ok: true, count: rows.length }
}

// "All combined" pulls all four program types for one athlete in one call —
// each still becomes its own draft (an athlete can have one active program
// per type at once, so there's no such thing as a single program spanning
// all of them).
export async function generateAllDraftPrograms(scriptUrl, uid, athleteName, existingPrograms = null) {
  const programs = existingPrograms ?? (await getProgramsForAthlete(uid)).docs.map(d => ({ id: d.id, ...d.data() }))
  return Promise.all(OUTPUT_PULL_GROUPS.map(group => generateDraftProgram(scriptUrl, uid, athleteName, group, programs)))
}

// Logs one athlete's assessment to the "Assessment Intake" sheet. Returns
// the script's raw {success, error?} response — callers decide how to
// report it (a single toast, or a rolled-up bulk summary).
export async function sendAssessmentToIntakeSheet(scriptUrl, athleteName, assessmentData) {
  const params = new URLSearchParams()
  Object.entries(assessmentData).forEach(([k, v]) => { if (v) params.set(k, v) })
  params.set('athleteName', athleteName)
  const res = await fetch(`${scriptUrl}?${params.toString()}`)
  return res.json()
}
