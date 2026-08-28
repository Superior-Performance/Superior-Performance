import { useState, useEffect } from 'react'
import { X, Plus, Trash2, CheckCircle2, AlertTriangle, CalendarPlus, ChevronDown, ChevronUp, Link2, Unlink, Wind, Heart, Zap, Flame, CircleDot, ListChecks, Dumbbell } from 'lucide-react'
import toast from 'react-hot-toast'
import { makeExerciseId, groupIntoSlots } from '../utils/programIds'
import { libraryEntryId, buildLibraryEntries, matchLibraryEntries } from '../utils/exerciseLibrary'
import ConfirmDialog from './ConfirmDialog'
import { getExerciseLibrary, upsertExerciseLibraryEntries } from '../firebase/firestore'
import { EXERCISE_CATEGORIES, exerciseCategoryInfo, categoryRank, DAY_TYPES, LIFTING_DAY_TYPES } from '../constants/programTypes'

const CATEGORY_ICONS = { Wind, Heart, Zap, Flame, CircleDot, ListChecks, Dumbbell }
const LIFTING_BLOCK_LETTERS = ['A', 'B', 'C', 'D']

// Groups a day's exercises by category (same taxonomy the athlete's
// SchedulePage groups by) so the editor's exercise list reads as clickable,
// collapsible sections instead of one long flat list. `rawCategory` keeps
// the underlying (possibly empty) category value for prefilling new
// exercises added within the group — "General" is a display fallback only.
// Within a group, a lifting exercise's `blockSlot` (from the sheet's Slot #
// column) orders it correctly within its block; other program types never
// set `blockSlot` so this sort is a no-op for them.
function buildDayGroups(day) {
  const groups = []
  const indexByKey = {}
  ;(day?.exercises || []).forEach((ex, ei) => {
    const raw = (ex.category || '').trim()
    const key = raw || 'General'
    if (indexByKey[key] === undefined) {
      indexByKey[key] = groups.length
      groups.push({ key, rawCategory: raw, items: [] })
    }
    groups[indexByKey[key]].items.push({ ex, ei })
  })
  groups.forEach(g => g.items.sort((a, b) => (a.ex.blockSlot ?? Infinity) - (b.ex.blockSlot ?? Infinity)))
  return groups.sort((a, b) => categoryRank(a.key) - categoryRank(b.key))
}

// Mirrors an edit to a Pre-Throwing category (Mobilization, Correctives,
// Movement Activation, or any custom category typed under a "correctives"
// program) onto every other day in the program that already has that same
// category, so fixing a cue or adding a video URL on one day doesn't mean
// retyping it into every other day the athlete does that corrective.
// Matched purely by category presence — never introduces the category into
// a day that didn't already have it, regardless of week or day type.
// `category` blank ("General") is a no-op: only explicitly tagged
// categories sync.
function syncCategoryAcrossDays(weeksList, sourceWi, sourceDi, category) {
  const trimmed = (category || '').trim()
  if (!trimmed) return weeksList
  const sourceDay = weeksList[sourceWi]?.days?.[sourceDi]
  if (!sourceDay) return weeksList
  const sourceItems = (sourceDay.exercises || []).filter(ex => (ex.category || '').trim() === trimmed)

  return weeksList.map((week, w) => ({
    ...week,
    days: (week.days || []).map((day, d) => {
      if (w === sourceWi && d === sourceDi) return day
      const existingInCategory = (day.exercises || []).filter(ex => (ex.category || '').trim() === trimmed)
      if (existingInCategory.length === 0) return day // never introduce the category to a day that lacked it

      const otherExercises = (day.exercises || []).filter(ex => (ex.category || '').trim() !== trimmed)
      // Keep each position's existing id (so the athlete's completion on
      // this day stays attached to it) and only fall back to a fresh one
      // when the source day now has more items in this category than this
      // day previously did.
      const synced = sourceItems.map((src, i) => ({ ...src, id: existingInCategory[i]?.id || makeExerciseId() }))

      return { ...day, exercises: [...otherExercises, ...synced] }
    }),
  }))
}

