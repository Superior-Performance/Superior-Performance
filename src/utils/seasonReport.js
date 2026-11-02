/**
 * Season summary export — program completion, velo, and body weight as a CSV.
 *
 * Built entirely from data the athlete detail page already has in state
 * (programs, completions, logs), so there's no extra round trip on click. Uses
 * Papa.unparse (already a dependency for the sheet-import flow) rather than
 * adding a PDF library for a first cut.
 *
 * Kept out of the page component because it is pure data shaping plus a
 * download: nothing here touches React state, and the row layout is the thing
 * a coach notices changing, so it should be findable by name.
 */
import Papa from 'papaparse'
import { format } from 'date-fns'
import { countProgramProgress } from './programIds'
import { PROGRAM_TYPES } from '../constants/programTypes'

/** The CSV rows, in the order they appear in the file. */
export function buildSeasonReportRows({ athlete, athleteId, programs, completions, logs }) {
  const rows = [
    ['Athlete', athlete?.name || ''],
    ['Report Generated', format(new Date(), 'MMM d, yyyy')],
    [],
    ['PROGRAMS'],
    ['Program Name', 'Type', 'Weeks', 'Completion %'],
  ]

  // Published programs only — a draft the athlete hasn't started yet
  // shouldn't pad a season summary.
  const seasonPrograms = programs.filter(p => p.athleteId === athleteId && p.active !== false)
  seasonPrograms.forEach(p => {
    const { total, done } = countProgramProgress(completions, p)
    const pct = total ? Math.round((done / total) * 100) : 0
    const typeInfo = PROGRAM_TYPES.find(t => t.key === (p.programType || 'correctives'))
    rows.push([p.name, typeInfo?.label || p.programType || '—', p.weeks?.length || 0, `${pct}%`])
  })
  if (seasonPrograms.length === 0) rows.push(['No programs on file', '', '', ''])

  const veloEntries = logs.filter(l => l.type === 'velo').sort((a, b) => new Date(b.date) - new Date(a.date))
  const weightEntries = logs.filter(l => l.type === 'weight').sort((a, b) => new Date(b.date) - new Date(a.date))
  const bestVelo = veloEntries.length ? Math.max(...veloEntries.map(l => l.value)) : null

  rows.push(
    [],
    ['VELO'],
    ['Best (mph)', bestVelo ?? '—'],
    ['Most Recent (mph)', veloEntries[0]?.value ?? '—', veloEntries[0]?.date ? format(new Date(veloEntries[0].date), 'MMM d, yyyy') : ''],
    ['Goal (mph)', athlete?.goals?.velo ?? '—'],
    ['Entries Logged', veloEntries.length],
    [],
    ['BODY WEIGHT'],
    ['Most Recent (lbs)', weightEntries[0]?.value ?? '—', weightEntries[0]?.date ? format(new Date(weightEntries[0].date), 'MMM d, yyyy') : ''],
    ['Goal (lbs)', athlete?.goals?.weight ?? '—'],
    ['Entries Logged', weightEntries.length],
  )

  return rows
}

/**
 * Builds the CSV and hands it to the browser as a download. Throws on
 * failure — the caller owns the toast and the button's loading state.
 */
export function downloadSeasonReport({ athlete, athleteId, programs, completions, logs }) {
  const csv = Papa.unparse(buildSeasonReportRows({ athlete, athleteId, programs, completions, logs }))
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${(athlete?.name || 'athlete').replace(/\s+/g, '-')}-season-report-${format(new Date(), 'yyyy-MM-dd')}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
