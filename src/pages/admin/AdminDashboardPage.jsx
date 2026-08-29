import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  getAllAthletes, getAllPrograms, getCompletions, getDataLogs, setDataLogFlag,
  getChatMessages, getAllChatReads,
} from '../../firebase/firestore'
import { buildSlots, isSlotComplete, countProgramProgress } from '../../utils/programIds'
import { computeStreak } from '../../utils/programSchedule'
import { initials } from '../../utils/initials'
import { LayoutDashboard, Flag, Clock, TrendingDown, FileClock, MessageCircle, Zap, Scale, ChevronRight, X } from 'lucide-react'
import { format, formatDistanceToNow } from 'date-fns'
import toast from 'react-hot-toast'
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

// Each tile doubles as a filter — clicking one narrows the page to just that
// category instead of being a dead-end count. `hasFeed` categories already
// have a richer list above the roster (message/note preview), so selecting
// them shows that feed instead of duplicating it as a flat roster filter.
const FILTERS = {
  unread:   { label: 'Unread messages',       hasFeed: true,  test: r => r.unreadCount > 0 },
  flagged:  { label: 'Flagged notes',         hasFeed: true,  test: r => r.flagCount > 0 },
  inactive: { label: `Inactive ${INACTIVE_DAYS}+ days`, hasFeed: false, test: r => r.inactive },
  behind:   { label: 'Behind on program',     hasFeed: false, test: r => r.behind },
  drafts:   { label: 'Drafts awaiting review', hasFeed: false, test: r => r.draftCount > 0 },
}

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

// Stands in for a completions snapshot when it's skipped entirely (see
// below) so the row-building loop doesn't need a separate no-completions
// code path — it just iterates zero docs.
const EMPTY_SNAPSHOT = { forEach: () => {} }

// This page fans out to Firestore reads per athlete (completions, data
// logs, chat messages) — real latency on a roster of any size, and it's now
// the page every admin session opens on first. Module-level so it survives
// navigating away and back within the same browser session (not a hard
// reload): the second-and-later visit paints instantly from this while a
// background refresh quietly brings it up to date, instead of re-paying the
// full fan-out and showing a blank loading state every single time.
let dashboardCache = null

