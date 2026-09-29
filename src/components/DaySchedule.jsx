import { useEffect, useRef, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, Users } from 'lucide-react'
import { format, addDays } from 'date-fns'
import { getSlotsForDate, getSlotBookings } from '../firebase/firestore'
import { formatSlotTimeRange } from '../utils/facilitySchedule'

const dayKey = (d) => format(d, 'yyyy-MM-dd')

/**
 * Who is in the building, and when.
 *
 * The Facility page answers "what slots exist" and makes you expand each one
 * to see who booked it. This answers the question a coach actually has before
 * a session — who is coming at 4:00 — by showing every name up front, in time
 * order, for one day at a time.
 *
 * Loads independently of the dashboard's own fan-out rather than joining it:
 * this is a handful of documents, it changes through the day as athletes
 * book, and keeping it separate means stepping to tomorrow doesn't re-run the
 * whole roster query or disturb its cache.
 */
export default function DaySchedule() {
  const [date, setDate] = useState(() => new Date())
  const [slots, setSlots] = useState(null)   // null = still loading
  const reqRef = useRef(0)

  useEffect(() => {
    // Stepping through days fast can land responses out of order; only the
    // newest request is allowed to set state.
    const seq = ++reqRef.current
    setSlots(null)
    ;(async () => {
      try {
        const snap = await getSlotsForDate(dayKey(date))
        const found = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        const rosters = await Promise.all(found.map(s => getSlotBookings(s.id)))
        if (seq !== reqRef.current) return
        setSlots(found.map((s, i) => ({
          ...s,
          athletes: rosters[i].docs
            .map(d => ({ uid: d.id, name: d.data().athleteName || 'Athlete' }))
            .sort((a, b) => a.name.localeCompare(b.name)),
        })))
      } catch {
        if (seq === reqRef.current) setSlots([])
      }
    })()
  }, [date])

  const isToday = dayKey(date) === dayKey(new Date())
  const booked = (slots || []).reduce((n, s) => n + s.athletes.length, 0)

  return (
    <div className="bg-sp-ink-800 rounded-2xl border border-sp-ink-600 p-5 mb-4">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 rounded-full bg-sp-green-500/15 text-sp-green-400 flex items-center justify-center flex-shrink-0">
          <CalendarDays size={17} />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-white">
            {isToday ? 'Today at the facility' : format(date, 'EEEE')}
          </h2>
          <p className="text-xs text-sp-ink-300 mt-0.5">
            {format(date, 'EEEE, MMM d')}
            {slots?.length > 0 && ` · ${booked} booked across ${slots.length} ${slots.length === 1 ? 'session' : 'sessions'}`}
          </p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={() => setDate(d => addDays(d, -1))}
            aria-label="Previous day"
            className="p-1.5 text-sp-ink-300 hover:text-white hover:bg-white/10 rounded-lg transition"
          >
            <ChevronLeft size={16} />
          </button>
          {!isToday && (
            <button
              onClick={() => setDate(new Date())}
              className="px-2.5 py-1 text-xs font-semibold text-sp-green-400 hover:text-sp-green-300 transition"
            >
              Today
            </button>
          )}
          <button
            onClick={() => setDate(d => addDays(d, 1))}
            aria-label="Next day"
            className="p-1.5 text-sp-ink-300 hover:text-white hover:bg-white/10 rounded-lg transition"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {slots === null ? (
        <p className="text-sm text-sp-ink-300 px-1 py-3">Loading…</p>
      ) : slots.length === 0 ? (
        <p className="text-sm text-sp-ink-300 bg-sp-ink-900/40 border border-sp-ink-600/60 rounded-xl px-4 py-5 text-center">
          No sessions scheduled {isToday ? 'today' : `for ${format(date, 'MMM d')}`}.
        </p>
      ) : (
        <div className="space-y-2">
          {slots.map(slot => {
            const full = slot.athletes.length >= (slot.capacity ?? 0)
            return (
              <div key={slot.id} className="bg-sp-ink-900/40 border border-sp-ink-600/60 rounded-xl px-4 py-3">
                <div className="flex items-center gap-3 mb-1.5">
                  <p className="text-sm font-semibold text-white">
                    {formatSlotTimeRange(slot.startTime, slot.endTime)}
                  </p>
                  <span className={`ml-auto flex-shrink-0 text-xs font-semibold ${full ? 'text-amber-400' : 'text-sp-ink-300'}`}>
                    {slot.athletes.length}/{slot.capacity ?? '—'}
                  </span>
                </div>
                {/* Its own line rather than sharing the row above: on a phone
                    the time and the count leave so little room that a note
                    like "Bullpen only" truncated to "Bullpe…". */}
                {slot.notes && (
                  <p className="text-xs text-sp-ink-300 mb-1.5">{slot.notes}</p>
                )}
                {slot.athletes.length === 0 ? (
                  <p className="text-xs text-sp-ink-300/70">Nobody booked.</p>
                ) : (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Users size={12} className="text-sp-ink-300 flex-shrink-0" />
                    {slot.athletes.map(a => (
                      <span
                        key={a.uid}
                        className="text-xs bg-sp-ink-800 border border-sp-ink-600 text-sp-ink-100 px-2 py-1 rounded-full"
                      >
                        {a.name.trim()}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