/**
 * Review/edit surface for a program's weeks, days and exercises.
 *
 * Three modes:
 *  - draft (default, `onPublish` provided) — Save Draft / Publish to Athlete.
 *    Nothing is visible to the athlete until published.
 *  - live (`live` prop) — the athlete is already following this program, so
 *    Save writes straight through and they see it on next refresh.
 *  - template (`live` false and no `onPublish`) — a standalone program not
 *    yet tied to an athlete. Single "Save Program" button, no publish step.
 *
 * Every exercise carries a stable `id`. Reordering or deleting one no longer
 * disturbs which exercises the athlete has ticked off — see utils/programIds.js.
 */
export default function ProgramEditorModal({ program, onClose, onSave, onPublish, live = false }) {
  const isTemplate = !live && !onPublish
  const [weeks, setWeeks] = useState(program.weeks || [])
  const [startDate, setStartDate] = useState(program.startDate || '')
  const [saving, setSaving] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [dirty, setDirty] = useState(false)
  // Which category group is expanded per day — an accordion, not
  // independent toggles, so opening one auto-collapses the last one open in
  // that day instead of the editor turning into one long exercise list.
  // Keyed by `${wi}_${di}` -> the open group's key, or undefined.
  const [openGroup, setOpenGroup] = useState({})
  // Pending window.confirm()-style prompt — { title, message, confirmLabel,
  // danger, onConfirm } | null. See ConfirmDialog for why this is state
  // instead of a synchronous confirm() call.
  const [confirmState, setConfirmState] = useState(null)
  // Exercise-name autofill suggestions — every drill ever saved across every
  // program, so typing "Band Pull" in a brand new program can still surface
  // the version already fleshed out elsewhere. Fetched once per editor open;
  // see saveToLibrary for how it grows as programs are saved.
  const [library, setLibrary] = useState([])

  useEffect(() => {
    getExerciseLibrary().then(snap => setLibrary(snap.docs.map(d => d.data()))).catch(() => {})
  }, [])

  // Every mutation funnels through here so `dirty` can't drift out of sync.
  // Pass `syncSpec` ({ wi, di, category }) when the mutation touches a
  // specific exercise's category — see syncCategoryAcrossDays above. Only
  // "correctives" (Pre-Throwing) programs sync; the other program types
  // don't share this either/or-across-days behavior.
  function mutate(fn, syncSpec) {
    setWeeks(prev => {
      const next = fn(prev)
      if (!syncSpec || program.programType !== 'correctives') return next
      return syncCategoryAcrossDays(next, syncSpec.wi, syncSpec.di, syncSpec.category)
    })
    setDirty(true)
  }

  function changeStartDate(value) {
    setStartDate(value)
    setDirty(true)
  }

  const blankExercise = (category = '') => ({ id: makeExerciseId(), name: '', sets: '', reps: '', intensity: '', notes: '', category, videoUrl: '' })

  function updateExercise(wi, di, ei, field, value) {
    // If `category` itself is what's being edited, sync using the new
    // value (the exercise now lives there); otherwise sync using its
    // current category.
    const category = field === 'category' ? value : weeks[wi]?.days?.[di]?.exercises?.[ei]?.category
    mutate(prev => prev.map((week, w) => w !== wi ? week : {
      ...week,
      days: week.days.map((day, d) => d !== di ? day : {
        ...day,
        exercises: day.exercises.map((ex, e) => e !== ei ? ex : { ...ex, [field]: value }),
      }),
    }), { wi, di, category })
  }

  function removeExercise(wi, di, ei) {
    const category = weeks[wi]?.days?.[di]?.exercises?.[ei]?.category
    mutate(prev => prev.map((week, w) => w !== wi ? week : {
      ...week,
      days: week.days.map((day, d) => d !== di ? day : {
        ...day,
        exercises: day.exercises.filter((_, e) => e !== ei),
      }),
    }), { wi, di, category })
  }

  function addExercise(wi, di, category = '') {
    mutate(prev => prev.map((week, w) => w !== wi ? week : {
      ...week,
      days: week.days.map((day, d) => d !== di ? day : {
        ...day,
        exercises: [...(day.exercises || []), blankExercise(category)],
      }),
    }), { wi, di, category })
  }

  // Pairs an exercise with a fresh blank one as its either/or alternative —
  // the athlete picks whichever they actually did that day. Capped at two:
  // once paired, "Add option" disappears in favor of "Unlink".
  function addAltOption(wi, di, ei) {
    const category = weeks[wi]?.days?.[di]?.exercises?.[ei]?.category
    mutate(prev => prev.map((week, w) => w !== wi ? week : {
      ...week,
      days: week.days.map((day, d) => d !== di ? day : {
        ...day,
        exercises: (() => {
          const target = day.exercises[ei]
          const group = target.altGroup || makeExerciseId()
          const next = day.exercises.map((ex, e) => e === ei ? { ...ex, altGroup: group } : ex)
          next.splice(ei + 1, 0, blankExercise(target.category))
          next[ei + 1] = { ...next[ei + 1], altGroup: group }
          return next
        })(),
      }),
    }), { wi, di, category })
  }

  function unlinkAltOptions(wi, di, ei) {
    const category = weeks[wi]?.days?.[di]?.exercises?.[ei]?.category
    mutate(prev => prev.map((week, w) => w !== wi ? week : {
      ...week,
      days: week.days.map((day, d) => d !== di ? day : {
        ...day,
        exercises: (() => {
          const group = day.exercises[ei]?.altGroup
          if (!group) return day.exercises
          return day.exercises.map(ex => ex.altGroup === group ? { ...ex, altGroup: '' } : ex)
        })(),
      }),
    }), { wi, di, category })
  }

  // Applies a whole picked library entry (name + sets/reps/intensity/notes/
  // video URL, and category if the exercise didn't already have one) in one
  // mutation, rather than one field at a time — see ExerciseFields' autofill
  // dropdown below.
  function applyAutofill(wi, di, ei, fields) {
    const category = fields.category ?? weeks[wi]?.days?.[di]?.exercises?.[ei]?.category
    mutate(prev => prev.map((week, w) => w !== wi ? week : {
      ...week,
      days: week.days.map((day, d) => d !== di ? day : {
        ...day,
        exercises: day.exercises.map((ex, e) => e !== ei ? ex : { ...ex, ...fields }),
      }),
    }), { wi, di, category })
  }

  // Upserts every named exercise in this program into the shared library so
  // future autofill suggestions (in this program or any other) pick up
  // whatever was just typed here. Best-effort — a failure here shouldn't
  // block or fail the program save itself.
  async function saveToLibrary(weeksToSave) {
    try {
      const entries = buildLibraryEntries(weeksToSave)
      const list = Object.entries(entries).map(([id, data]) => ({ id, data }))
      if (list.length === 0) return
      await upsertExerciseLibraryEntries(list)
      setLibrary(prev => {
        const byId = Object.fromEntries(prev.map(e => [libraryEntryId(e.name, e.category), e]))
        list.forEach(({ id, data }) => { byId[id] = data })
        return Object.values(byId)
      })
    } catch (err) {
      console.error('Could not update exercise library:', err)
    }
  }

  // ── Structure ──────────────────────────────────────────────────────────────

  function updateDayField(wi, di, field, value) {
    mutate(prev => prev.map((week, w) => w !== wi ? week : {
      ...week,
      days: week.days.map((day, d) => d !== di ? day : { ...day, [field]: value }),
    }))
  }

  function addDay(wi) {
    mutate(prev => prev.map((week, w) => w !== wi ? week : {
      ...week,
      days: [...(week.days || []), { dayNum: (week.days?.length || 0) + 1, category: '', exercises: [] }],
    }))
  }

  function removeDay(wi, di) {
    const count = weeks[wi]?.days?.[di]?.exercises?.length || 0
    const doRemove = () => mutate(prev => prev.map((week, w) => w !== wi ? week : {
      ...week,
      days: week.days.filter((_, d) => d !== di),
    }))
    if (count > 0) {
      askConfirm('Delete this day?', `This also removes ${count} exercise${count === 1 ? '' : 's'} on it.`, doRemove)
    } else {
      doRemove()
    }
  }

  function addWeek() {
    mutate(prev => [...prev, {
      weekNum: prev.length + 1,
      days: [{ dayNum: 1, category: '', exercises: [] }],
    }])
  }

  function removeWeek(wi) {
    const count = (weeks[wi]?.days || []).reduce((s, d) => s + (d.exercises?.length || 0), 0)
    const doRemove = () => mutate(prev => prev.filter((_, w) => w !== wi))
    if (count > 0) {
      askConfirm(`Delete week ${wi + 1}?`, `This also removes ${count} exercise${count === 1 ? '' : 's'} on it.`, doRemove)
    } else {
      doRemove()
    }
  }

  // ── Persistence ────────────────────────────────────────────────────────────

  async function handleSave() {
    setSaving(true)
    try {
      await onSave(weeks, startDate)
      await saveToLibrary(weeks)
      setDirty(false)
      toast.success(live ? 'Program updated — the athlete sees this now.' : isTemplate ? 'Program saved.' : 'Draft saved.')
      if (live) onClose()
    } catch {
      toast.error(live ? 'Could not save changes.' : isTemplate ? 'Could not save program.' : 'Could not save draft.')
    } finally {
      setSaving(false)
    }
  }

  async function handlePublish() {
    setPublishing(true)
    try {
      await onSave(weeks, startDate)
      await saveToLibrary(weeks)
      await onPublish()
      onClose()
    } catch {
      toast.error('Could not publish.')
    } finally {
      setPublishing(false)
    }
  }

  function handleClose() {
    if (dirty) {
      askConfirm('Discard changes?', 'You have unsaved changes that will be lost.', onClose, { confirmLabel: 'Discard' })
    } else {
      onClose()
    }
  }

  function askConfirm(title, message, onConfirmFn, { confirmLabel = 'Delete' } = {}) {
    setConfirmState({ title, message, confirmLabel, onConfirmFn })
  }

  const totalExercises = weeks.reduce(
    (s, wk) => s + (wk.days || []).reduce((t, d) => t + (d.exercises?.length || 0), 0), 0)

  return (
    <div className="animate-modal-backdrop fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="animate-modal-panel bg-sp-ink-800 border border-sp-ink-600 rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-sp-ink-600 flex-shrink-0">
          <div>
            <h2 className="text-lg font-bold text-white">{program.name}</h2>
            {live ? (
              <p className="text-xs text-sp-green-400 font-medium mt-0.5">
                Live — the athlete is following this program right now
              </p>
            ) : isTemplate ? (
              <p className="text-xs text-sp-ink-300 font-medium mt-0.5">
                Not assigned to an athlete yet
              </p>
            ) : (
              <p className="text-xs text-amber-400 font-medium mt-0.5">
                Draft — not visible to the athlete yet
              </p>
            )}
          </div>
          <button onClick={handleClose} className="p-1.5 hover:bg-white/10 text-sp-ink-300 rounded-lg transition"><X size={18} /></button>
        </div>

        {live && (
          <div className="flex items-start gap-2.5 px-6 py-3 bg-amber-500/10 border-b border-amber-500/20 flex-shrink-0">
            <AlertTriangle size={15} className="text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-200">
              Changes go live as soon as you save. Exercises the athlete has already
              completed stay ticked off — deleting or reordering won't disturb them.
            </p>
          </div>
        )}

        <div className="flex items-center gap-2.5 px-6 py-3 border-b border-sp-ink-600 flex-shrink-0">
          <label htmlFor="program-start-date" className="text-xs font-semibold text-sp-ink-200 flex-shrink-0">
            Start date
          </label>
          <input
            id="program-start-date"
            type="date"
            value={startDate}
            onChange={e => changeStartDate(e.target.value)}
            className="px-2.5 py-1 border border-sp-ink-600 rounded-lg text-xs text-sp-ink-50 bg-sp-ink-900 focus:outline-none focus:ring-2 focus:ring-sp-green-500"
          />
          <p className="text-[11px] text-sp-ink-300">Day 1 of Week 1 — controls the dates the athlete sees.</p>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
          {weeks.map((week, wi) => (
            <div key={wi}>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-bold text-sp-ink-300 uppercase tracking-wider">
                  Week {week.weekNum ?? wi + 1}
                </p>
                <button
                  onClick={() => removeWeek(wi)}
                  className="flex items-center gap-1 text-[11px] text-sp-ink-300/70 hover:text-red-400 transition"
                >
                  <Trash2 size={12} /> Delete week
                </button>
              </div>

              <div className="space-y-4">
                {week.days?.map((day, di) => (
                  <div key={di} className="bg-sp-ink-900/60 border border-sp-ink-600/50 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-sm font-semibold text-sp-ink-50 flex-shrink-0">
                        Day {day.dayNum ?? di + 1}
                      </span>
                      <input
                        value={day.category || day.title || ''}
                        onChange={e => updateDayField(wi, di, day.title !== undefined && day.category === undefined ? 'title' : 'category', e.target.value)}
                        placeholder="Focus (e.g. Long Toss)"
                        className="flex-1 px-2.5 py-1 border border-sp-ink-600 rounded-lg text-xs text-sp-ink-50 placeholder-sp-ink-300 bg-sp-ink-800 focus:outline-none focus:ring-2 focus:ring-sp-green-500"
                      />
                      <select
                        value={day.dayType || ''}
                        onChange={e => updateDayField(wi, di, 'dayType', e.target.value)}
                        title={program.programType === 'lifting'
                          ? 'Day Type — for College Remote Athlete Mode, matches this lifting day. Lifting has its own Upper/Lower day types, separate from the other program types.'
                          : 'Day Type — for College Remote Athlete Mode, matches this day across every program type'}
                        className="flex-shrink-0 w-36 px-2 py-1 border border-sp-ink-600 rounded-lg text-xs bg-sp-ink-800 text-sp-ink-300 focus:outline-none focus:ring-2 focus:ring-sp-green-500"
                      >
                        <option value="" className="bg-sp-ink-800 text-sp-ink-50">No day type</option>
                        {(program.programType === 'lifting' ? LIFTING_DAY_TYPES : DAY_TYPES).map(dt => <option key={dt.key} value={dt.key} className="bg-sp-ink-800 text-sp-ink-50">{dt.label}</option>)}
                      </select>
                      <button
                        onClick={() => removeDay(wi, di)}
                        className="p-1.5 text-sp-ink-300/60 hover:text-red-400 transition flex-shrink-0"
                        aria-label="Delete day"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>

                    <div className="space-y-2">
                      {buildDayGroups(day).map(group => {
                        const groupKey = `${wi}_${di}`
                        const isOpen = openGroup[groupKey] === group.key
                        const info = exerciseCategoryInfo(group.key)
                        const Icon = CATEGORY_ICONS[info.icon] || ListChecks
                        return (
                          <div key={group.key} className="bg-sp-ink-800 border border-sp-ink-600 rounded-lg overflow-hidden">
                            <button
                              type="button"
                              onClick={() => setOpenGroup(prev => ({ ...prev, [groupKey]: prev[groupKey] === group.key ? null : group.key }))}
                              className="w-full flex items-center justify-between gap-2 px-3 py-2 hover:bg-white/5 transition"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <span className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 text-white ${info.dotClass}`}>
                                  <Icon size={11} />
                                </span>
                                <span className="text-[11px] font-bold uppercase tracking-wide text-sp-ink-100 truncate">{group.key}</span>
                                <span className="text-[11px] text-sp-ink-300 flex-shrink-0">{group.items.length}</span>
                              </div>
                              {isOpen ? <ChevronUp size={14} className="text-sp-ink-300 flex-shrink-0" /> : <ChevronDown size={14} className="text-sp-ink-300 flex-shrink-0" />}
                            </button>

                            {isOpen && (
                              <div className="p-2 space-y-2 border-t border-sp-ink-600/60 bg-sp-ink-900/40">
                                {groupIntoSlots(group.items).map(slot => (
                                  <div
                                    key={slot.altGroup || slot.items[0].ei}
                                    className={slot.items.length > 1 ? 'border border-sp-green-500/30 rounded-lg p-2 space-y-2 bg-sp-green-500/10' : ''}
                                  >
                                    {slot.items.length > 1 && (
                                      <p className="text-[10px] font-bold uppercase tracking-wide text-sp-green-300">Either/or — athlete picks one</p>
                                    )}
                                    {slot.items.map(({ ex, ei }, pos) => (
                                      <ExerciseFields
                                        key={ex.id || ei}
                                        ex={ex}
                                        label={slot.items.length > 1 ? (pos === 0 ? 'Option A' : 'Option B') : null}
                                        isLifting={program.programType === 'lifting'}
                                        onChange={(field, value) => updateExercise(wi, di, ei, field, value)}
                                        onRemove={() => removeExercise(wi, di, ei)}
                                        onAddOption={ex.altGroup ? null : () => addAltOption(wi, di, ei)}
                                        onUnlink={ex.altGroup ? () => unlinkAltOptions(wi, di, ei) : null}
                                        library={library}
                                        onAutofill={(fields) => applyAutofill(wi, di, ei, fields)}
                                      />
                                    ))}
                                  </div>
                                ))}
                                <button
                                  onClick={() => addExercise(wi, di, group.rawCategory)}
                                  className="flex items-center gap-1.5 text-xs text-sp-green-400 font-medium hover:text-sp-green-300 transition"
                                >
                                  <Plus size={13} /> Add exercise
                                </button>
                              </div>
                            )}
                          </div>
                        )
                      })}
                      {(!day.exercises || day.exercises.length === 0) && (
                        <p className="text-xs text-sp-ink-300">No exercises.</p>
                      )}
                    </div>

                    <button
                      onClick={() => { addExercise(wi, di); setOpenGroup(prev => ({ ...prev, [`${wi}_${di}`]: 'General' })) }}
                      className="flex items-center gap-1.5 text-xs text-sp-ink-300 font-medium mt-3 hover:text-sp-green-400 transition"
                    >
                      <Plus size={13} /> Add exercise (new category)
                    </button>
                  </div>
                ))}

                <button
                  onClick={() => addDay(wi)}
                  className="flex items-center gap-1.5 text-xs text-sp-ink-300 font-medium hover:text-sp-green-400 transition"
                >
                  <Plus size={13} /> Add day to week {week.weekNum ?? wi + 1}
                </button>
              </div>
            </div>
          ))}

          {weeks.length === 0 && (
            <p className="text-sm text-sp-ink-300 text-center py-8">This program has no weeks yet.</p>
          )}

          <button
            onClick={addWeek}
            className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-sp-ink-600 rounded-xl text-sm font-medium text-sp-ink-300 hover:border-sp-green-500/50 hover:text-sp-green-400 transition"
          >
            <CalendarPlus size={15} /> Add week
          </button>
        </div>

        <div className="flex items-center gap-3 px-6 py-4 border-t border-sp-ink-600 flex-shrink-0">
          <p className="text-xs text-sp-ink-300 flex-shrink-0 mr-auto">
            {weeks.length} week{weeks.length === 1 ? '' : 's'} · {totalExercises} exercise{totalExercises === 1 ? '' : 's'}
          </p>
          <button
            onClick={handleClose}
            className="px-4 py-2.5 border border-sp-ink-600 text-sp-ink-100 rounded-xl text-sm font-medium hover:bg-white/5 transition"
          >
            Cancel
          </button>
          {live ? (
            <button
              onClick={handleSave}
              disabled={saving || !dirty}
              className="btn-brand px-5 py-2.5 rounded-xl text-sm flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <CheckCircle2 size={15} />
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          ) : isTemplate ? (
            <button
              onClick={handleSave}
              disabled={saving}
              className="btn-brand px-5 py-2.5 rounded-xl text-sm flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <CheckCircle2 size={15} />
              {saving ? 'Saving…' : 'Save Program'}
            </button>
          ) : (
            <>
              <button
                onClick={handleSave}
                disabled={saving || publishing}
                className="px-4 py-2.5 border border-sp-ink-600 text-sp-ink-100 rounded-xl text-sm font-semibold hover:bg-white/5 disabled:opacity-60 transition"
              >
                {saving ? 'Saving…' : 'Save Draft'}
              </button>
              <button
                onClick={handlePublish}
                disabled={saving || publishing}
                className="btn-brand px-5 py-2.5 rounded-xl text-sm flex items-center justify-center gap-2"
              >
                <CheckCircle2 size={15} />
                {publishing ? 'Publishing…' : 'Publish to Athlete'}
              </button>
            </>
          )}
        </div>
      </div>

      {confirmState && (
        <ConfirmDialog
          title={confirmState.title}
          message={confirmState.message}
          confirmLabel={confirmState.confirmLabel}
          danger
          onCancel={() => setConfirmState(null)}
          onConfirm={() => { confirmState.onConfirmFn(); setConfirmState(null) }}
        />
      )}
    </div>
  )
}

// One exercise's editable fields. `label` ("Option A"/"Option B") and the
// add/unlink handlers only apply when this exercise is part of an either/or
// pair — see addAltOption/unlinkAltOptions above.
function ExerciseFields({ ex, label, isLifting, onChange, onRemove, onAddOption, onUnlink, library, onAutofill }) {
  // Suggestions stay hidden until there's something to match against —
  // matchLibraryEntries itself also floors at 2 typed characters.
  const [showSuggestions, setShowSuggestions] = useState(false)
  const suggestions = showSuggestions ? matchLibraryEntries(library, ex.category, ex.name) : []

  function pickSuggestion(entry) {
    onAutofill({
      name: entry.name,
      category: ex.category || entry.category,
      sets: entry.sets,
      reps: entry.reps,
      intensity: entry.intensity,
      notes: entry.notes,
      videoUrl: entry.videoUrl,
    })
    setShowSuggestions(false)
  }

  return (
    <div className="bg-sp-ink-800 border border-sp-ink-600 rounded-lg p-2 space-y-1.5">
      <div className="flex items-center gap-2">
        {label && (
          <span className="flex-shrink-0 text-[10px] font-bold uppercase tracking-wide text-sp-green-300 w-14">{label}</span>
        )}
        <select
          value={ex.category || ''}
          onChange={e => onChange('category', e.target.value)}
          className="flex-shrink-0 w-36 px-2 py-1.5 border border-sp-ink-600 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-sp-green-500 bg-sp-ink-900 text-sp-ink-200"
        >
          {isLifting ? (
            <>
              <option value="" className="bg-sp-ink-900 text-sp-ink-50">No block</option>
              {LIFTING_BLOCK_LETTERS.map(letter => (
                <option key={letter} value={`Block ${letter}`} className="bg-sp-ink-900 text-sp-ink-50">Block {letter}</option>
              ))}
            </>
          ) : (
            <>
              <option value="" className="bg-sp-ink-900 text-sp-ink-50">No category</option>
              {EXERCISE_CATEGORIES.map(c => <option key={c.key} value={c.key} className="bg-sp-ink-900 text-sp-ink-50">{c.label}</option>)}
              <option value="Catch Play" className="bg-sp-ink-900 text-sp-ink-50">Catch Play</option>
            </>
          )}
        </select>
        <div className="relative flex-1">
          <input
            value={ex.name || ''}
            onChange={e => { onChange('name', e.target.value); setShowSuggestions(true) }}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            placeholder="Exercise"
            autoComplete="off"
            className="w-full px-2.5 py-1.5 border border-sp-ink-600 rounded-lg text-xs text-sp-ink-50 placeholder-sp-ink-300 focus:outline-none focus:ring-2 focus:ring-sp-green-500 bg-sp-ink-900"
          />
          {suggestions.length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-1 bg-sp-ink-900 border border-sp-ink-600 rounded-lg shadow-lg z-10 overflow-hidden">
              {suggestions.map(entry => (
                <button
                  key={libraryEntryId(entry.name, entry.category)}
                  type="button"
                  onMouseDown={e => { e.preventDefault(); pickSuggestion(entry) }}
                  className="w-full text-left px-2.5 py-1.5 text-xs hover:bg-white/5 transition flex items-center justify-between gap-2"
                >
                  <span className="text-sp-ink-50 truncate">{entry.name}</span>
                  {(entry.sets || entry.reps) && (
                    <span className="text-sp-ink-300 flex-shrink-0">{entry.sets}{entry.sets && entry.reps ? '×' : ''}{entry.reps}</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          onClick={onRemove}
          className="flex-shrink-0 p-1.5 text-sp-ink-300/60 hover:text-red-400 transition"
          aria-label="Remove exercise"
        >
          <Trash2 size={14} />
        </button>
      </div>
      <div className="grid grid-cols-12 gap-2">
        <input
          value={ex.sets || ''}
          onChange={e => onChange('sets', e.target.value)}
          placeholder="Sets"
          className="col-span-2 px-2 py-1.5 border border-sp-ink-600 rounded-lg text-xs text-sp-ink-50 placeholder-sp-ink-300 focus:outline-none focus:ring-2 focus:ring-sp-green-500 bg-sp-ink-900"
        />
        <input
          value={ex.reps || ''}
          onChange={e => onChange('reps', e.target.value)}
          placeholder="Reps"
          className="col-span-2 px-2 py-1.5 border border-sp-ink-600 rounded-lg text-xs text-sp-ink-50 placeholder-sp-ink-300 focus:outline-none focus:ring-2 focus:ring-sp-green-500 bg-sp-ink-900"
        />
        <input
          value={ex.intensity || ex.load || ''}
          onChange={e => onChange('intensity', e.target.value)}
          placeholder="Intensity"
          className="col-span-3 px-2.5 py-1.5 border border-sp-ink-600 rounded-lg text-xs text-sp-ink-50 placeholder-sp-ink-300 focus:outline-none focus:ring-2 focus:ring-sp-green-500 bg-sp-ink-900"
        />
        <input
          value={ex.notes || ''}
          onChange={e => onChange('notes', e.target.value)}
          placeholder="Notes"
          className="col-span-5 px-2.5 py-1.5 border border-sp-ink-600 rounded-lg text-xs text-sp-ink-50 placeholder-sp-ink-300 focus:outline-none focus:ring-2 focus:ring-sp-green-500 bg-sp-ink-900"
        />
      </div>
      <input
        value={ex.videoUrl || ''}
        onChange={e => onChange('videoUrl', e.target.value)}
        placeholder="Video URL (optional)"
        autoComplete="off"
        className="w-full px-2.5 py-1.5 border border-sp-ink-600 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-sp-green-500 bg-sp-ink-900 text-sp-ink-200 placeholder-sp-ink-300"
      />
      {(onAddOption || onUnlink) && (
        onAddOption ? (
          <button onClick={onAddOption} className="flex items-center gap-1 text-[11px] text-sp-ink-300/70 hover:text-sp-green-400 transition">
            <Link2 size={11} /> Add alt option
          </button>
        ) : (
          <button onClick={onUnlink} className="flex items-center gap-1 text-[11px] text-sp-ink-300/70 hover:text-red-400 transition">
            <Unlink size={11} /> Unlink options
          </button>
        )
      )}
    </div>
  )
}
