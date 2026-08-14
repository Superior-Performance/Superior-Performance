import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { addDataLog, subscribeDataLogs } from '../../firebase/firestore'
import { Zap, Dumbbell, Plus, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import Sparkline from '../../components/Sparkline'

const TYPES = [
  { key: 'velo',   label: 'Velocity',  unit: 'mph',  Icon: Zap,      color: 'bg-yellow-50 text-yellow-600', dot: 'bg-yellow-400' },
  { key: 'weight', label: 'Weight',    unit: 'lbs',  Icon: Dumbbell, color: 'bg-blue-50 text-blue-600',    dot: 'bg-blue-400'   },
]

export default function DataPage() {
  const { currentUser } = useAuth()
  const [logs, setLogs]       = useState([])
  const [showForm, setShowForm] = useState(false)
  const [type, setType]       = useState('velo')
  const [value, setValue]     = useState('')
  const [exercise, setExercise] = useState('')
  const [notes, setNotes]     = useState('')
  const [saving, setSaving]   = useState(false)
  const [filter, setFilter]   = useState('all')

  useEffect(() => {
    if (!currentUser) return
    return subscribeDataLogs(currentUser.uid, (snap) => {
      const entries = []
      snap.forEach((d) => entries.push({ id: d.id, ...d.data() }))
      setLogs(entries)
    })
  }, [currentUser])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!value) return
    setSaving(true)
    try {
      await addDataLog(currentUser.uid, {
        type,
        value: parseFloat(value),
        exercise: exercise.trim() || null,
        notes:    notes.trim()    || null,
        date:     new Date().toISOString(),
      })
      toast.success('Entry saved!')
      setValue('')
      setExercise('')
      setNotes('')
      setShowForm(false)
    } catch {
      toast.error('Could not save entry.')
    } finally {
      setSaving(false)
    }
  }

  const filtered = filter === 'all' ? logs : logs.filter(l => l.type === filter)

  // Best velo + latest weight (logs come back newest-first; reverse for chronological trend lines)
  const veloEntries   = logs.filter(l => l.type === 'velo')
  const weightEntries = logs.filter(l => l.type === 'weight')
  const bestVelo   = veloEntries.length   ? Math.max(...veloEntries.map(l => l.value))   : null
  const latestWeight = weightEntries.length ? weightEntries[0]?.value : null
  const veloTrend   = veloEntries.slice(0, 10).map(l => l.value).reverse()
  const weightTrend = weightEntries.slice(0, 10).map(l => l.value).reverse()

  return (
    <div className="px-4 py-5 pb-6">
      {/* Quick stats + trend */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <StatCard label="Best Velo" value={bestVelo} unit="mph" color="bg-yellow-50 text-yellow-600" trend={veloTrend} trendColor="#2E9E63" />
        <StatCard label="Latest Weight" value={latestWeight} unit="lbs" color="bg-blue-50 text-blue-600" trend={weightTrend} trendColor="#278052" />
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-4">
        {[{ k: 'all', l: 'All' }, { k: 'velo', l: 'Velocity' }, { k: 'weight', l: 'Weight' }].map(({ k, l }) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition ${
              filter === k ? 'bg-sp-green-500 text-white' : 'bg-white border border-gray-200 text-gray-600'
            }`}
          >
            {l}
          </button>
        ))}
      </div>

      {/* Log list */}
      <div className="space-y-2 mb-4">
        {filtered.length === 0 && (
          <p className="text-center text-gray-400 text-sm py-8">No entries yet. Tap + to log data.</p>
        )}
        {filtered.map((entry) => {
          const t = TYPES.find(t => t.key === entry.type) || TYPES[0]
          const { Icon, dot } = t
          return (
            <div key={entry.id} className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3 flex items-center gap-3">
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${dot}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-1.5">
                  <span className="font-bold text-gray-900">{entry.value}</span>
                  <span className="text-xs text-gray-400">{t.unit}</span>
                  {entry.exercise && <span className="text-xs text-gray-500 truncate">· {entry.exercise}</span>}
                </div>
                {entry.notes && <p className="text-xs text-gray-400 mt-0.5 truncate">{entry.notes}</p>}
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-xs text-gray-400">{entry.date ? format(new Date(entry.date), 'MMM d') : ''}</p>
                <p className={`text-[10px] font-medium mt-0.5 ${t.color} px-1.5 py-0.5 rounded-full`}>{t.label}</p>
              </div>
            </div>
          )
        })}
      </div>

      {/* FAB */}
      <button
        onClick={() => setShowForm(true)}
        className="btn-brand fixed bottom-20 right-5 w-14 h-14 rounded-full flex items-center justify-center active:scale-95 z-40"
      >
        <Plus size={24} />
      </button>

      {/* Bottom sheet form */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end" onClick={() => setShowForm(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="relative bg-white w-full rounded-t-3xl px-5 pt-5 pb-8 safe-bottom"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold">Log Entry</h2>
              <button onClick={() => setShowForm(false)} className="p-1"><X size={20} /></button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Type toggle */}
              <div className="flex gap-2">
                {TYPES.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setType(t.key)}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition ${
                      type === t.key ? 'bg-sp-green-500 text-white' : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    <t.Icon size={15} />
                    {t.label}
                  </button>
                ))}
              </div>

              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">
                  {TYPES.find(t => t.key === type)?.label} ({TYPES.find(t => t.key === type)?.unit})
                </label>
                <input
                  type="number"
                  step="0.1"
                  required
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder={type === 'velo' ? 'e.g. 87.5' : 'e.g. 185'}
                  className="w-full px-4 py-3 bg-gray-50 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sp-green-500"
                />
              </div>

              {type === 'weight' && (
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Exercise (optional)</label>
                  <input
                    type="text"
                    value={exercise}
                    onChange={(e) => setExercise(e.target.value)}
                    placeholder="e.g. Squat, Bench"
                    className="w-full px-4 py-3 bg-gray-50 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sp-green-500"
                  />
                </div>
              )}

              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Notes (optional)</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="How did it feel?"
                  className="w-full px-4 py-3 bg-gray-50 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sp-green-500"
                />
              </div>

              <button
                type="submit"
                disabled={saving}
                className="btn-brand w-full py-3.5 rounded-xl flex items-center justify-center gap-2"
              >
                {saving && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                {saving ? 'Saving…' : 'Save Entry'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, unit, color, trend, trendColor }) {
  return (
    <div className={`${color} rounded-2xl p-4`}>
      <p className="text-xs font-medium opacity-70 mb-1">{label}</p>
      <div className="flex items-end justify-between gap-2">
        <p className="text-2xl font-bold">
          {value != null ? value : '—'}
          {value != null && <span className="text-sm font-medium ml-1 opacity-70">{unit}</span>}
        </p>
        {trend?.length >= 2 && (
          <Sparkline values={trend} width={56} height={26} stroke={trendColor} />
        )}
      </div>
    </div>
  )
}
