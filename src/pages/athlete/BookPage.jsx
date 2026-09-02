import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import {
  getFacilitySlots, getMyFacilityBookings, bookFacilitySlot, cancelFacilityBooking,
} from '../../firebase/firestore'
import { CalendarClock, Clock, Check, X, ChevronDown, ChevronUp } from 'lucide-react'
import { format } from 'date-fns'
import { formatSlotTime, formatSlotTimeRange, weekStartFor, weekEndFor } from '../../utils/facilitySchedule'
import toast from 'react-hot-toast'
import EmptyState from '../../components/EmptyState'
import Skeleton from '../../components/Skeleton'
import ConfirmDialog from '../../components/ConfirmDialog'

const todayStr = () => format(new Date(), 'yyyy-MM-dd')

export default function BookPage() {
  const { currentUser, userProfile } = useAuth()
  const [slots, setSlots] = useState([])
  const [myBookingIds, setMyBookingIds] = useState(new Set())
  const [loading, setLoading] = useState(true)
  const [bookingId, setBookingId] = useState(null) // slot currently being booked/cancelled
  const [confirmSlot, setConfirmSlot] = useState(null) // slot pending a cancel confirmation
  // Which Sun–Sat weeks are expanded in Open Times — keyed by that week's
  // Sunday ('YYYY-MM-DD'). Starts empty; once slots load, the soonest week
  // with anything in it opens automatically (see the effect below) so the
  // page isn't just a wall of collapsed headers on first load.
  const [expandedWeeks, setExpandedWeeks] = useState(new Set())
  const [autoExpanded, setAutoExpanded] = useState(false)

  useEffect(() => { if (currentUser) load() }, [currentUser])

  async function load() {
    setLoading(true)
    try {
      const [slotsSnap, myBookingsSnap] = await Promise.all([
        getFacilitySlots(todayStr()),
        getMyFacilityBookings(currentUser.uid),
      ])
      setSlots(slotsSnap.docs.map(d => ({ id: d.id, ...d.data() })))
      setMyBookingIds(new Set(myBookingsSnap.docs.map(d => d.id)))
    } catch (err) {
      console.error('Failed to load facility slots:', err)
      toast.error('Could not load facility times.')
    } finally {
      setLoading(false)
    }
  }

  async function handleBook(slot) {
    setBookingId(slot.id)
    try {
      await bookFacilitySlot(slot.id, currentUser.uid, userProfile?.name || 'Athlete')
      setSlots(prev => prev.map(s => s.id === slot.id ? { ...s, bookedCount: s.bookedCount + 1 } : s))
      setMyBookingIds(prev => new Set(prev).add(slot.id))
      toast.success('Booked!')
    } catch (err) {
      if (err.message === 'FULL') toast.error('That slot just filled up.')
      else if (err.message === 'ALREADY_BOOKED') toast.error('You already have this one booked.')
      else toast.error('Could not book that slot.')
      load() // resync — our optimistic state may be stale (e.g. it just filled)
    } finally {
      setBookingId(null)
    }
  }

  async function handleCancel(slot) {
    setBookingId(slot.id)
    try {
      await cancelFacilityBooking(slot.id, currentUser.uid)
      setSlots(prev => prev.map(s => s.id === slot.id ? { ...s, bookedCount: Math.max(0, s.bookedCount - 1) } : s))
      setMyBookingIds(prev => { const next = new Set(prev); next.delete(slot.id); return next })
      toast.success('Booking cancelled.')
    } catch {
      toast.error('Could not cancel that booking.')
    } finally {
      setBookingId(null)
    }
  }

  function toggleWeek(weekStart) {
    setExpandedWeeks(prev => {
      const next = new Set(prev)
      if (next.has(weekStart)) next.delete(weekStart)
      else next.add(weekStart)
      return next
    })
  }

  if (loading) {
    return (
      <div className="px-4 py-4 space-y-3">
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-24 rounded-2xl" />
      </div>
    )
  }

  const myBookings = slots.filter(s => myBookingIds.has(s.id))
  const openSlots = slots.filter(s => !myBookingIds.has(s.id))
  const weeks = groupByWeek(openSlots)

  // Auto-open the soonest week once, the first time it's known — not on
  // every render, so the athlete collapsing it back doesn't get overridden.
  if (!autoExpanded && weeks.length > 0) {
    setAutoExpanded(true)
    setExpandedWeeks(new Set([weeks[0].weekStart]))
  }

  return (
    <div className="min-h-[calc(100vh-56px)] bg-sp-ink-900 px-4 py-4 space-y-5 pb-24">
      {myBookings.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-sp-ink-300 uppercase tracking-wider mb-3">My Bookings</p>
          <div className="space-y-2">
            {myBookings.map(slot => (
              <div key={slot.id} className="bg-sp-green-500/10 border border-sp-green-500/20 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Check size={15} className="text-sp-green-400 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white">{format(new Date(`${slot.date}T12:00:00`), 'EEE, MMM d')}</p>
                    <p className="text-xs text-sp-ink-300">{formatSlotTimeRange(slot.startTime, slot.endTime)}{slot.notes ? ` · ${slot.notes}` : ''}</p>
                  </div>
                </div>
                <button
                  onClick={() => setConfirmSlot(slot)}
                  disabled={bookingId === slot.id}
                  className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold text-sp-ink-300 hover:text-red-400 hover:bg-red-500/10 transition disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <p className="text-xs font-semibold text-sp-ink-300 uppercase tracking-wider mb-3">Open Times</p>
        {weeks.length === 0 ? (
          <EmptyState icon={CalendarClock} title="No open times right now" subtitle="Check back soon — your coach adds new times regularly." dark compact />
        ) : (
          <div className="space-y-2">
            {weeks.map(week => {
              const isOpen = expandedWeeks.has(week.weekStart)
              const isThisWeek = week.weekStart === weekStartFor(todayStr())
              return (
                <div key={week.weekStart} className="bg-sp-ink-800 rounded-xl border border-sp-ink-600 overflow-hidden">
                  <button
                    onClick={() => toggleWeek(week.weekStart)}
                    className="w-full flex items-center justify-between gap-2 px-4 py-3 hover:bg-white/5 transition"
                  >
                    <span className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-white">
                        {format(new Date(`${week.weekStart}T12:00:00`), 'MMM d')}–{format(new Date(`${week.weekEnd}T12:00:00`), 'MMM d')}
                      </span>
                      {isThisWeek && (
                        <span className="text-[10px] font-bold uppercase tracking-wide bg-sp-green-500/15 text-sp-green-500 px-1.5 py-0.5 rounded-full">This Week</span>
                      )}
                      <span className="text-xs text-sp-ink-300">
                        {week.totalSlots} time{week.totalSlots === 1 ? '' : 's'}
                      </span>
                    </span>
                    {isOpen ? <ChevronUp size={16} className="text-sp-ink-300 flex-shrink-0" /> : <ChevronDown size={16} className="text-sp-ink-300 flex-shrink-0" />}
                  </button>

                  {isOpen && (
                    <div className="px-4 pb-4 space-y-4 border-t border-sp-ink-600/60 pt-3">
                      {Object.entries(week.slotsByDate).map(([date, daySlots]) => (
                        <div key={date}>
                          <p className="text-xs font-medium text-sp-ink-300 mb-2">{format(new Date(`${date}T12:00:00`), 'EEEE, MMM d')}</p>
                          <div className="space-y-2">
                            {daySlots.map(slot => {
                              const spotsLeft = slot.capacity - slot.bookedCount
                              const full = spotsLeft <= 0
                              return (
                                <div key={slot.id} className="bg-sp-ink-900/60 rounded-xl border border-sp-ink-600/50 px-4 py-3 flex items-center justify-between gap-3">
                                  <div className="flex items-center gap-2.5 min-w-0">
                                    <Clock size={15} className="text-sp-ink-300 flex-shrink-0" />
                                    <div className="min-w-0">
                                      <p className="text-sm font-semibold text-white">{formatSlotTimeRange(slot.startTime, slot.endTime)}</p>
                                      {slot.notes && <p className="text-xs text-sp-ink-300 truncate">{slot.notes}</p>}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-3 flex-shrink-0">
                                    <span className={`text-xs font-medium ${full ? 'text-red-400' : 'text-sp-ink-300'}`}>
                                      {full ? 'Full' : `${spotsLeft} spot${spotsLeft === 1 ? '' : 's'} left`}
                                    </span>
                                    <button
                                      onClick={() => handleBook(slot)}
                                      disabled={full || bookingId === slot.id}
                                      className="btn-brand px-4 py-2 rounded-lg text-xs disabled:opacity-40 disabled:cursor-not-allowed"
                                    >
                                      {bookingId === slot.id ? '…' : 'Book'}
                                    </button>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {confirmSlot && (
        <ConfirmDialog
          title="Cancel this booking?"
          message={`${format(new Date(`${confirmSlot.date}T12:00:00`), 'EEEE, MMM d')} at ${formatSlotTime(confirmSlot.startTime)} CT — this frees your spot for someone else.`}
          confirmLabel="Cancel Booking"
          danger
          onCancel={() => setConfirmSlot(null)}
          onConfirm={() => { handleCancel(confirmSlot); setConfirmSlot(null) }}
        />
      )}
    </div>
  )
}

// Buckets open slots into Sun–Sat weeks (each with its own date-grouped
// slots inside, same shape the day-by-day rendering already expects),
// sorted chronologically — the soonest week first. `slots` already comes
// back date/time-sorted from Firestore, so insertion order alone keeps
// each week's dates and each date's slots in the right order too.
function groupByWeek(slots) {
  const weekMap = {}
  slots.forEach(slot => {
    const ws = weekStartFor(slot.date)
    if (!weekMap[ws]) weekMap[ws] = { weekStart: ws, weekEnd: weekEndFor(slot.date), slotsByDate: {}, totalSlots: 0 }
    const week = weekMap[ws]
    if (!week.slotsByDate[slot.date]) week.slotsByDate[slot.date] = []
    week.slotsByDate[slot.date].push(slot)
    week.totalSlots++
  })
  return Object.values(weekMap).sort((a, b) => (a.weekStart < b.weekStart ? -1 : a.weekStart > b.weekStart ? 1 : 0))
}
