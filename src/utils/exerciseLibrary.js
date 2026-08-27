/**
 * Exercise library — a coach-tooling index of drills the Program Editor
 * autofills from, keyed by name+category so the same drill (e.g. "Band Pull
 * Apart" under Correctives) always overwrites the same entry instead of
 * piling up near-duplicates as it's saved into program after program.
 */

const slug = (str) => String(str || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

export function libraryEntryId(name, category) {
  return `${slug(name) || 'unnamed'}__${slug(category) || 'general'}`
}

// Flattens a program's weeks into a { id -> entry } map of its distinct
// named exercises. Where the same drill appears more than once in the
// program, the last occurrence encountered wins — harmless, since
// cross-day category sync already keeps repeats identical.
export function buildLibraryEntries(weeks) {
  const map = {}
  ;(weeks || []).forEach(week => {
    ;(week.days || []).forEach(day => {
      ;(day.exercises || []).forEach(ex => {
        const name = (ex.name || '').trim()
        if (!name) return
        const category = (ex.category || '').trim()
        map[libraryEntryId(name, category)] = {
          name,
          category,
          sets: ex.sets || '',
          reps: ex.reps || '',
          intensity: ex.intensity || '',
          notes: ex.notes || '',
          videoUrl: ex.videoUrl || '',
        }
      })
    })
  })
  return map
}

// Autofill suggestions for the exercise-name field — same category (an
// uncategorized exercise being typed matches any category), name contains
// the typed text, shortest/most-specific matches first. Requires at least
// 2 characters typed so an empty or single-letter field doesn't flood the
// dropdown with everything in the library.
export function matchLibraryEntries(library, category, query, limit = 6) {
  const q = (query || '').trim().toLowerCase()
  if (q.length < 2) return []
  const cat = (category || '').trim()
  return (library || [])
    .filter(entry => (!cat || entry.category === cat) && entry.name.toLowerCase().includes(q))
    .sort((a, b) => a.name.length - b.name.length)
    .slice(0, limit)
}
