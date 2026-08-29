import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  getAllAthletes, getAllPrograms, getCompletions, getDataLogs, getAthletePrefs, setDataLogFlag,
} from '../../firebase/firestore'
import { buildSlots, isSlotComplete, countProgramProgress } from '../../utils/programIds'
import { computeStreak } from '../../utils/programSchedule'
import { LayoutDashboard, Flag, Clock, TrendingDown, FileClock, Zap, Scale, ChevronRight } from 'lucide-react'
import { format, formatDistanceToNow } from 'date-fns'
import toast from 'react-hot-toast'
import Skeleton from '../../components/Skeleton'
import EmptyState from '../../components/EmptyState'

// Below this elapsed-completion % an athlete shows as "Behind" — elapsed
// meaning weeks that have actually started, not the whole program, so
// someone in week 1 of 12 isn't penalized for weeks that haven't happened
// yet. See athleteProgress below.
const BEHIND_THRESHOLD = 70
// No completion or logged entry in this many days reads as "Inactive" —
// only applied to athletes who actually have an active program to be
// inactive on.
const INACTIVE_DAYS = 10

const toMillis = (t) => (t?.toMillis?.() ?? (t ? new Date(t).getTime() : 0))

// How much of an athlete's program is done, counted only through the week
// they're actually on right now (see computeStreak) — not the whole
// program, which would make week 1 of a 12-week block read as "8% done"
// regardless of whether they're on pace.
function athleteProgress(programs, completions) {
  if (programs.length === 0) return null
  const totalWeeks = Math.max(1, ...programs.map(p => p.weeks?.length || 0))
  const { pos } = computeStreak(programs, completions, totalWeeks)
  if (pos.notStartedYet) return null
  let total = 0, done = 0
  programs.forEach(p => {
    for (let wi = 0; wi <= pos.weekIdx; wi++) {
      const r = countProgramProgress(completions, p, wi)
      total += r.total
      done += r.done
    }
  })
  return total ? Math.round((done / total) * 100) : null
}

function lastActivityMillis(completionsSnap, logsSnap) {
  let max = 0
  completionsSnap.forEach(d => { const t = d.data().completedAt?.toMillis?.(); if (t && t > max) max = t })
  logsSnap.forEach(d => { const t = d.data().createdAt?.toMillis?.(); if (t && t > max) max = t })
  return max || null
}