export default function AdminDashboardPage() {
  const [loading, setLoading] = useState(!dashboardCache)
  const [refreshing, setRefreshing] = useState(false)
  const [rows, setRows] = useState(dashboardCache?.rows || [])       // one per athlete
  const [flagged, setFlagged] = useState(dashboardCache?.flagged || []) // flattened flagged log entries, newest first
  const [unread, setUnread] = useState(dashboardCache?.unread || [])   // one per athlete with unread messages, newest first
  const [activeFilter, setActiveFilter] = useState(null) // one of FILTERS' keys, or null

  function toggleFilter(key) {
    setActiveFilter(prev => prev === key ? null : key)
  }

  useEffect(() => { load(!!dashboardCache) }, [])

  async function load(isBackgroundRefresh) {
    if (isBackgroundRefresh) setRefreshing(true)
    else setLoading(true)
    try {
      // chatReads doesn't depend on the athlete list, so it rides along with
      // wave 1 instead of waiting for it — one fewer round trip in the
      // critical path.
      const [athletesSnap, programsSnap, chatReadsSnap] = await Promise.all([
        getAllAthletes(), getAllPrograms(), getAllChatReads(),
      ])
      const athletes = athletesSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      const allPrograms = programsSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      const chatReadByAthlete = {}
      chatReadsSnap.forEach(d => { chatReadByAthlete[d.id] = d.data() })

      // Known before wave 2 fires (allPrograms is already in hand), so an
      // athlete with no active program at all — nothing to be "behind" or
      // "inactive" on — never needs a completions read in the first place.
      const activeProgramsByAthlete = {}
      athletes.forEach(a => {
        activeProgramsByAthlete[a.id] = allPrograms.filter(p => p.athleteId === a.id && p.active === true)
      })

      const [completionsSnaps, logsSnaps, messagesSnaps] = await Promise.all([
        Promise.all(athletes.map(a =>
          activeProgramsByAthlete[a.id].length > 0 ? getCompletions(a.id) : Promise.resolve(EMPTY_SNAPSHOT)
        )),
        Promise.all(athletes.map(a => getDataLogs(a.id))),
        // Narrowed to "created after this athlete's chatReads.lastReadAt" —
        // an established thread with months of history only ever pulls
        // back what might actually be unread, not the whole conversation.
        Promise.all(athletes.map(a => getChatMessages(a.id, toMillis(chatReadByAthlete[a.id]?.lastReadAt) || null))),
      ])

      const flaggedFeed = []
      const unreadFeed = []
      const nextRows = athletes.map((athlete, i) => {
        const athletePrograms = allPrograms.filter(p => p.athleteId === athlete.id)
        const activePrograms = activeProgramsByAthlete[athlete.id]
        const draftCount = athletePrograms.filter(p => p.active === false && !p.archived).length

        const completions = {}
        completionsSnaps[i].forEach(d => { completions[d.id] = d.data() })
        const logs = logsSnaps[i].docs.map(d => ({ id: d.id, ...d.data() }))

        logs.filter(l => l.flagged).forEach(entry => {
          flaggedFeed.push({ athleteId: athlete.id, athleteName: athlete.name, entry })
        })

        const pct = athleteProgress(activePrograms, completions)
        const lastActivityMs = lastActivityMillis(completionsSnaps[i], logsSnaps[i])
        const inactive = activePrograms.length > 0 &&
          (!lastActivityMs || Date.now() - lastActivityMs > INACTIVE_DAYS * 86400000)
        const behind = pct != null && pct < BEHIND_THRESHOLD

        // Athlete-authored messages newer than the coach's last-opened marker
        // for this thread — see chatReads in firebase/firestore.js. The role
        // check still needs to happen client-side (the query only narrows by
        // date), but the date narrowing already did the heavy lifting.
        const lastReadMs = toMillis(chatReadByAthlete[athlete.id]?.lastReadAt)
        const unreadMessages = messagesSnaps[i].docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(m => m.role === 'athlete' && toMillis(m.createdAt) > lastReadMs)
        if (unreadMessages.length > 0) {
          unreadFeed.push({ athleteId: athlete.id, athleteName: athlete.name, latest: unreadMessages[0], count: unreadMessages.length })
        }

        return {
          athlete, activePrograms, draftCount,
          pct, lastActivityMs, inactive, behind,
          flagCount: logs.filter(l => l.flagged).length,
          unreadCount: unreadMessages.length,
        }
      })

      flaggedFeed.sort((a, b) => toMillis(b.entry.date) - toMillis(a.entry.date))
      unreadFeed.sort((a, b) => toMillis(b.latest.createdAt) - toMillis(a.latest.createdAt))
      dashboardCache = { rows: nextRows, flagged: flaggedFeed, unread: unreadFeed }
      setRows(nextRows)
      setFlagged(flaggedFeed)
      setUnread(unreadFeed)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  async function resolveFlag(athleteId, entryId) {
    // Optimistic — pull it from the feed immediately, restore + toast if the write fails.
    const prevFlagged = flagged
    setFlagged(prev => prev.filter(f => !(f.athleteId === athleteId && f.entry.id === entryId)))
    setRows(prev => prev.map(r => r.athlete.id === athleteId ? { ...r, flagCount: Math.max(0, r.flagCount - 1) } : r))
    if (dashboardCache) {
      dashboardCache = {
        ...dashboardCache,
        flagged: dashboardCache.flagged.filter(f => !(f.athleteId === athleteId && f.entry.id === entryId)),
        rows: dashboardCache.rows.map(r => r.athlete.id === athleteId ? { ...r, flagCount: Math.max(0, r.flagCount - 1) } : r),
      }
    }
    try {
      await setDataLogFlag(athleteId, entryId, false)
    } catch {
      toast.error('Could not resolve flag.')
      setFlagged(prevFlagged)
    }
  }

  if (loading) {
    return (
      <div className="p-8 bg-sp-ink-900 min-h-full flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-sp-green-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-sp-ink-300">Loading dashboard…</p>
        </div>
      </div>
    )
  }

  const inactiveCount = rows.filter(r => r.inactive).length
  const behindCount = rows.filter(r => r.behind).length
  const draftTotal = rows.reduce((s, r) => s + r.draftCount, 0)
  const unreadCount = rows.reduce((s, r) => s + r.unreadCount, 0)

  // Selecting a tile narrows the page to just that category. The two feed
  // categories (unread/flagged) already have a richer list than the roster
  // table can show, so picking one of those shows its feed instead of a
  // second, flatter view of the same thing; the other three have no feed at
  // all today, so the roster filtered down to just them is the whole point.
  const showUnreadFeed = !activeFilter || activeFilter === 'unread'
  const showFlaggedFeed = !activeFilter || activeFilter === 'flagged'
  const showRoster = !activeFilter || !FILTERS[activeFilter].hasFeed
  const rosterRows = activeFilter ? rows.filter(FILTERS[activeFilter].test) : rows

  return (
    <div className="p-8 bg-sp-ink-900 min-h-full">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-sp-green-500/15 text-sp-green-400 flex items-center justify-center flex-shrink-0">
          <LayoutDashboard size={20} />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-white">Dashboard</h1>
            {refreshing && (
              <div className="w-3.5 h-3.5 border-2 border-sp-green-500 border-t-transparent rounded-full animate-spin" title="Refreshing…" />
            )}
          </div>
          <p className="text-sp-ink-300 text-sm">What needs your attention today</p>
        </div>
      </div>

      {/* Needs attention tiles — each doubles as a filter, click to narrow the page */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        <Tile Icon={MessageCircle} value={unreadCount} label="Unread messages" tone="amber" active={activeFilter === 'unread'} onClick={() => toggleFilter('unread')} />
        <Tile Icon={Flag} value={flagged.length} label="Flagged notes" tone="amber" active={activeFilter === 'flagged'} onClick={() => toggleFilter('flagged')} />
        <Tile Icon={Clock} value={inactiveCount} label={`Inactive ${INACTIVE_DAYS}+ days`} tone="red" active={activeFilter === 'inactive'} onClick={() => toggleFilter('inactive')} />
        <Tile Icon={TrendingDown} value={behindCount} label="Behind on program" tone="amber" active={activeFilter === 'behind'} onClick={() => toggleFilter('behind')} />
        <Tile Icon={FileClock} value={draftTotal} label="Drafts awaiting review" tone="neutral" active={activeFilter === 'drafts'} onClick={() => toggleFilter('drafts')} />
      </div>

      {activeFilter && (
        <div className="flex items-center gap-2 mb-6">
          <span className="text-sm text-sp-ink-300">Showing <span className="text-white font-medium">{FILTERS[activeFilter].label}</span></span>
          <button onClick={() => setActiveFilter(null)} className="flex items-center gap-1 text-xs font-semibold text-sp-green-400 hover:text-sp-green-300 transition">
            <X size={12} /> Clear
          </button>
        </div>
      )}

      {/* Unread messages feed */}
      {showUnreadFeed && (
      <div className="mb-8">
        <p className="text-xs font-bold text-sp-ink-300 uppercase tracking-wider mb-3">Unread messages</p>
        {unread.length === 0 ? (
          <div className="bg-sp-ink-800 rounded-2xl border border-sp-ink-600 p-6 text-center text-sm text-sp-ink-300">
            No unread messages.
          </div>
        ) : (
          <div className="space-y-2">
            {unread.map(({ athleteId, athleteName, latest, count }) => (
              <Link
                key={athleteId}
                to={`/admin/chat/${athleteId}`}
                className="bg-sp-ink-800 border border-amber-500/30 rounded-xl px-4 py-3 flex items-center gap-3 hover:bg-white/[0.04] transition"
              >
                <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-semibold text-white">{athleteName}</span>
                    <span className="text-[10px] font-medium bg-amber-500/15 text-amber-400 px-1.5 py-0.5 rounded-full">
                      {count} new
                    </span>
                  </div>
                  <p className="text-sm text-sp-ink-100 mt-0.5 truncate">{latest.text}</p>
                </div>
                <span className="text-xs text-sp-ink-300 flex-shrink-0">
                  {latest.createdAt ? formatDistanceToNow(new Date(toMillis(latest.createdAt)), { addSuffix: true }) : ''}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
      )}

      {/* Flagged notes feed */}
      {showFlaggedFeed && (
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
      )}

      {/* Roster */}
      {showRoster && (
      <div>
        <p className="text-xs font-bold text-sp-ink-300 uppercase tracking-wider mb-3">
          Roster{activeFilter ? ` — ${FILTERS[activeFilter].label} (${rosterRows.length})` : ''}
        </p>
        {rosterRows.length === 0 ? (
          <EmptyState
            icon={LayoutDashboard}
            title={activeFilter ? 'Nothing here' : 'No athletes yet'}
            subtitle={activeFilter ? 'No athletes match this filter.' : 'Add an athlete to see them here.'}
            compact dark
          />
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
                {rosterRows.map(({ athlete, activePrograms, draftCount, pct, lastActivityMs, inactive, behind, flagCount, unreadCount }) => (
                  <tr key={athlete.id} className="hover:bg-white/[0.04]">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-sp-green-500/20 text-sp-green-400 flex items-center justify-center font-bold text-sm flex-shrink-0">
                          {initials(athlete.name)}
                        </div>
                        <span className="font-medium text-white">{athlete.name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-sp-ink-300">
                      {activePrograms.length === 0 ? 'No program' : pct != null ? `${pct}% complete` : 'Not started yet'}
                      {draftCount > 0 && (
                        <span className="ml-1.5 text-[10px] font-medium bg-white/5 text-sp-ink-300 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                          {draftCount} draft{draftCount === 1 ? '' : 's'}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-sp-ink-300">
                      {lastActivityMs ? formatDistanceToNow(new Date(lastActivityMs), { addSuffix: true }) : '—'}
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge hasProgram={activePrograms.length > 0} unreadCount={unreadCount} flagCount={flagCount} inactive={inactive} behind={behind} />
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
      )}
    </div>
  )
}

const TILE_TONE = {
  amber: 'text-amber-400',
  red: 'text-red-400',
  neutral: 'text-white',
}

const TILE_RING = {
  amber: 'border-amber-500/60',
  red: 'border-red-500/60',
  neutral: 'border-sp-green-500/60',
}

// Doubles as a filter toggle — see toggleFilter/FILTERS above. `active`
// rings the tile in its own tone so the selected filter stays visible even
// after the page has scrolled past the tile row.
function Tile({ Icon, value, label, tone, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`text-left bg-sp-ink-800 border rounded-2xl p-4 transition hover:bg-white/[0.04] ${
        active ? TILE_RING[tone] : 'border-sp-ink-600'
      }`}
    >
      <div className="flex items-center gap-1.5 mb-1">
        <Icon size={13} className="text-sp-ink-300" />
        <span className={`text-2xl font-bold ${TILE_TONE[tone]}`}>{value}</span>
      </div>
      <p className="text-xs text-sp-ink-300">{label}</p>
    </button>
  )
}

// Priority: an unread message beats everything (the athlete is waiting on a
// reply right now, regardless of program status), then a flag open (a coach
// explicitly wants to follow up), then inactivity (not engaging at all),
// then behind pace, then on track. An athlete with no program at all and
// nothing else going on just shows that.
function StatusBadge({ hasProgram, unreadCount, flagCount, inactive, behind }) {
  if (unreadCount > 0) {
    return <span className="text-xs font-medium bg-amber-500/15 text-amber-400 px-2 py-0.5 rounded-full whitespace-nowrap">New message</span>
  }
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
