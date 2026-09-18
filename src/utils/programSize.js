/**
 * Keeping a program under Firestore's document limit.
 *
 * A program stores all of its weeks in one document, and Firestore caps a
 * document at 1,048,487 bytes. That's generous for a College Remote program —
 * day-type rows collapse into four buckets — but an in-house program expands
 * the same sheet rows across 7 days and every week in the range, so the same
 * content can be 20x bigger. Switching an athlete from remote to in-house and
 * re-pulling is exactly how a program crosses the line, and the save then
 * fails outright.
 *
 * Two things help, both here:
 *  - compactWeeks strips fields that are empty anyway. The sheet leaves
 *    Sets/Reps/Intensity/Notes/Video URL blank on most rows, and storing
 *    `notes: ''` on a few thousand exercises is real weight. Every reader
 *    already treats missing and empty the same (`ex.notes || ''`), so this
 *    changes nothing the coach or athlete sees.
 *  - estimateBytes drives the editor's size meter, so a program creeping up
 *    on the cap is visible before the save that fails.
 *
 * The real fix, if programs keep growing, is a week-per-document
 * subcollection — a much larger change, and worth it only if compaction
 * stops being enough.
 */

export const FIRESTORE_DOC_LIMIT = 1048487

// Fields worth keeping even when empty: `id` is identity, and the others are
// structural — a day with no dayNum or a week with no weekNum would renumber
// itself on the next read.
const ALWAYS_KEEP = new Set(['id', 'dayNum', 'weekNum'])

function compactValue(obj) {
  const out = {}
  Object.entries(obj).forEach(([k, v]) => {
    if (ALWAYS_KEEP.has(k)) { out[k] = v; return }
    // Firestore rejects undefined outright, and '' / null carry no more
    // meaning than the field being absent.
    if (v === undefined || v === null || v === '') return
    out[k] = v
  })
  return out
}

/** A copy of `weeks` with empty exercise/day fields dropped. */
export function compactWeeks(weeks) {
  return (weeks || []).map(week => compactValue({
    ...week,
    days: (week.days || []).map(day => compactValue({
      ...day,
      exercises: (day.exercises || []).map(compactValue),
    })),
  }))
}

/**
 * Size of what would be written, by Firestore's own accounting rather than
 * JSON length (which runs ~25% high because of quotes, commas and braces, and
 * would have the meter crying wolf well before a save actually fails).
 *
 * Firestore's documented rules: a string costs its UTF-8 bytes + 1, a map
 * costs each key's string size plus its value's, an array costs its values,
 * and numbers/booleans/timestamps are fixed-width. See
 * https://firebase.google.com/docs/firestore/storage-size — the document name
 * and the ~32 bytes of per-document overhead are the caller's problem; here
 * the interest is the `weeks` field, which is all of the weight.
 */
export function estimateBytes(value) {
  const utf8 = (str) => new TextEncoder().encode(String(str)).length
  const size = (v) => {
    if (v === null || v === undefined) return 1
    switch (typeof v) {
      case 'string': return utf8(v) + 1
      case 'boolean': return 1
      case 'number': return 8
      default: break
    }
    if (v instanceof Date) return 8
    if (Array.isArray(v)) return v.reduce((sum, item) => sum + size(item), 0)
    return Object.entries(v).reduce((sum, [k, item]) => sum + utf8(k) + 1 + size(item), 0)
  }
  try {
    return size(value ?? [])
  } catch {
    return 0
  }
}

/** Human-readable size for the editor's meter. */
export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

/**
 * How close a program is to the cap: 'ok' below 75%, 'warn' from there, and
 * 'over' once a save is certain to be refused.
 */
export function sizeStatus(bytes) {
  if (bytes >= FIRESTORE_DOC_LIMIT) return 'over'
  if (bytes >= FIRESTORE_DOC_LIMIT * 0.75) return 'warn'
  return 'ok'
}
