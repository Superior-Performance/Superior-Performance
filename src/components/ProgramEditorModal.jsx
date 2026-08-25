import { useState } from 'react'
import { X, Plus, Trash2, CheckCircle2, AlertTriangle, CalendarPlus, ChevronDown, ChevronUp, Link2, Unlink, Wind, Heart, Zap, Flame, CircleDot, ListChecks } from 'lucide-react'
import toast from 'react-hot-toast'
import { makeExerciseId, groupIntoSlots } from '../utils/programIds'
import { EXERCISE_CATEGORIES, exerciseCategoryInfo, categoryRank, DAY_TYPES } from '../constants/programTypes'

const CATEGORY_ICONS = { Wind, Heart, Zap, Flame, CircleDot, ListChecks }

// Groups a day's exercises by category (same taxonomy the athlete's
// SchedulePage groups by) so the editor's exercise list reads as clickable,
// collapsible sections instead of one long flat list. `rawCategory` keeps
// the underlying (possibly empty) category value for prefilling new
// exercises added within the group — "General" is a display fallback only.
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
  return groups.sort((a, b) => categoryRank(a.key) - categoryRank(b.key))
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

  // Every mutation funnels through here so `dirty` can't drift out of sync.
  function mutate(fn) {
    setWeeks(prev => fn(prev))
    setDirty(true)
  }

  function changeStartDate(value) {
    setStartDate(value)
    setDirty(true)
  }

  const blankExercise = (category = '') => ({ id: makeExerciseId(), name: '', sets: '', reps: '', intensity: '', notes: '', category, videoUrl: '' })

  function updateExercise(wi, di, ei, field, value) {
    mutate(prev => prev.map((week, w) => w !== wi ? week : {
      ...week,
      days: week.days.map((day, d) => d !== di ? day : {
        ...day,
        exercises: day.exercises.map((ex, e) => e !== ei ? ex : { ...ex, [field]: value }),
      }),
    }))
  }

  function removeExercise(wi, di, ei) {
    mutate(prev => prev.map((week, w) => w !== wi ? week : {
      ...week,
      days: week.days.map((day, d) => d !== di ? day : {
        ...day,
        exercises: day.exercises.filter((_, e) => e !== ei),
      }),
    }))
  }

  function addExercise(wi, di, category = '') {
    mutate(prev => prev.map((week, w) => w !== wi ? week : {
      ...week,
      days: week.days.map((day, d) => d !== di ? day : {
        ...day,
        exercises: [...(day.exercises || []), blankExercise(category)],
      }),
    }))
  }

  // Pairs an exercise with a fresh blank one as its either/or alternative —
  // the athlete picks whichever they actually did that day. Capped at two:
  // once paired, "Add option" disappears in favor of "Unlink".
  function addAltOption(wi, di, ei) {
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
    }))
  }

  function unlinkAltOptions(wi, di, ei) {
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
    }))
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
    if (count > 0 && !confirm(`Delete this day and its ${count} exercise${count === 1 ? '' : 's'}?`)) return
    mutate(prev => prev.map((week, w) => w !== wi ? week : {
      ...week,
      days: week.days.filter((_, d) => d !== di),
    }))
  }

  function addWeek() {
    mutate(prev => [...prev, {
      weekNum: prev.length + 1,
      days: [{ dayNum: 1, category: '', exercises: [] }],
    }])
  }

  function removeWeek(wi) {
    const count = (weeks[wi]?.days || []).reduce((s, d) => s + (d.exercises?.length || 0), 0)
    if (count > 0 && !confirm(`Delete week ${wi + 1} and its ${count} exercise${count === 1 ? '' : 's'}?`)) return
    mutate(prev => prev.filter((_, w) => w !== wi))
  }

  // ── Persistence ────────────────────────────────────────────────────────────

  async function handleSave() {
    setSaving(true)
    try {
      await onSave(weeks, startDate)
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
      await onPublish()
      onClose()
    } catch {
      toast.error('Could not publish.')
    } finally {
      setPublishing(false)
    }
  }

  function handleClose() {
    if (dirty && !confirm('You have unsaved changes. Discard them?')) return
    onClose()
  }

  const totalExercises = weeks.reduce(
    (s, wk) => s + (wk.days || []).reduce((t, d) => t + (d.exercises?.length || 0), 0), 0)

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{program.name}</h2>
            {live ? (
              <p className="text-xs text-sp-green-600 font-medium mt-0.5">
                Live — the athlete is following this program right now
              </p>
            ) : isTemplate ? (
              <p className="text-xs text-gray-400 font-medium mt-0.5">
                Not assigned to an athlete yet
              </p>
            ) : (
              <p className="text-xs text-amber-600 font-medium mt-0.5">
                Draft — not visible to the athlete yet
              </p>
            )}
          </div>
          <button onClick={handleClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition"><X size={18} /></button>
        </div>

        {live && (
          <div className="flex items-start gap-2.5 px-6 py-3 bg-amber-50 border-b border-amber-100 flex-shrink-0">
            <AlertTriangle size={15} className="text-amber-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800">
              Changes go live as soon as you save. Exercises the athlete has already
              completed stay ticked off — deleting or reordering won't disturb them.
            </p>
          </div>
        )}

        <div className="flex items-center gap-2.5 px-6 py-3 border-b border-gray-100 flex-shrink-0">
          <label htmlFor="program-start-date" className="text-xs font-semibold text-gray-600 flex-shrink-0">
            Start date
          </label>
          <input
            id="program-start-date"
            type="date"
            value={startDate}
            onChange={e => changeStartDate(e.target.value)}
            className="px-2.5 py-1 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-sp-green-500"
          />
          <p className="text-[11px] text-gray-400">Day 1 of Week 1 — controls the dates the athlete sees.</p>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
          {weeks.map((week, wi) => (
            <div key={wi}>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                  Week {week.weekNum ?? wi + 1}
                </p>
                <button
                  onClick={() => removeWeek(wi)}
                  className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-red-500 transition"
                >
                  <Trash2 size={12} /> Delete week
                </button>
              </div>

              <div className="space-y-4">
                {week.days?.map((day, di) => (
                  <div key={di} className="bg-gray-50 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-sm font-semibold text-gray-800 flex-shrink-0">
                        Day {day.dayNum ?? di + 1}
                      </span>
                      <input
                        value={day.category || day.title || ''}
                        onChange={e => updateDayField(wi, di, day.title !== undefined && day.category === undefined ? 'title' : 'category', e.target.value)}
                        placeholder="Focus (e.g. Long Toss)"
                        className="flex-1 px-2.5 py-1 border border-gray-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-sp-green-500"
                      />
                      <select
                        value={day.dayType || ''}
                        onChange={e => updateDayField(wi, di, 'dayType', e.target.value)}
                        title="Day Type — for College Remote Athlete Mode, matches this day across every program type"
                        className="flex-shrink-0 w-36 px-2 py-1 border border-gray-200 rounded-lg text-xs bg-white text-gray-500 focus:outline-none focus:ring-2 focus:ring-sp-green-500"
                      >
                        <option value="">No day type</option>
                        {DAY_TYPES.map(dt => <option key={dt.key} value={dt.key}>{dt.label}</option>)}
                      </select>
                      <button
                        onClick={() => removeDay(wi, di)}
                        className="p-1.5 text-gray-300 hover:text-red-500 transition flex-shrink-0"
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
                          <div key={group.key} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                            <button
                              type="button"
                              onClick={() => setOpenGroup(prev => ({ ...prev, [groupKey]: prev[groupKey] === group.key ? null : group.key }))}
                              className="w-full flex items-center justify-between gap-2 px-3 py-2 hover:bg-gray-50 transition"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <span className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 ${info.badgeClass}`}>
                                  <Icon size={11} />
                                </span>
                                <span className="text-[11px] font-bold uppercase tracking-wide text-gray-700 truncate">{group.key}</span>
                                <span className="text-[11px] text-gray-400 flex-shrink-0">{group.items.length}</span>
                              </div>
                              {isOpen ? <ChevronUp size={14} className="text-gray-300 flex-shrink-0" /> : <ChevronDown size={14} className="text-gray-300 flex-shrink-0" />}
                            </button>

                            {isOpen && (
                              <div className="p-2 space-y-2 border-t border-gray-100 bg-gray-50/50">
                                {groupIntoSlots(group.items).map(slot => (
                                  <div
                                    key={slot.altGroup || slot.items[0].ei}
                                    className={slot.items.length > 1 ? 'border border-sp-green-200 rounded-lg p-2 space-y-2 bg-sp-green-50/40' : ''}
                                  >
                                    {slot.items.length > 1 && (
                                      <p className="text-[10px] font-bold uppercase tracking-wide text-sp-green-700">Either/or — athlete picks one</p>
                                    )}
                                    {slot.items.map(({ ex, ei }, pos) => (
                                      <ExerciseFields
                                        key={ex.id || ei}
                                        ex={ex}
                                        label={slot.items.length > 1 ? (pos === 0 ? 'Option A' : 'Option B') : null}
                                        onChange={(field, value) => updateExercise(wi, di, ei, field, value)}
                                        onRemove={() => removeExercise(wi, di, ei)}
                                        onAddOption={ex.altGroup ? null : () => addAltOption(wi, di, ei)}
                                        onUnlink={ex.altGroup ? () => unlinkAltOptions(wi, di, ei) : null}
                                      />
                                    ))}
                                  </div>
                                ))}
                                <button
                                  onClick={() => addExercise(wi, di, group.rawCategory)}
                                  className="flex items-center gap-1.5 text-xs text-sp-green-600 font-medium hover:text-sp-green-700 transition"
                                >
                                  <Plus size={13} /> Add exercise
                                </button>
                              </div>
                            )}
                          </div>
                        )
                      })}
                      {(!day.exercises || day.exercises.length === 0) && (
                        <p className="text-xs text-gray-400">No exercises.</p>
                      )}
                    </div>

                    <button
                      onClick={() => { addExercise(wi, di); setOpenGroup(prev => ({ ...prev, [`${wi}_${di}`]: 'General' })) }}
                      className="flex items-center gap-1.5 text-xs text-gray-500 font-medium mt-3 hover:text-sp-green-600 transition"
                    >
                      <Plus size={13} /> Add exercise (new category)
                    </button>
                  </div>
                ))}

                <button
                  onClick={() => addDay(wi)}
                  className="flex items-center gap-1.5 text-xs text-gray-500 font-medium hover:text-sp-green-600 transition"
                >
                  <Plus size={13} /> Add day to week {week.weekNum ?? wi + 1}
                </button>
              </div>
            </div>
          ))}

          {weeks.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-8">This program has no weeks yet.</p>
          )}

          <button
            onClick={addWeek}
            className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-gray-200 rounded-xl text-sm font-medium text-gray-500 hover:border-sp-green-300 hover:text-sp-green-600 transition"
          >
            <CalendarPlus size={15} /> Add week
          </button>
        </div>

        <div className="flex items-center gap-3 px-6 py-4 border-t border-gray-100 flex-shrink-0">
          <p className="text-xs text-gray-400 flex-shrink-0 mr-auto">
            {weeks.length} week{weeks.length === 1 ? '' : 's'} · {totalExercises} exercise{totalExercises === 1 ? '' : 's'}
          </p>
          <button
            onClick={handleClose}
            className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50 transition"
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
                className="px-4 py-2.5 border border-gray-200 text-gray-700 rounded-xl text-sm font-semibold hover:bg-gray-50 disabled:opacity-60 transition"
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
    </div>
  )
}

// One exercise's editable fields. `label` ("Option A"/"Option B") and the
// add/unlink handlers only apply when this exercise is part of an either/or
// pair — see addAltOption/unlinkAltOptions above.
function ExerciseFields({ ex, label, onChange, onRemove, onAddOption, onUnlink }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-2 space-y-1.5">
      <div className="flex items-center gap-2">
        {label && (
          <span className="flex-shrink-0 text-[10px] font-bold uppercase tracking-wide text-sp-green-700 w-14">{label}</span>
        )}
        <select
          value={ex.category || ''}
          onChange={e => onChange('category', e.target.value)}
          className="flex-shrink-0 w-36 px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-sp-green-500 bg-white text-gray-500"
        >
          <option value="">No category</option>
          {EXERCISE_CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
          <option value="Catch Play">Catch Play</option>
        </select>
        <input
          value={ex.name || ''}
          onChange={e => onChange('name', e.target.value)}
          placeholder="Exercise"
          className="flex-1 px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-sp-green-500 bg-white"
        />
        <button
          onClick={onRemove}
          className="flex-shrink-0 p-1.5 text-gray-300 hover:text-red-500 transition"
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
          className="col-span-2 px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-sp-green-500 bg-white"
        />
        <input
          value={ex.reps || ''}
          onChange={e => onChange('reps', e.target.value)}
          placeholder="Reps"
          className="col-span-2 px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-sp-green-500 bg-white"
        />
        <input
          value={ex.intensity || ex.load || ''}
          onChange={e => onChange('intensity', e.target.value)}
          placeholder="Intensity"
          className="col-span-3 px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-sp-green-500 bg-white"
        />
        <input
          value={ex.notes || ''}
          onChange={e => onChange('notes', e.target.value)}
          placeholder="Notes"
          className="col-span-5 px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-sp-green-500 bg-white"
        />
      </div>
      <input
        value={ex.videoUrl || ''}
        onChange={e => onChange('videoUrl', e.target.value)}
        placeholder="Video URL (optional)"
        className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-sp-green-500 bg-white text-gray-500"
      />
      {(onAddOption || onUnlink) && (
        onAddOption ? (
          <button onClick={onAddOption} className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-sp-green-600 transition">
            <Link2 size={11} /> Add alt option
          </button>
        ) : (
          <button onClick={onUnlink} className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-red-500 transition">
            <Unlink size={11} /> Unlink options
          </button>
        )
      )}
    </div>
  )
}
