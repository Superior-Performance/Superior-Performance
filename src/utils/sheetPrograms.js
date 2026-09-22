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
import { buildProgramWeeksFromRows } from './sheetRows'

// Re-exported so importers still find the parser next to the pull flow that
// uses it; the implementation lives in sheetRows.js, which is unit-testable.
export { buildProgramWeeksFromRows, parseWeekOrDayRange } from './sheetRows'


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
export async function generateDraftProgram(scriptUrl, uid, athleteName, group, existingPrograms = null, startDate = null) {
  const { rows, error } = await fetchOutputRows(scriptUrl, athleteName, group.tabs)
  if (!rows.length) return { label: group.label, ok: false, error: error || `No rows in ${group.tabs.join(' or ')}` }

  const programs = existingPrograms ?? (await getProgramsForAthlete(uid)).docs.map(d => ({ id: d.id, ...d.data() }))
  const staleDrafts = programs.filter(p =>
    p.athleteId === uid && p.active === false && !p.archived && (p.programType || 'correctives') === group.programType
  )
  // Build and create the replacement BEFORE removing what it replaces. The
  // other order left the coach holding a draft that no longer existed
  // whenever anything in between threw — a bad cell, a slow tab, a network
  // blip — and every later save then failed with "no entity to update",
  // permanently, because the document was gone.
  const weeks = buildProgramWeeksFromRows(rows, group.programType)
  await createProgram({
    name:       `${athleteName} — ${group.nameSuffix}`,
    athleteId:  uid,
    programType: group.programType,
    totalWeeks: weeks.length,
    weeks,
    // A group's block start date when generating for a cohort (see the
    // roster's bulk actions), otherwise today. Either way the coach can
    // adjust it in the review editor before publishing, since it's what
    // sets the athlete's Day 1.
    startDate:  startDate || new Date().toISOString().slice(0, 10),
    active:     false,
  })
  await Promise.all(staleDrafts.map(p => deleteProgram(p.id)))
  return { label: group.label, ok: true, count: rows.length }
}

// "All combined" pulls all four program types for one athlete in one call —
// each still becomes its own draft (an athlete can have one active program
// per type at once, so there's no such thing as a single program spanning
// all of them).
export async function generateAllDraftPrograms(scriptUrl, uid, athleteName, existingPrograms = null, startDate = null) {
  const programs = existingPrograms ?? (await getProgramsForAthlete(uid)).docs.map(d => ({ id: d.id, ...d.data() }))
  // allSettled, not all: one group rejecting used to abort the aggregate
  // while the others had already written their drafts, so the caller skipped
  // its refresh and kept showing program ids that no longer existed.
  const settled = await Promise.allSettled(
    OUTPUT_PULL_GROUPS.map(group => generateDraftProgram(scriptUrl, uid, athleteName, group, programs, startDate))
  )
  return settled.map((r, i) => r.status === 'fulfilled'
    ? r.value
    : { label: OUTPUT_PULL_GROUPS[i].label, ok: false, error: r.reason?.message || 'Pull failed' })
}

// Logs one athlete's assessment to the "Assessment Intake" sheet. Returns
// the script's raw {success, error?} response — callers decide how to
// report it (a single toast, or a rolled-up bulk summary).
export async function sendAssessmentToIntakeSheet(scriptUrl, athleteName, assessmentData) {
  const params = new URLSearchParams()
  Object.entries(assessmentData).forEach(([k, v]) => {
    if (!v) return
    // priorityRanking is an ordered array of field keys; a sheet cell is text.
    params.set(k, Array.isArray(v) ? v.join(', ') : v)
  })
  params.set('athleteName', athleteName)
  const res = await fetch(`${scriptUrl}?${params.toString()}`)
  return res.json()
}
