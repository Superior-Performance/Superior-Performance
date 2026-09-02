import { useEffect, useState } from 'react'
import {
  getFacilitySlots, deleteFacilitySlot, createFacilitySlot, getSlotBookings,
  getRecurringSeries, createRecurringSeries, updateRecurringSeries, generateSeriesSlots,
} from '../../firebase/firestore'
import { generateSeriesDates, DAY_NAMES, formatSlotTimeRange } from '../../utils/facilitySchedule'
import { Calendar, Plus, Trash2, ChevronDown, ChevronUp, Repeat, Users, X, Pause, Play } from 'lucide-react'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import Skeleton from '../../components/Skeleton'
import ConfirmDialog from '../../components/ConfirmDialog'
import EmptyState from '../../components/EmptyState'

const todayStr = () => format(new Date(), 'yyyy-MM-dd')
// How many weeks a series generates at once, both on creation and on
// "Generate more" — no Cloud Functions/cron in this project, so this is a
// deliberate, admin-triggered batch rather than an automatic rolling window.
const GENERATE_WEEKS = 8

const blankSlot = () => ({ date: '', startTime: '16:00', endTime: '17:00', capacity: 8, notes: '' })
const blankSeries = () => ({ dayOfWeek: 2, startTime: '16:00', endTime: '17:00', capacity: 8, notes: '', startDate: todayStr(), endDate: '' })

