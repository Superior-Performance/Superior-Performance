import { useState } from 'react'
import toast from 'react-hot-toast'
import {
  getProgram, createProgram, updateProgram, updateLiveProgram, deleteProgram,
  getProgramForAthlete, updateUser, migrateCompletionKeys,
} from '../../../firebase/firestore'
import { ensureExerciseIds, completionKey, legacyCompletionKey } from '../../../utils/programIds'
import { compactWeeks } from '../../../utils/programSize'

/**
 * Everything that writes to this athlete's programs: assigning, removing,
 * publishing a draft, discarding a draft, and editing a live program.
 *
 * A hook rather than part of the Program tab component so the editor that is
 * currently open, and a pending confirm, live in the page's own state — the
 * program editor is a full-screen modal rendered above every tab, not inside
 * the one that opened it.
 */
export function useAthleteProgramActions({ uid, activePrograms, setActivePrograms, refreshPrograms, reload, setSaving }) {
  const [editingDraft, setEditingDraft] = useState(null)
  const [editingLive, setEditingLive]   = useState(null)   // an already-published program
  // Pending window.confirm()-style prompt — { title, message, onConfirmFn } |
  // null. See ConfirmDialog for why this is state instead of a synchronous
  // confirm() call.
  const [confirmState, setConfirmState] = useState(null)

  // Keeps a lightweight list of which program types this athlete currently has
  // active on their user doc, so the Athletes list can show it without an
  // extra programs query per row.
  async function syncProgramTypesFlag(nextActive) {
    await updateUser(uid, { programTypes: Object.keys(nextActive).filter(t => nextActive[t]) })
  }

  async function removeProgram(type) {
    const current = activePrograms[type]
    if (!current) return
    setSaving(true)
    try {
      await updateProgram(current.id, { active: false, athleteId: null })
      const nextActive = { ...activePrograms, [type]: undefined }
      setActivePrograms(nextActive)
      await syncProgramTypesFlag(nextActive)
      toast.success('Program removed.')
    } catch {
      toast.error('Could not remove program.')
    } finally {
      setSaving(false)
    }
  }

  async function assignProgram(programId) {
    setSaving(true)
    try {
      // Read the program fresh rather than cloning the copy in state. That
      // list is a snapshot from page load, and a clone is permanent: if the
      // program changed since — edited in another tab, or a refresh that
      // hasn't landed — the athlete gets a copy of the older content while
      // the source shows the newer, which reads exactly like a save that
      // didn't take.
      const sourceSnap = await getProgram(programId)
      if (!sourceSnap.exists()) { toast.error('Program not found.'); return }
      const target = { id: sourceSnap.id, ...sourceSnap.data() }
      const type = target.programType || 'correctives'
      // Guard against assigning away a program that's already active for a
      // different athlete — the Assign Existing list is filtered to prevent
      // this, but check again here so a stale list can't silently steal it.
      if (target.athleteId && target.athleteId !== uid) {
        toast.error('That program already belongs to another athlete.')
        return
      }
      // Deactivate whatever's currently active for that same program type only
      // — correctives/throwing/lifting are independent, assigning one doesn't
      // touch the others.
      const current = activePrograms[type]
      // archived, not just inactive: "inactive and not archived" is exactly
      // what the draft list and the sheet pull both treat as a discardable
      // draft, so a superseded program left merely inactive would show up
      // under Drafts Awaiting Review and be deleted by the next pull.
      if (current) await updateProgram(current.id, { active: false, archived: true })
      // Clone rather than mutate the source program — a reusable template
      // (or a program built for a different athlete) stays exactly as it
      // was, still assignable to the next athlete. This athlete gets their
      // own independent copy, so editing it never touches the original or
      // anyone else who started from the same template.
      // `archived` is stripped along with the rest: a program being published
      // to an athlete is by definition not archived, and inheriting the flag
      // from the source makes a copy that is active AND archived at once.
      // getProgramForAthlete filters on active, so the athlete sees it and
      // trains on it; getAssignedPrograms filters on archived, so the coach's
      // roster reports "No program" for them. Nothing errors — the two views
      // simply disagree, which is the same shape as the programTypes drift.
      const { id: _sourceId, athleteId: _sourceAthleteId, createdAt: _sourceCreatedAt, lastEditedAt: _sourceLastEditedAt, archived: _sourceArchived, ...templateData } = target
      // Reset to today rather than inheriting the source program's start
      // date — a reusable template's original date has no bearing on when
      // *this* athlete is actually starting it. Adjustable after in the editor.
      await createProgram({ ...templateData, startDate: new Date().toISOString().slice(0, 10), athleteId: uid, active: true })
      // A draft's job is done once it's been published — archive it so it
      // drops out of "Drafts Awaiting Review" for good instead of sitting
      // there forever. Reusable templates (active === true) are never
      // touched here; they stay assignable to the next athlete.
      if (target.active === false) {
        await updateProgram(target.id, { archived: true })
      }
      const snap = await getProgramForAthlete(uid)
      const nextActive = {}
      snap.docs.forEach(d => {
        const data = d.data()
        nextActive[data.programType || 'correctives'] = { id: d.id, ...data }
      })
      setActivePrograms(nextActive)
      await syncProgramTypesFlag(nextActive)
      await refreshPrograms()
      toast.success('Program assigned — this athlete has their own copy, separate from the original.')
    } catch {
      toast.error('Assignment failed.')
    } finally {
      setSaving(false)
    }
  }

  async function saveDraftWeeks(programId, weeks, startDate) {
    const compact = compactWeeks(weeks)
    await updateProgram(programId, { weeks: compact, totalWeeks: compact.length, startDate })
    await refreshPrograms()
  }

  // Manual cleanup for drafts that piled up before re-pulling started
  // auto-clearing the previous attempt (see generateDraftProgram in
  // utils/sheetPrograms) — a
  // one-off attempt the coach never reviewed, or one from before that fix
  // shipped, isn't going anywhere on its own otherwise.
  function discardDraft(draft) {
    setConfirmState({
      title: `Discard "${draft.name}"?`,
      message: "This can't be undone.",
      onConfirmFn: async () => {
        setSaving(true)
        try {
          await deleteProgram(draft.id)
          await refreshPrograms()
          toast.success('Draft discarded.')
        } catch {
          toast.error('Could not discard draft.')
        } finally {
          setSaving(false)
        }
      },
    })
  }

  /**
   * Open a published program for editing.
   *
   * Before the editor can safely reorder or delete anything, every exercise
   * needs a stable id — otherwise the athlete's completions (keyed by position)
   * would shift onto the wrong exercises. So we backfill ids first and move any
   * existing completion docs onto the new keys, then open the editor on the
   * migrated copy. Programs already carrying ids skip straight through.
   */
  async function openLiveProgram(program) {
    const { weeks, assigned, changed } = ensureExerciseIds(program.weeks)
    if (!changed) {
      setEditingLive(program)
      return
    }
    setSaving(true)
    try {
      const remaps = assigned.map(({ id, wi, di, ei }) => ({
        from: legacyCompletionKey(program.id, wi, di, ei),
        to:   completionKey(program.id, id),
      }))
      await migrateCompletionKeys(uid, remaps)
      await updateProgram(program.id, { weeks })
      const migrated = { ...program, weeks }
      setActivePrograms(prev => ({ ...prev, [program.programType || 'correctives']: migrated }))
      setEditingLive(migrated)
    } catch {
      toast.error('Could not open this program for editing.')
    } finally {
      setSaving(false)
    }
  }

  /** Save an edit to a program the athlete is already following. Goes live immediately. */
  async function saveLiveWeeks(programId, weeks, startDate) {
    const { weeks: withIds } = ensureExerciseIds(weeks)
    const compact = compactWeeks(withIds)
    await updateLiveProgram(programId, { weeks: compact, totalWeeks: compact.length, startDate })
    await reload()
  }


  return {
    editingDraft, setEditingDraft,
    editingLive, setEditingLive,
    confirmState, setConfirmState,
    removeProgram, assignProgram, saveDraftWeeks, discardDraft, openLiveProgram, saveLiveWeeks,
  }
}
