/**
 * Reading an athlete's assessments as a series rather than a single snapshot.
 *
 * `assessments/{uid}` holds the current values; `assessments/{uid}/history/{date}`
 * holds one copy per assessment date. These helpers turn that pile of dated
 * copies into the two things a coach actually asks: what changed since last
 * time, and which way the numbers are going.
 *
 * Pure functions of their arguments — no Firestore, no React — so the
 * comparison rules are testable on their own.
 */

/**
 * The date an assessment belongs to, as a YYYY-MM-DD document id.
 *
 * Falls back to today when the coach left the date blank, because losing the
 * snapshot entirely is worse than filing it under the day it was entered. The
 * form shows the date, so a wrong one is visible and fixable.
 */
export function snapshotKeyFor(assessment, today = new Date()) {
  const raw = String(assessment?.assessmentDate || '').trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  const pad = (n) => String(n).padStart(2, '0')
  return `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`
}

/** Newest first, which is the order a coach reads a history in. */
export function sortByDateDesc(entries) {
  return [...(entries || [])].sort((a, b) =>
    String(b.assessmentDate || b.id || '').localeCompare(String(a.assessmentDate || a.id || ''))
  )
}

const isBlank = (v) => v === undefined || v === null || String(v).trim() === ''

/**
 * Field-by-field differences between two assessments, newer vs older.
 *
 * `fields` is the form's own field list ({ key, label, type }), so the diff
 * speaks in the labels the coach sees and silently ignores anything that isn't
 * on the form any more. A field blank in both is not a change; a field that
 * gained or lost a value is.
 *
 * Numeric fields carry a signed `delta` so the caller can show direction
 * without re-parsing. Improvement is deliberately NOT inferred here: whether
 * up is good depends on the field (velocity vs. a pain score), and this module
 * has no business guessing.
 */
export function diffAssessments(newer, older, fields) {
  if (!newer || !older) return []
  return (fields || []).flatMap(field => {
    const from = older[field.key]
    const to = newer[field.key]
    if (isBlank(from) && isBlank(to)) return []
    if (String(from ?? '') === String(to ?? '')) return []

    const numeric = field.type === 'number' && !isBlank(from) && !isBlank(to) &&
      Number.isFinite(Number(from)) && Number.isFinite(Number(to))

    return [{
      key: field.key,
      label: field.label,
      from: isBlank(from) ? null : from,
      to: isBlank(to) ? null : to,
      delta: numeric ? Number(to) - Number(from) : null,
    }]
  })
}

/**
 * One numeric field's values across the history, oldest first, for a trend.
 *
 * Entries missing the field are skipped rather than plotted as zero — a screen
 * where nobody measured grip strength is a gap in the series, not a reading of
 * none.
 */
export function numericSeries(entries, key) {
  return sortByDateDesc(entries)
    .slice()
    .reverse()
    .map(e => ({ date: e.assessmentDate || e.id, value: Number(e[key]) }))
    .filter(p => p.date && Number.isFinite(p.value))
}

/**
 * Every numeric field that has at least `min` readings — i.e. the ones worth
 * charting. Ordered by the form's field order so the display matches the form.
 */
export function trendableFields(entries, fields, min = 2) {
  return (fields || [])
    .filter(f => f.type === 'number')
    .map(f => ({ field: f, series: numericSeries(entries, f.key) }))
    .filter(({ series }) => series.length >= min)
}