export default function AdminFacilityPage() {
  const [slots, setSlots] = useState([])
  const [series, setSeries] = useState([])
  const [loading, setLoading] = useState(true)

  const [showNewSlot, setShowNewSlot] = useState(false)
  const [newSlot, setNewSlot] = useState(blankSlot())
  const [savingSlot, setSavingSlot] = useState(false)

  const [showNewSeries, setShowNewSeries] = useState(false)
  const [newSeries, setNewSeries] = useState(blankSeries())
  const [savingSeries, setSavingSeries] = useState(false)
  const [generatingId, setGeneratingId] = useState(null)

  const [expandedSlotId, setExpandedSlotId] = useState(null)
  const [rosterBySlot, setRosterBySlot] = useState({})
  const [confirmState, setConfirmState] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const [slotsSnap, seriesSnap] = await Promise.all([getFacilitySlots(todayStr()), getRecurringSeries()])
      setSlots(slotsSnap.docs.map(d => ({ id: d.id, ...d.data() })))
      setSeries(seriesSnap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch (err) {
      console.error('Failed to load facility scheduling:', err)
      toast.error('Could not load facility scheduling.')
    } finally {
      setLoading(false)
    }
  }

  async function handleCreateSlot(e) {
    e.preventDefault()
    if (!newSlot.date || !newSlot.startTime || !newSlot.endTime || !newSlot.capacity) return
    setSavingSlot(true)
    try {
      await createFacilitySlot({
        date: newSlot.date,
        startTime: newSlot.startTime,
        endTime: newSlot.endTime,
        capacity: parseInt(newSlot.capacity, 10),
        notes: newSlot.notes.trim() || null,
        seriesId: null,
      })
      toast.success('Slot added.')
      setShowNewSlot(false)
      setNewSlot(blankSlot())
      load()
    } catch {
      toast.error('Could not add slot.')
    } finally {
      setSavingSlot(false)
    }
  }

  function removeSlot(slot) {
    const doRemove = async () => {
      try {
        await deleteFacilitySlot(slot.id)
        setSlots(prev => prev.filter(s => s.id !== slot.id))
        toast.success('Slot removed.')
      } catch {
        toast.error('Could not remove slot.')
      }
    }
    if (slot.bookedCount > 0) {
      setConfirmState({
        title: 'Delete this slot?',
        message: `${slot.bookedCount} athlete${slot.bookedCount === 1 ? ' is' : 's are'} already booked into it. This removes the slot for everyone — consider messaging them first.`,
        confirmLabel: 'Delete',
        onConfirmFn: doRemove,
      })
    } else {
      doRemove()
    }
  }

  async function toggleRoster(slotId) {
    if (expandedSlotId === slotId) { setExpandedSlotId(null); return }
    setExpandedSlotId(slotId)
    if (rosterBySlot[slotId]) return
    try {
      const snap = await getSlotBookings(slotId)
      setRosterBySlot(prev => ({ ...prev, [slotId]: snap.docs.map(d => ({ uid: d.id, ...d.data() })) }))
    } catch {
      toast.error('Could not load roster.')
    }
  }

  async function handleCreateSeries(e) {
    e.preventDefault()
    if (!newSeries.startTime || !newSeries.endTime || !newSeries.capacity || !newSeries.startDate) return
    setSavingSeries(true)
    try {
      const data = {
        dayOfWeek: parseInt(newSeries.dayOfWeek, 10),
        startTime: newSeries.startTime,
        endTime: newSeries.endTime,
        capacity: parseInt(newSeries.capacity, 10),
        notes: newSeries.notes.trim() || null,
        startDate: newSeries.startDate,
        endDate: newSeries.endDate || null,
      }
      const ref = await createRecurringSeries(data)
      const windowEnd = format(addWeeksToDate(todayStr(), GENERATE_WEEKS), 'yyyy-MM-dd')
      const dates = generateSeriesDates(data, todayStr(), windowEnd)
      const created = await generateSeriesSlots(data, ref.id, dates)
      toast.success(`Series created — ${created} slot${created === 1 ? '' : 's'} scheduled.`)
      setShowNewSeries(false)
      setNewSeries(blankSeries())
      load()
    } catch {
      toast.error('Could not create series.')
    } finally {
      setSavingSeries(false)
    }
  }

  async function generateMore(s) {
    setGeneratingId(s.id)
    try {
      const windowEnd = format(addWeeksToDate(todayStr(), GENERATE_WEEKS), 'yyyy-MM-dd')
      const dates = generateSeriesDates(s, todayStr(), windowEnd)
      const created = await generateSeriesSlots(s, s.id, dates)
      toast.success(created > 0 ? `${created} more slot${created === 1 ? '' : 's'} scheduled.` : 'Already up to date.')
      load()
    } catch {
      toast.error('Could not generate slots.')
    } finally {
      setGeneratingId(null)
    }
  }

  async function toggleSeriesActive(s) {
    try {
      await updateRecurringSeries(s.id, { active: !s.active })
      setSeries(prev => prev.map(x => x.id === s.id ? { ...x, active: !s.active } : x))
    } catch {
      toast.error('Could not update series.')
    }
  }

  if (loading) {
    return (
      <div className="px-6 py-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    )
  }

  const slotsByDate = groupByDate(slots)

  return (
    <div className="px-6 py-6 max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Facility Scheduling</h1>
          <p className="text-sm text-sp-ink-300 mt-0.5">Set availability, athletes book a limited spot.</p>
        </div>
      </div>

      {/* Recurring series */}
      <div className="bg-sp-ink-800 rounded-2xl border border-sp-ink-600 p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-1.5">
            <Repeat size={15} className="text-sp-green-400" />
            <p className="text-sm font-semibold text-white">Recurring Series</p>
          </div>
          <button
            onClick={() => setShowNewSeries(v => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-sp-ink-900 border border-sp-ink-600 text-sp-ink-100 hover:bg-white/5 transition"
          >
            <Plus size={13} /> New Series
          </button>
        </div>

        {showNewSeries && (
          <form onSubmit={handleCreateSeries} className="bg-sp-ink-900/60 border border-sp-ink-600/50 rounded-xl p-4 mb-4 space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Field label="Day of week">
                <select
                  value={newSeries.dayOfWeek}
                  onChange={e => setNewSeries(s => ({ ...s, dayOfWeek: e.target.value }))}
                  className={inputCls}
                >
                  {DAY_NAMES.map((name, i) => <option key={i} value={i} className="bg-sp-ink-900">{name}</option>)}
                </select>
              </Field>
              <Field label="Start time">
                <input type="time" value={newSeries.startTime} onChange={e => setNewSeries(s => ({ ...s, startTime: e.target.value }))} className={inputCls} required />
              </Field>
              <Field label="End time">
                <input type="time" value={newSeries.endTime} onChange={e => setNewSeries(s => ({ ...s, endTime: e.target.value }))} className={inputCls} required />
              </Field>
              <Field label="Capacity">
                <input type="number" min="1" value={newSeries.capacity} onChange={e => setNewSeries(s => ({ ...s, capacity: e.target.value }))} className={inputCls} required />
              </Field>
              <Field label="Starts">
                <input type="date" value={newSeries.startDate} onChange={e => setNewSeries(s => ({ ...s, startDate: e.target.value }))} className={inputCls} required style={{ colorScheme: 'dark' }} />
              </Field>
              <Field label="Ends (optional)">
                <input type="date" value={newSeries.endDate} onChange={e => setNewSeries(s => ({ ...s, endDate: e.target.value }))} className={inputCls} style={{ colorScheme: 'dark' }} />
              </Field>
              <Field label="Notes (optional)" span2>
                <input value={newSeries.notes} onChange={e => setNewSeries(s => ({ ...s, notes: e.target.value }))} placeholder="e.g. Bullpen only" className={inputCls} />
              </Field>
            </div>
            <p className="text-[11px] text-sp-ink-300">
              Generates the next {GENERATE_WEEKS} weeks immediately. Use "Generate more" on the series later to extend it.
            </p>
            <div className="flex gap-2">
              <button type="submit" disabled={savingSeries} className="btn-brand px-4 py-2 rounded-lg text-sm disabled:opacity-60">
                {savingSeries ? 'Creating…' : 'Create Series'}
              </button>
              <button type="button" onClick={() => setShowNewSeries(false)} className="px-4 py-2 border border-sp-ink-600 text-sp-ink-100 rounded-lg text-sm hover:bg-white/5 transition">
                Cancel
              </button>
            </div>
          </form>
        )}

        {series.length === 0 ? (
          <p className="text-sm text-sp-ink-300">No recurring series yet.</p>
        ) : (
          <div className="space-y-2">
            {series.map(s => (
              <div key={s.id} className="flex items-center justify-between gap-3 bg-sp-ink-900/60 border border-sp-ink-600/50 rounded-lg px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white">
                    Every {DAY_NAMES[s.dayOfWeek]} · {formatSlotTimeRange(s.startTime, s.endTime)} · cap {s.capacity}
                    {!s.active && <span className="ml-2 text-[10px] font-bold uppercase tracking-wide text-amber-400">Paused</span>}
                  </p>
                  <p className="text-xs text-sp-ink-300 truncate">
                    From {s.startDate}{s.endDate ? ` to ${s.endDate}` : ' · no end date'}{s.notes ? ` · ${s.notes}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => generateMore(s)}
                    disabled={generatingId === s.id || !s.active}
                    title={s.active ? `Generate the next ${GENERATE_WEEKS} weeks` : 'Paused series don’t generate new slots'}
                    className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-sp-ink-800 border border-sp-ink-600 text-sp-ink-100 hover:bg-white/5 transition disabled:opacity-50"
                  >
                    {generatingId === s.id ? 'Generating…' : 'Generate more'}
                  </button>
                  <button
                    onClick={() => toggleSeriesActive(s)}
                    className="p-1.5 text-sp-ink-300/70 hover:text-white transition"
                    aria-label={s.active ? 'Pause series' : 'Resume series'}
                    title={s.active ? 'Pause — stop generating new slots' : 'Resume'}
                  >
                    {s.active ? <Pause size={14} /> : <Play size={14} />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Upcoming slots */}
      <div className="bg-sp-ink-800 rounded-2xl border border-sp-ink-600 p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-1.5">
            <Calendar size={15} className="text-sp-green-400" />
            <p className="text-sm font-semibold text-white">Upcoming Slots</p>
          </div>
          <button
            onClick={() => setShowNewSlot(v => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-sp-ink-900 border border-sp-ink-600 text-sp-ink-100 hover:bg-white/5 transition"
          >
            <Plus size={13} /> One-off Slot
          </button>
        </div>

        {showNewSlot && (
          <form onSubmit={handleCreateSlot} className="bg-sp-ink-900/60 border border-sp-ink-600/50 rounded-xl p-4 mb-4 space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Field label="Date">
                <input type="date" value={newSlot.date} onChange={e => setNewSlot(s => ({ ...s, date: e.target.value }))} className={inputCls} required style={{ colorScheme: 'dark' }} />
              </Field>
              <Field label="Start time">
                <input type="time" value={newSlot.startTime} onChange={e => setNewSlot(s => ({ ...s, startTime: e.target.value }))} className={inputCls} required />
              </Field>
              <Field label="End time">
                <input type="time" value={newSlot.endTime} onChange={e => setNewSlot(s => ({ ...s, endTime: e.target.value }))} className={inputCls} required />
              </Field>
              <Field label="Capacity">
                <input type="number" min="1" value={newSlot.capacity} onChange={e => setNewSlot(s => ({ ...s, capacity: e.target.value }))} className={inputCls} required />
              </Field>
              <Field label="Notes (optional)" span2>
                <input value={newSlot.notes} onChange={e => setNewSlot(s => ({ ...s, notes: e.target.value }))} placeholder="e.g. Bullpen only" className={inputCls} />
              </Field>
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={savingSlot} className="btn-brand px-4 py-2 rounded-lg text-sm disabled:opacity-60">
                {savingSlot ? 'Adding…' : 'Add Slot'}
              </button>
              <button type="button" onClick={() => setShowNewSlot(false)} className="px-4 py-2 border border-sp-ink-600 text-sp-ink-100 rounded-lg text-sm hover:bg-white/5 transition">
                Cancel
              </button>
            </div>
          </form>
        )}

        {slots.length === 0 ? (
          <EmptyState icon={Calendar} title="No upcoming slots" subtitle="Add a one-off slot or create a recurring series above." dark compact />
        ) : (
          <div className="space-y-5">
            {Object.entries(slotsByDate).map(([date, daySlots]) => (
              <div key={date}>
                <p className="text-xs font-semibold text-sp-ink-300 uppercase tracking-wider mb-2">
                  {format(new Date(`${date}T12:00:00`), 'EEEE, MMM d')}
                </p>
                <div className="space-y-2">
                  {daySlots.map(slot => {
                    const full = slot.bookedCount >= slot.capacity
                    const roster = rosterBySlot[slot.id]
                    return (
                      <div key={slot.id} className="bg-sp-ink-900/60 border border-sp-ink-600/50 rounded-lg overflow-hidden">
                        <div className="flex items-center justify-between gap-3 px-4 py-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-white">
                              {formatSlotTimeRange(slot.startTime, slot.endTime)}
                              {slot.seriesId && <Repeat size={11} className="inline-block ml-1.5 mb-0.5 text-sp-ink-300" />}
                            </p>
                            {slot.notes && <p className="text-xs text-sp-ink-300 truncate">{slot.notes}</p>}
                          </div>
                          <div className="flex items-center gap-3 flex-shrink-0">
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${full ? 'bg-red-500/15 text-red-400' : 'bg-sp-green-500/15 text-sp-green-400'}`}>
                              {slot.bookedCount}/{slot.capacity}
                            </span>
                            <button
                              onClick={() => toggleRoster(slot.id)}
                              className="p-1.5 text-sp-ink-300/70 hover:text-white transition"
                              aria-label="View roster"
                            >
                              {expandedSlotId === slot.id ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                            </button>
                            <button
                              onClick={() => removeSlot(slot)}
                              className="p-1.5 text-sp-ink-300/60 hover:text-red-400 transition"
                              aria-label="Delete slot"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                        {expandedSlotId === slot.id && (
                          <div className="px-4 pb-3 border-t border-sp-ink-600/50 pt-3">
                            {roster === undefined ? (
                              <p className="text-xs text-sp-ink-300">Loading…</p>
                            ) : roster.length === 0 ? (
                              <p className="text-xs text-sp-ink-300">No one booked yet.</p>
                            ) : (
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <Users size={12} className="text-sp-ink-300" />
                                {roster.map(r => (
                                  <span key={r.uid} className="text-xs bg-sp-ink-800 border border-sp-ink-600 text-sp-ink-100 px-2 py-1 rounded-full">
                                    {r.athleteName}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
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

const inputCls = 'w-full px-2.5 py-1.5 border border-sp-ink-600 rounded-lg text-xs text-sp-ink-50 placeholder-sp-ink-300 bg-sp-ink-900 focus:outline-none focus:ring-2 focus:ring-sp-green-500'

function Field({ label, span2, children }) {
  return (
    <div className={span2 ? 'col-span-2' : ''}>
      <label className="block text-[11px] font-medium text-sp-ink-300 mb-1">{label}</label>
      {children}
    </div>
  )
}

function groupByDate(slots) {
  const groups = {}
  slots.forEach(slot => {
    if (!groups[slot.date]) groups[slot.date] = []
    groups[slot.date].push(slot)
  })
  return groups
}

function addWeeksToDate(dateStr, weeks) {
  const d = new Date(`${dateStr}T12:00:00`)
  d.setDate(d.getDate() + weeks * 7)
  return d
}
