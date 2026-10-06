import { Settings2, CornerDownRight } from 'lucide-react'
import {
  groupColor, ALL_GROUPS, UNGROUPED, matchesGroupFilter,
  tierFilter, tierOfFilter, premierPools, plainGroups,
} from '../constants/athleteGroups'
import { ATHLETE_TYPES } from '../constants/programTypes'

/**
 * How a coach narrows the roster — by service tier first, then by group.
 * The dashboard and the athletes list both sit behind it, so a selection means
 * the same set of athletes and shows the same count on either page.
 *
 * The shape mirrors how the business is actually organised rather than how the
 * data happens to be stored: In-House / Remote / Premier across the top, and
 * Premier's pools indented underneath it, because a pool is a subdivision of
 * Premier and not a peer of it. Pools only appear once Premier (or one of them)
 * is selected — three extra chips on every page load, for a tier most athletes
 * aren't on, is noise in the way of the filter people reach for most.
 *
 * Counts come from the athletes actually passed in, not from a stored member
 * count, so a chip can never claim 12 athletes while the list under it shows
 * 11. Chips with no members still render: an empty pool the coach just created
 * should be visible enough to file people into, not hidden until it already
 * has someone in it.
 */
export default function GroupFilterBar({
  groups = [],
  athletes = [],
  value = ALL_GROUPS,
  onChange,
  onManage,
  className = '',
}) {
  const countFor = (filter) => athletes.filter(a => matchesGroupFilter(a, filter)).length
  const ungroupedCount = countFor(UNGROUPED)

  const pools  = premierPools(groups)
  const others = plainGroups(groups)

  // Premier's pools stay open while anything inside Premier is selected, so
  // switching between pools doesn't make the row you're using disappear.
  const activeTier = tierOfFilter(value)
  const poolSelected = pools.some(p => p.id === value)
  const showPools = pools.length > 0 && (activeTier === 'premier' || poolSelected)

  const chip = (key, label, count, classes, dot) => {
    const active = value === key
    return (
      <button
        key={String(key)}
        type="button"
        onClick={() => onChange(active ? ALL_GROUPS : key)}
        aria-pressed={active}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition ${
          active ? classes.active : classes.idle
        }`}
      >
        {dot && <span className={`w-2 h-2 rounded-full ${dot}`} />}
        {label}
        <span className={active ? 'opacity-80' : 'text-sp-ink-300/70'}>{count}</span>
      </button>
    )
  }

  const neutral = {
    active: 'bg-sp-green-500/20 border-sp-green-500 text-sp-green-300',
    idle: 'bg-sp-ink-800 border-sp-ink-600 text-sp-ink-200 hover:border-sp-ink-300/40',
  }

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex flex-wrap items-center gap-2">
        {chip(ALL_GROUPS, 'All athletes', athletes.length, neutral, null)}

        {ATHLETE_TYPES.map(({ key, label }) =>
          chip(tierFilter(key), label, countFor(tierFilter(key)), neutral, null)
        )}

        {/* Groups that aren't Premier pools — a camp, a travel team. They sit
            alongside the tiers because they cut across them. */}
        {others.map(g => {
          const c = groupColor(g.color)
          return chip(g.id, g.name, countFor(g.id), {
            active: c.activeClass,
            idle: `${c.badgeClass} hover:brightness-125`,
          }, c.dotClass)
        })}

        {ungroupedCount > 0 && others.length > 0 && chip(UNGROUPED, 'Ungrouped', ungroupedCount, neutral, null)}

        {onManage && (
          <button
            type="button"
            onClick={onManage}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-sp-ink-300 hover:text-sp-green-400 transition"
          >
            <Settings2 size={13} /> {groups.length === 0 ? 'Create a group' : 'Manage groups'}
          </button>
        )}
      </div>

      {showPools && (
        <div className="flex flex-wrap items-center gap-2 pl-4">
          <CornerDownRight size={13} className="text-sp-ink-300/60 flex-shrink-0" aria-hidden="true" />
          {pools.map(p => {
            const c = groupColor(p.color)
            return chip(p.id, p.name, countFor(p.id), {
              active: c.activeClass,
              idle: `${c.badgeClass} hover:brightness-125`,
            }, c.dotClass)
          })}
        </div>
      )}
    </div>
  )
}