export default function AdminDashboardPage() {
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState([])       // one per athlete
  const [flagged, setFlagged] = useState([]) // flattened flagged log entries, newest first

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const [athletesSnap, programsSnap] = await Promise.all([getAllAthletes(), getAllPrograms()])
      const athletes = athletesSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      const allPrograms = programsSnap.docs.map(d => ({ id: d.id, ...d.data() }))

      const [completionsSnaps, logsSnaps, prefsSnaps] = await Promise.all([
        Promise.all(athletes.map(a => getCompletions(a.id))),
        Promise.all(athletes.map(a => getDataLogs(a.id))),
        Promise.all(athletes.map(a => getAthletePrefs(a.id))),
      ])

      const flaggedFeed = []
      const nextRows = athletes.map((athlete, i) => {
        const athletePrograms = allPrograms.filter(p => p.athleteId === athlete.id)
        const activePrograms = athletePrograms.filter(p => p.active === true)
        const draftCount = athletePrograms.filter(p => p.active === false && !p.archived).length

        const completions = {}
        completionsSnaps[i].forEach(d => { completions[d.id] = d.data() })
        const logs = logsSnaps[i].docs.map(d => ({ id: d.id, ...d.data() }))

        logs.filter(l => l.flagged).forEach(entry => {
          flaggedFeed.push({ athleteId: athlete.id, athleteName: athlete.name, entry })
        })

        const prefsSeen = prefsSnaps[i].data()?.programNoticesSeen || {}
        const unacknowledged = activePrograms.filter(
          p => p.lastEditedAt && toMillis(p.lastEditedAt) > toMillis(prefsSeen[p.id])
        ).length

        const pct = athleteProgress(activePrograms, completions)
        const lastActivityMs = lastActivityMillis(completionsSnaps[i], logsSnaps[i])
        const inactive = activePrograms.length > 0 &&
          (!lastActivityMs || Date.now() - lastActivityMs > INACTIVE_DAYS * 86400000)
        const behind = pct != null && pct < BEHIND_THRESHOLD

        return {
          athlete, activePrograms, draftCount, unacknowledged,
          pct, lastActivityMs, inactive, behind,
          flagCount: logs.filter(l => l.flagged).length,
        }
      })

      flaggedFeed.sort((a, b) => toMillis(b.entry.date) - toMillis(a.entry.date))
      setRows(nextRows)
      setFlagged(flaggedFeed)
    } finally {
      setLoading(false)
    }
  }

  async function resolveFlag(athleteId, entryId) {
    // Optimistic — pull it from the feed immediately, restore + toast if the write fails.
    const prevFlagged = flagged
    setFlagged(prev => prev.filter(f => !(f.athleteId === athleteId && f.entry.id === entryId)))
    setRows(prev => prev.map(r => r.athlete.id === athleteId ? { ...r, flagCount: Math.max(0, r.flagCount - 1) } : r))
    try {
      await setDataLogFlag(athleteId, entryId, false)
    } catch {
      toast.error('Could not resolve flag.')
      setFlagged(prevFlagged)
    }
  }

  if (loading) {
    return (
      <div className="p-8 bg-sp-ink-900 min-h-full space-y-4">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
        </div>
        <Skeleton className="h-48 rounded-2xl" />
      </div>
    )
  }

  const inactiveCount = rows.filter(r => r.inactive).length
  const behindCount = rows.filter(r => r.behind).length
  const draftTotal = rows.reduce((s, r) => s + r.draftCount, 0)

  return (
    <div className="p-8 bg-sp-ink-900 min-h-full">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-sp-green-500/15 text-sp-green-400 flex items-center justify-center flex-shrink-0">
          <LayoutDashboard size={20} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-sp-ink-300 text-sm">What needs your attention today</p>
        </div>
      </div>

      {/* Needs attention tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <Tile Icon={Flag} value={flagged.length} label="Flagged notes" tone="amber" />
        <Tile Icon={Clock} value={inactiveCount} label={`Inactive ${INACTIVE_DAYS}+ days`} tone="red" />
        <Tile Icon={TrendingDown} value={behindCount} label="Behind on program" tone="amber" />
        <Tile Icon={FileClock} value={draftTotal} label="Drafts awaiting review" tone="neutral" />
      </div>

      {/* Flagged notes feed */}
      <div className="mb-8">
        <p className="text-xs font-bold text-sp-ink-300 uppercase tracking-wider mb-3">Flagged notes</p>
        {flagged.length === 0 ? (
          <div className="bg-sp-ink-800 rounded-2xl border border-sp-ink-600 p-6 text-center text-sm text-sp-ink-300">
            Nothing flagged right now.
          </div>
        ) : (
          <div className="space-y-2">
            {flagged.map(({ athleteId, athleteName, entry }) => (
              <div key={entry.id} className="bg-sp-ink-800 border border-amber-500/30 rounded-xl px-4 py-3 flex items-center gap-3">
                <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <Link to={`/admin/athletes/${athleteId}`} className="text-sm font-semibold text-white hover:text-sp-green-400 transition">
                      {athleteName}
                    </Link>
                    <span className="inline-flex items-center gap-1 text-xs text-sp-ink-300">
                      {entry.type === 'velo' ? <Zap size={11} /> : <Scale size={11} />}
                      {entry.type === 'velo' ? 'Velo' : 'Body Weight'} · {entry.value} {entry.type === 'velo' ? 'mph' : 'lbs'}
                    </span>
                  </div>
                  {entry.notes && <p className="text-sm text-sp-ink-100 mt-0.5 truncate">&ldquo;{entry.notes}&rdquo;</p>}
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="text-xs text-sp-ink-300">{entry.date ? formatDistanceToNow(new Date(entry.date), { addSuffix: true }) : ''}</span>
                  <button onClick={() => resolveFlag(athleteId, entry.id)} className="text-xs font-semibold text-sp-green-500 hover:text-sp-green-400 transition">
                    Resolve
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Roster */}
      <div>
        <p className="text-xs font-bold text-sp-ink-300 uppercase tracking-wider mb-3">Roster</p>
        {rows.length === 0 ? (
          <EmptyState icon={LayoutDashboard} title="No athletes yet" subtitle="Add an athlete to see them here." compact dark />
        ) : (
          <div className="bg-sp-ink-800 rounded-2xl border border-sp-ink-600 overflow-hidden">
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-white/[0.03] border-b border-sp-ink-600">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-sp-ink-300 uppercase tracking-wider">Athlete</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-sp-ink-300 uppercase tracking-wider">Program</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-sp-ink-300 uppercase tracking-wider">Last activity</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-sp-ink-300 uppercase tracking-wider">Status</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-sp-ink-600/60">
                {rows.map(({ athlete, activePrograms, pct, lastActivityMs, inactive, behind, flagCount }) => (
                  <tr key={athlete.id} className="hover:bg-white/[0.04]">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-sp-green-500/20 text-sp-green-400 flex items-center justify-center font-bold text-sm flex-shrink-0">
                          {athlete.name?.charAt(0) || '?'}
                        </div>
                        <span className="font-medium text-white">{athlete.name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-sp-ink-300">
                      {activePrograms.length === 0 ? 'No program' : pct != null ? `${pct}% complete` : 'Not started yet'}
                    </td>
                    <td className="px-5 py-3 text-sp-ink-300">
                      {lastActivityMs ? formatDistanceToNow(new Date(lastActivityMs), { addSuffix: true }) : '—'}
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge hasProgram={activePrograms.length > 0} flagCount={flagCount} inactive={inactive} behind={behind} />
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Link to={`/admin/athletes/${athlete.id}`} className="inline-flex items-center gap-1 text-sp-green-400 text-sm font-medium hover:text-sp-green-300 transition">
                        View <ChevronRight size={14} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const TILE_TONE = {
  amber: 'text-amber-400',
  red: 'text-red-400',
  neutral: 'text-white',
}

function Tile({ Icon, value, label, tone }) {
  return (
    <div className="bg-sp-ink-800 border border-sp-ink-600 rounded-2xl p-4">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon size={13} className="text-sp-ink-300" />
        <span className={`text-2xl font-bold ${TILE_TONE[tone]}`}>{value}</span>
      </div>
      <p className="text-xs text-sp-ink-300">{label}</p>
    </div>
  )
}

// Priority: a flag open beats everything (a coach explicitly wants to
// follow up), then inactivity (not engaging at all), then behind pace,
// then on track. An athlete with no program at all just shows that.
function StatusBadge({ hasProgram, flagCount, inactive, behind }) {
  if (!hasProgram) {
    return <span className="text-xs font-medium bg-white/5 text-sp-ink-300 px-2 py-0.5 rounded-full whitespace-nowrap">No program</span>
  }
  if (flagCount > 0) {
    return <span className="text-xs font-medium bg-amber-500/15 text-amber-400 px-2 py-0.5 rounded-full whitespace-nowrap">Flag open</span>
  }
  if (inactive) {
    return <span className="text-xs font-medium bg-red-500/15 text-red-400 px-2 py-0.5 rounded-full whitespace-nowrap">Inactive</span>
  }
  if (behind) {
    return <span className="text-xs font-medium bg-amber-500/15 text-amber-400 px-2 py-0.5 rounded-full whitespace-nowrap">Behind</span>
  }
  return <span className="text-xs font-medium bg-sp-green-500/15 text-sp-green-500 px-2 py-0.5 rounded-full whitespace-nowrap">On track</span>
}
