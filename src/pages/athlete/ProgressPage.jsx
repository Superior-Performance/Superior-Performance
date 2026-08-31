import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import {
  getProgramForAthlete, subscribeCompletions, subscribeExerciseWeights,
  addDataLog, subscribeDataLogs,
} from '../../firebase/firestore'
import { buildSlots, isSlotComplete } from '../../utils/programIds'
import { computeStreak } from '../../utils/programSchedule'
import { TrendingUp, CheckCircle2, Lock, Dumbbell, Flame, Zap, Scale, Plus, X } from 'lucide-react'
import EmptyState from '../../components/EmptyState'
import Skeleton from '../../components/Skeleton'
import ProgressRing from '../../components/ProgressRing'
import TrendChart from '../../components/TrendChart'
import { programTypeInfo } from '../../constants/programTypes'
import { format } from 'date-fns'
import toast from 'react-hot-toast'

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

// "Weight" here is exclusively body weight — a lift's working weight is
// tracked per-exercise on the Lift tab (see liftLog below) and never
// belongs in this freeform log, so there's no "Exercise" field on these
// entries at all.
const TRACK_TYPES = [
  { key: 'velo',   label: 'Velo',        unit: 'mph', Icon: Zap,   dot: 'bg-amber-400', pill: 'bg-amber-500/15 text-amber-400', card: 'bg-amber-500/10 text-amber-300 border border-amber-500/20', stroke: '#E0A82E' },
  { key: 'weight', label: 'Body Weight', unit: 'lbs', Icon: Scale, dot: 'bg-sky-400',   pill: 'bg-sky-500/15 text-sky-400',     card: 'bg-sky-500/10 text-sky-300 border border-sky-500/20',     stroke: '#5AA9D6' },
]

