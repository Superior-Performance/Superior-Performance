/**
 * Stable exercise identity.
 *
 * Completions used to be keyed by position — `${programId}_${wi}_${di}_${ei}`.
 * That works fine for a program nobody edits, but the moment a coach removes or
 * reorders an exercise in a live program every checkmark after it slides onto a
 * different exercise. So each exercise now carries a permanent `id` and
 * completions are keyed `${programId}_${exercise.id}` instead.
 *
 * Old programs and old completion docs still exist, so every read path checks
 * the id key first and falls back to the legacy positional key. Nothing has to
 * be migrated before it works — migration just cleans up.
 */

/** Collision-resistant enough for exercises inside a single program. */
export function makeExerciseId() {
  return 'ex_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
}

export const legacyCompletionKey = (programId, wi, di, ei) => `${programId}_${wi}_${di}_${ei}`

export const completionKey = (programId, exerciseId) => `${programId}_${exerciseId}`

/**
 * Assign ids to any exercise missing one.
 *
 * Returns a NEW weeks array plus the list of exercises that gained an id, with
 * the position they were at — the caller needs those positions to move existing
 * completion docs onto the new keys.
 *
 * Idempotent: weeks where every exercise already has an id come back unchanged
 * (`changed: false`), so this is safe to call on every load.
 */
export function ensureExerciseIds(weeks) {
  const assigned = []
  let changed = false

  const next = (weeks || []).map((week, wi) => ({
    ...week,
    days: (week.days || []).map((day, di) => ({
      ...day,
      exercises: (day.exercises || []).map((ex, ei) => {
        if (ex && ex.id) return ex
        changed = true
        const id = makeExerciseId()
        assigned.push({ id, wi, di, ei })
        return { ...ex, id }
      }),
    })),
  }))

  return changed ? { weeks: next, assigned, changed } : { weeks, assigned, changed }
}

/**
 * Is this exercise done? Checks the stable key, then the legacy positional key
 * so athletes part-way through an un-migrated program don't lose their progress.
 */
export function isExerciseComplete(completions, programId, exercise, wi, di, ei) {
  if (!completions) return false
  if (exercise?.id && completions[completionKey(programId, exercise.id)]?.completed) return true
  return !!completions[legacyCompletionKey(programId, wi, di, ei)]?.completed
}

/** The key a new completion should be written to. */
export function keyForWrite(programId, exercise, wi, di, ei) {
  return exercise?.id
    ? completionKey(programId, exercise.id)
    : legacyCompletionKey(programId, wi, di, ei)
}

/**
 * Group a day's exercises into completion "slots". Most exercises are their
 * own slot. Two exercises sharing a non-empty `altGroup` (an either/or pair —
 * see ProgramEditorModal's "Add alt option") collapse into one slot that's
 * satisfied by completing either one, so an athlete choosing day-of between
 * two corrective variants only has to check off whichever they actually did.
 *
 * Takes `{ ex, i }` pairs (i = the exercise's index within day.exercises,
 * which completion keys are built from) rather than a raw exercise array, so
 * callers that have already filtered/regrouped exercises (e.g. by category)
 * can build slots without losing each exercise's original position.
 */
export function groupIntoSlots(items) {
  const slots = []
  const indexByGroup = {}
  ;(items || []).forEach((item) => {
    const group = item.ex?.altGroup
    if (group) {
      if (indexByGroup[group] === undefined) {
        indexByGroup[group] = slots.length
        slots.push({ altGroup: group, items: [] })
      }
      slots[indexByGroup[group]].items.push(item)
    } else {
      slots.push({ altGroup: null, items: [item] })
    }
  })
  return slots
}

/** Slots for a plain exercise array, indexed by position. */
export function buildSlots(exercises) {
  return groupIntoSlots((exercises || []).map((ex, i) => ({ ex, i })))
}

/** A slot is done once any one of its (either/or) exercises is checked off. */
export function isSlotComplete(completions, programId, slot, wi, di) {
  return slot.items.some(({ ex, i }) => isExerciseComplete(completions, programId, ex, wi, di, i))
}

/** Count completed slots in a day (an either/or pair counts as one). */
export function countDayComplete(completions, programId, day, wi, di) {
  return buildSlots(day?.exercises).filter(slot => isSlotComplete(completions, programId, slot, wi, di)).length
}

/**
 * Walk a program and total up slots vs completed. Used by the progress
 * rings, which sum across all of an athlete's concurrent programs.
 */
export function countProgramProgress(completions, program, weekFilter = null) {
  let total = 0
  let done = 0
  ;(program?.weeks || []).forEach((week, wi) => {
    if (weekFilter !== null && wi !== weekFilter) return
    ;(week.days || []).forEach((day, di) => {
      const slots = buildSlots(day.exercises)
      total += slots.length
      done += slots.filter(slot => isSlotComplete(completions, program.id, slot, wi, di)).length
    })
  })
  return { total, done }
}
