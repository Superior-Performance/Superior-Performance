import { useState } from 'react'
import { X, Plus, Trash2, CheckCircle2 } from 'lucide-react'
import toast from 'react-hot-toast'

// Review/edit surface for a draft program (weeks/days/exercises) before it's
// published to the athlete. Week/day structure stays as generated — this only
// edits, adds, and removes individual exercises, which is the actual QC need.
export default function ProgramEditorModal({ program, onClose, onSave, onPublish }) {
  const [weeks, setWeeks] = useState(program.weeks || [])
  const [saving, setSaving] = useState(false)
  const [publishing, setPublishing] = useState(false)

  function updateExercise(wi, di, ei, field, value) {
    setWeeks(prev => {
      const next = [...prev]
      const day = { ...next[wi].days[di] }
      const exercises = [...day.exercises]
      exercises[ei] = { ...exercises[ei], [field]: value }
      day.exercises = exercises
      next[wi] = { ...next[wi], days: next[wi].days.map((d, i) => i === di ? day : d) }
      return next
    })
  }

  function removeExercise(wi, di, ei) {
    setWeeks(prev => {
      const next = [...prev]
      const day = { ...next[wi].days[di] }
      day.exercises = day.exercises.filter((_, i) => i !== ei)
      next[wi] = { ...next[wi], days: next[wi].days.map((d, i) => i === di ? day : d) }
      return next
    })
  }

  function addExercise(wi, di) {
    setWeeks(prev => {
      const next = [...prev]
      const day = { ...next[wi].days[di] }
      day.exercises = [...day.exercises, { name: '', sets: '', reps: '', intensity: '', notes: '' }]
      next[wi] = { ...next[wi], days: next[wi].days.map((d, i) => i === di ? day : d) }
      return next
    })
  }

  async function handleSave() {
    setSaving(true)
    try {
      await onSave(weeks)
      toast.success('Draft saved.')
    } catch {
      toast.error('Could not save draft.')
    } finally {
      setSaving(false)
    }
  }

  async function handlePublish() {
    setPublishing(true)
    try {
      await onSave(weeks)
      await onPublish()
      onClose()
    } catch {
      toast.error('Could not publish.')
    } finally {
      setPublishing(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{program.name}</h2>
            <p className="text-xs text-amber-600 font-medium mt-0.5">Draft — not visible to the athlete yet</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
          {weeks.map((week, wi) => (
            <div key={wi}>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Week {week.weekNum ?? wi + 1}</p>
              <div className="space-y-4">
                {week.days?.map((day, di) => (
                  <div key={di} className="bg-gray-50 rounded-xl p-4">
                    <p className="text-sm font-semibold text-gray-800 mb-3">
                      Day {day.dayNum ?? di + 1}{day.category ? ` — ${day.category}` : ''}
                    </p>
                    <div className="space-y-2">
                      {day.exercises?.map((ex, ei) => (
                        <div key={ei} className="grid grid-cols-12 gap-2 items-center">
                          <input
                            value={ex.name || ''}
                            onChange={e => updateExercise(wi, di, ei, 'name', e.target.value)}
                            placeholder="Exercise"
                            className="col-span-4 px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-sp-green-500 bg-white"
                          />
                          <input
                            value={ex.sets || ''}
                            onChange={e => updateExercise(wi, di, ei, 'sets', e.target.value)}
                            placeholder="Sets"
                            className="col-span-1 px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-sp-green-500 bg-white"
                          />
                          <input
                            value={ex.reps || ''}
                            onChange={e => updateExercise(wi, di, ei, 'reps', e.target.value)}
                            placeholder="Reps"
                            className="col-span-1 px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-sp-green-500 bg-white"
                          />
                          <input
                            value={ex.intensity || ''}
                            onChange={e => updateExercise(wi, di, ei, 'intensity', e.target.value)}
                            placeholder="Intensity"
                            className="col-span-2 px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-sp-green-500 bg-white"
                          />
                          <input
                            value={ex.notes || ''}
                            onChange={e => updateExercise(wi, di, ei, 'notes', e.target.value)}
                            placeholder="Notes"
                            className="col-span-3 px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-sp-green-500 bg-white"
                          />
                          <button
                            onClick={() => removeExercise(wi, di, ei)}
                            className="col-span-1 flex justify-center p-1.5 text-gray-300 hover:text-red-500 transition"
                            aria-label="Remove exercise"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                      {(!day.exercises || day.exercises.length === 0) && (
                        <p className="text-xs text-gray-400">No exercises.</p>
                      )}
                    </div>
                    <button
                      onClick={() => addExercise(wi, di)}
                      className="flex items-center gap-1.5 text-xs text-sp-green-600 font-medium mt-3 hover:text-sp-green-700 transition"
                    >
                      <Plus size={13} /> Add exercise
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {weeks.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-8">This program has no weeks.</p>
          )}
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-gray-100 flex-shrink-0">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50 transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || publishing}
            className="flex-1 py-2.5 border border-gray-200 text-gray-700 rounded-xl text-sm font-semibold hover:bg-gray-50 disabled:opacity-60 transition"
          >
            {saving ? 'Saving…' : 'Save Draft'}
          </button>
          <button
            onClick={handlePublish}
            disabled={saving || publishing}
            className="btn-brand flex-1 py-2.5 rounded-xl text-sm flex items-center justify-center gap-2"
          >
            <CheckCircle2 size={15} />
            {publishing ? 'Publishing…' : 'Publish to Athlete'}
          </button>
        </div>
      </div>
    </div>
  )
}