export default function ProgressPage() {
  const { currentUser, userProfile } = useAuth()
  const [programs, setPrograms]       = useState([]) // every active program, any type
  const [completions, setCompletions] = useState({})
  const [weights, setWeights]         = useState({}) // fed in from the Lift tab, not entered here
  const [logs, setLogs]               = useState([]) // freeform velo/weight PR log — see Track tab merge below
  const [loading, setLoading]         = useState(true)

  // Track tab (velo/body weight PR logging), migrated in from the old standalone tab
  const [showLogForm, setShowLogForm] = useState(false)
  const [logType, setLogType]         = useState('velo')
  const [logValue, setLogValue]       = useState('')
  const [logNotes, setLogNotes]       = useState('')
  const [logSaving, setLogSaving]     = useState(false)

  function openLogForm(type) {
    setLogType(type)
    setShowLogForm(true)
  }

  useEffect(() => {
    if (!currentUser) return
    getProgramForAthlete(currentUser.uid).then((snap) => {
      setPrograms(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setLoading(false)
    })
  }, [currentUser])

  useEffect(() => {
    if (!currentUser) return
    return subscribeCompletions(currentUser.uid, (snap) => {
      const map = {}
      snap.forEach((d) => { map[d.id] = d.data() })
      setCompletions(map)
    })
  }, [currentUser])

  useEffect(() => {
    if (!currentUser) return
    return subscribeExerciseWeights(currentUser.uid, (snap) => {
      const map = {}
      snap.forEach((d) => { map[d.id] = d.data() })
      setWeights(map)
    })
  }, [currentUser])

  useEffect(() => {
    if (!currentUser) return
    return subscribeDataLogs(currentUser.uid, (snap) => {
      const entries = []
      snap.forEach((d) => entries.push({ id: d.id, ...d.data() }))
      setLogs(entries)
    })
  }, [currentUser])

  async function handleLogSubmit(e) {
    e.preventDefault()
    if (!logValue) return
    setLogSaving(true)
    try {
      await addDataLog(currentUser.uid, {
        type: logType,
        value: parseFloat(logValue),
        notes: logNotes.trim() || null,
        date:  new Date().toISOString(),
      })
      toast.success('Entry saved!')
      setLogValue('')
      setLogNotes('')
      setShowLogForm(false)
    } catch {
      toast.error('Could not save entry.')
    } finally {
      setLogSaving(false)
    }
  }

  if (loading) return <ProgressSkeleton />
  if (programs.length === 0) return (
    <div className="min-h-[calc(100vh-56px)] bg-sp-ink-900">
      <EmptyState
        icon={TrendingUp}
        title="No program yet"
        subtitle="Progress will appear once your coach assigns a program."
        dark
      />
    </div>
  )

  const totalWeeks = Math.max(1, ...programs.map(p => p.weeks?.length || 0))
  const dayCount = (wi) => Math.max(0, ...programs.map(p => p.weeks?.[wi]?.days?.length || 0))

  // A day is "done" once every slot scheduled by ANY active program on that
  // week/day index has been checked off — completions are tracked per
  // program, so this sums across them. An either/or corrective pair (see
  // utils/programIds) counts as one slot, satisfied by either option.
  function dayStats(wi, di) {
    let total = 0, done = 0
    programs.forEach(p => {
      const slots = buildSlots(p.weeks?.[wi]?.days?.[di]?.exercises)
      total += slots.length
      done += slots.filter(slot => isSlotComplete(completions, p.id, slot, wi, di)).length
    })
    return { total, done }
  }
  const isDayDone = (wi, di) => {
    const { total, done } = dayStats(wi, di)
    return total > 0 && total === done
  }

  function weekStats(wi) {
    const dc = dayCount(wi)
    let total = 0, done = 0
    for (let di = 0; di < dc; di++) {
      if (dayStats(wi, di).total === 0) continue
      total++
      if (isDayDone(wi, di)) done++
    }
    return { total, done }
  }

  let totalDays = 0, completedDays = 0
  for (let wi = 0; wi < totalWeeks; wi++) {
    const { total, done } = weekStats(wi)
    totalDays += total
    completedDays += done
  }
  const overallPct = totalDays ? Math.round((completedDays / totalDays) * 100) : 0

  // The week the Today tab is showing right now — same calendar math, so
  // the two tabs always agree on "this week."
  const { streak, pos } = computeStreak(programs, completions, totalWeeks)
  const currentWeekIdx = pos.weekIdx

  const { total: weekTotal, done: weekDone } = weekStats(currentWeekIdx)
  const weekPct = weekTotal ? Math.round((weekDone / weekTotal) * 100) : 0

  // Per-program breakdown, so correctives/throwing/lifting stay clearly
  // differentiated even though the week view above merges them.
  const programBreakdown = programs.map(p => {
    let total = 0, done = 0
    p.weeks?.forEach((w, wi) => {
      w.days?.forEach((d, di) => {
        const slots = buildSlots(d.exercises)
        total += slots.length
        done += slots.filter(slot => isSlotComplete(completions, p.id, slot, wi, di)).length
      })
    })
    return { program: p, total, done, pct: total ? Math.round((done / total) * 100) : 0 }
  })

  // Weights are logged inline on the Lift tab, not entered here — this is
  // just a read-only feed of what's come in, newest first, scoped to the
  // athlete's lifting-type program(s).
  const liftingProgramIds = new Set(programs.filter(p => (p.programType || 'correctives') === 'lifting').map(p => p.id))
  const liftLog = Object.entries(weights)
    .map(([key, entry]) => ({ key, ...entry }))
    .filter(entry => entry.programId ? liftingProgramIds.has(entry.programId) : liftingProgramIds.has(entry.key.split('_')[0]))
    .filter(entry => entry.value !== '' && entry.value != null)
    .sort((a, b) => (b.updatedAt?.toMillis?.() ?? 0) - (a.updatedAt?.toMillis?.() ?? 0))

  // Freeform velo/body weight PR tracking (migrated from the old Track tab).
  // `logs` comes back newest-first (see subscribeDataLogs); the chart wants
  // chronological order, so each entry list below is reversed for its points.
  const veloEntries   = logs.filter(l => l.type === 'velo')
  const weightEntries = logs.filter(l => l.type === 'weight')
  const bestVelo       = veloEntries.length   ? Math.max(...veloEntries.map(l => l.value)) : null
  const latestWeight   = weightEntries.length ? weightEntries[0]?.value : null
  const veloPoints     = veloEntries.slice().reverse().map(l => ({ date: l.date, value: l.value }))
  const weightPoints   = weightEntries.slice().reverse().map(l => ({ date: l.date, value: l.value }))

  return (
    <div className="min-h-[calc(100vh-56px)] bg-sp-ink-900 px-4 py-4 space-y-4 pb-24">
      {/* Hero — overall progress ring + streak, the "gamified" front door */}
      <div className="surface-brand relative overflow-hidden text-white rounded-2xl p-4">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(circle at 90% 100%, rgba(46,158,99,0.3), transparent 60%)' }}
        />
        <div className="relative flex items-center gap-5">
          <ProgressRing pct={overallPct} size={80} />
          <div>
            <p className="text-xs text-white/60">Overall Progress</p>
            <p className="text-2xl font-display font-bold">{overallPct}%</p>
            <p className="text-xs text-white/60 mt-0.5">{completedDays} of {totalDays} sessions done</p>
            {streak > 0 && (
              <div className="inline-flex items-center gap-1.5 mt-2 bg-white/10 rounded-full px-2.5 py-1">
                <Flame size={13} className="text-amber-400" />
                <span className="text-xs font-semibold">{streak} day{streak === 1 ? '' : 's'} streak</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* This week — bar-per-day completion, echoing a weekly report chart */}
      <div className="bg-sp-ink-800 rounded-2xl border border-sp-ink-600 p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-xs text-sp-ink-300">This Week</p>
            <p className="font-bold text-white">Week {currentWeekIdx + 1}</p>
          </div>
          <span className="text-xs text-sp-ink-300">{weekDone}/{weekTotal} sessions · {weekPct}%</span>
        </div>
        <WeekBarChart dayCount={dayCount(currentWeekIdx)} dayStats={(di) => dayStats(currentWeekIdx, di)} todayDayNum={pos.dayNum} />
      </div>

      {/* By program — correctives / throwing / lifting, differentiated */}
      <div className="bg-sp-ink-800 rounded-2xl border border-sp-ink-600 p-4 space-y-3">
        <p className="text-xs font-semibold text-sp-ink-300 uppercase tracking-wider">By Program</p>
        {programBreakdown.map(({ program, total, done, pct }) => {
          const info = programTypeInfo(program.programType)
          return (
            <div key={program.id}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${info.dotClass}`} />
                  <span className={`text-xs font-bold uppercase tracking-wide ${info.textClass}`}>{info.shortLabel}</span>
                  <span className="text-xs text-sp-ink-300">{program.name}</span>
                </div>
                <span className="text-xs text-sp-ink-300">{done}/{total}</span>
              </div>
              <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all ${info.dotClass}`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          )
        })}
      </div>

      {/* Lift log — read-only, fed in from the Lift tab's inline weight fields */}
      {liftLog.length > 0 && (
        <div className="bg-sp-ink-800 rounded-2xl border border-sp-ink-600 p-4">
          <div className="flex items-center gap-1.5 mb-3">
            <Dumbbell size={13} className="text-amber-400" />
            <p className="text-xs font-semibold text-sp-ink-300 uppercase tracking-wider">Lift Log</p>
          </div>
          <div className="space-y-2.5">
            {liftLog.slice(0, 12).map((entry) => (
              <div key={entry.key} className="flex items-center justify-between">
                <span className="text-sm text-sp-ink-100 truncate mr-3">{entry.exercise || 'Exercise'}</span>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-sm font-semibold text-white">{entry.value} lbs</span>
                  {entry.updatedAt?.toMillis && (
                    <span className="text-xs text-sp-ink-300">{format(entry.updatedAt.toDate(), 'MMM d')}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* All weeks — the long-term program overview, migrated in from Schedule */}
      <div>
        <p className="text-xs font-semibold text-sp-ink-300 uppercase tracking-wider mb-3">All Weeks</p>
        <div className="space-y-2">
          {Array.from({ length: totalWeeks }, (_, wi) => {
            const { total, done } = weekStats(wi)
            const pct = total ? Math.round((done / total) * 100) : 0
            const isCurrentWeek = wi === currentWeekIdx
            const isPast = wi < currentWeekIdx
            return (
              <div key={wi} className={`bg-sp-ink-800 rounded-xl px-4 py-3 border ${isCurrentWeek ? 'border-sp-green-500/40' : 'border-sp-ink-600'}`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {isPast
                      ? <CheckCircle2 size={15} className="text-sp-green-500" />
                      : isCurrentWeek
                        ? <div className="w-2 h-2 rounded-full bg-sp-green-500" />
                        : <Lock size={13} className="text-sp-ink-300" />
                    }
                    <span className={`text-sm font-medium ${isCurrentWeek ? 'text-sp-green-500' : 'text-sp-ink-100'}`}>
                      Week {wi + 1}
                      {isCurrentWeek && <span className="ml-1.5 text-[10px] bg-sp-green-500/15 text-sp-green-500 px-1.5 py-0.5 rounded-full">Current</span>}
                    </span>
                  </div>
                  <span className="text-xs text-sp-ink-300">{done}/{total}</span>
                </div>
                <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full bg-sp-green-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Body Weight and Velo — each a clearly separate tracking feature
          (own trend chart, own log button), not a filtered merge of the two */}
      <TrackSection
        type={TRACK_TYPES[1]}
        latestLabel="Latest"
        latestValue={latestWeight}
        points={weightPoints}
        entries={weightEntries}
        goal={userProfile?.goals?.weight ?? null}
        onLog={() => openLogForm('weight')}
      />
      <TrackSection
        type={TRACK_TYPES[0]}
        latestLabel="Best"
        latestValue={bestVelo}
        points={veloPoints}
        entries={veloEntries}
        goal={userProfile?.goals?.velo ?? null}
        onLog={() => openLogForm('velo')}
      />

      {/* Bottom sheet — log entry form */}
      {showLogForm && (
        <div className="fixed inset-0 z-50 flex items-end" onClick={() => setShowLogForm(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="relative bg-sp-ink-800 w-full rounded-t-3xl px-5 pt-5 pb-8 safe-bottom border-t border-sp-ink-600"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-white">Log Entry</h2>
              <button onClick={() => setShowLogForm(false)} className="p-1 text-sp-ink-300"><X size={20} /></button>
            </div>

            <form onSubmit={handleLogSubmit} className="space-y-4">
              <div className="flex gap-2">
                {TRACK_TYPES.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setLogType(t.key)}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition ${
                      logType === t.key ? 'bg-sp-green-500 text-white' : 'bg-white/5 text-sp-ink-300'
                    }`}
                  >
                    <t.Icon size={15} />
                    {t.label}
                  </button>
                ))}
              </div>

              <div>
                <label className="text-xs font-medium text-sp-ink-300 mb-1 block">
                  {TRACK_TYPES.find(t => t.key === logType)?.label} ({TRACK_TYPES.find(t => t.key === logType)?.unit})
                </label>
                <input
                  type="number"
                  step="0.1"
                  required
                  value={logValue}
                  onChange={(e) => setLogValue(e.target.value)}
                  placeholder={logType === 'velo' ? 'e.g. 87.5' : 'e.g. 185'}
                  className="w-full px-4 py-3 bg-sp-ink-900 border border-sp-ink-600 text-white placeholder-sp-ink-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sp-green-500"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-sp-ink-300 mb-1 block">Notes (optional) — visible to your coach</label>
                <input
                  type="text"
                  value={logNotes}
                  onChange={(e) => setLogNotes(e.target.value)}
                  placeholder="How did it feel?"
                  className="w-full px-4 py-3 bg-sp-ink-900 border border-sp-ink-600 text-white placeholder-sp-ink-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sp-green-500"
                />
              </div>

              <button
                type="submit"
                disabled={logSaving}
                className="btn-brand w-full py-3.5 rounded-xl flex items-center justify-center gap-2"
              >
                {logSaving && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                {logSaving ? 'Saving…' : 'Save Entry'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

// Seven thin bars, one per day of the week, height = that day's completion
// % — a single sequential series (sp-green), today's bar picked out so the
// athlete can spot "where am I right now" at a glance.
function WeekBarChart({ dayCount, dayStats, todayDayNum }) {
  const bars = Array.from({ length: dayCount }, (_, di) => {
    const { total, done } = dayStats(di)
    return { dayNum: di + 1, pct: total ? Math.round((done / total) * 100) : null, total }
  })

  if (bars.length === 0) {
    return <p className="text-xs text-sp-ink-300 text-center py-6">Nothing scheduled this week.</p>
  }

  return (
    <div className="flex items-end gap-2 h-28">
      {bars.map((b) => {
        const isToday = b.dayNum === todayDayNum
        return (
          <div key={b.dayNum} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
            <div className="w-full flex-1 flex items-end bg-white/5 rounded-md overflow-hidden">
              {b.total > 0 && (
                <div
                  className={`w-full rounded-md transition-all ${isToday ? 'bg-sp-green-500' : 'bg-sp-green-700'}`}
                  style={{ height: `${Math.max(b.pct, b.pct > 0 ? 8 : 0)}%` }}
                />
              )}
            </div>
            <span className={`text-[10px] font-semibold ${isToday ? 'text-sp-green-500' : 'text-sp-ink-300'}`}>
              {DAY_LABELS[b.dayNum - 1] || ''}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// One tracking feature (Body Weight or Velo) — a stat + real trend chart in
// a branded card, a "Log" button, and the full entry history below with any
// notes the athlete added (notes are also visible on the coach's Logs tab).
function TrackSection({ type, latestLabel, latestValue, points, entries, goal, onLog }) {
  const { Icon, label, unit, card, stroke } = type
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          <Icon size={14} className="text-sp-green-500" />
          <p className="text-xs font-semibold text-sp-ink-300 uppercase tracking-wider">{label}</p>
        </div>
        <button
          onClick={onLog}
          className="flex items-center gap-1 text-xs font-semibold text-sp-green-400 hover:text-sp-green-300 transition"
        >
          <Plus size={13} /> Log {label}
        </button>
      </div>

      <div className={`${card} rounded-2xl p-4 mb-3`}>
        <div className="flex items-center justify-between mb-1">
          <div>
            <p className="text-xs font-medium opacity-80">{latestLabel}</p>
            <p className="text-lg font-bold">
              {latestValue != null ? latestValue : '—'}
              {latestValue != null && <span className="text-xs font-medium ml-1 opacity-70">{unit}</span>}
            </p>
          </div>
          {goal != null && (
            <p className="text-xs font-medium text-amber-400">Goal · {goal} {unit}</p>
          )}
        </div>
        <TrendChart points={points} unit={unit} stroke={stroke} height={140} goal={goal} />
      </div>

      {entries.length === 0 ? (
        <p className="text-center text-sp-ink-300 text-sm py-4">No entries yet.</p>
      ) : (
        <div className="space-y-2">
          {entries.slice(0, 8).map((entry) => (
            <div key={entry.id} className="bg-sp-ink-800 rounded-xl border border-sp-ink-600 px-4 py-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-1.5">
                  <span className="font-bold text-white">{entry.value}</span>
                  <span className="text-xs text-sp-ink-300">{unit}</span>
                </div>
                {entry.notes && <p className="text-xs text-sp-ink-300 mt-0.5">{entry.notes}</p>}
              </div>
              <p className="text-xs text-sp-ink-300 flex-shrink-0">{entry.date ? format(new Date(entry.date), 'MMM d') : ''}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Mirrors the shape of a loaded page — streak header, week chart, by-program
// breakdown — so it doesn't flash blank before settling into place.
function ProgressSkeleton() {
  return (
    <div className="min-h-[calc(100vh-56px)] bg-sp-ink-900 px-4 py-5 space-y-4">
      <Skeleton className="h-24 rounded-2xl" />
      <Skeleton className="h-40 rounded-2xl" />
      <Skeleton className="h-32 rounded-2xl" />
    </div>
  )
}
