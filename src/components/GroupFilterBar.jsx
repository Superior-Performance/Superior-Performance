import { Users2, Settings2 } from 'lucide-react'
import { groupColor, ALL_GROUPS, UNGROUPED, matchesGroupFilter } from '../constants/athleteGroups'

/**
 * One row of chips for narrowing a roster to a group — the dashboard and the
 * athletes list both sit behind it, so "Winter Camp" means the same set of
 * athletes and shows the same count on either page.
 *
 * Counts come from the athletes actually passed in, not from a stored member
 * count, so a chip can never claim 12 athletes while the list under it shows
 * 11. Chips with no members still render: an empty group the coach just
 * created should be visible enough to file people into, not hidden until it
 * already has someone in it.
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

  // Nothing to filter by yet — offer the way in rather than an empty bar.
  if (groups.length === 0) {
    return onManage ? (
      <button
        type="button"
        onClick={onManage}
        className={`inline-flex items-center gap-1.5 text-xs text-sp-ink-300 hover:text-sp-green-400 transition ${className}`}
      >
        <Users2 size={14} /> Create a group
      </button>
    ) : null
  }

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
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      {chip(ALL_GROUPS, 'All athletes', athletes.length, neutral, null)}

      {groups.map(g => {
        const c = groupColor(g.color)
        return chip(g.id, g.name, countFor(g.id), {
          active: `${c.activeClass}`,
          idle: `${c.badgeClass} hover:brightness-125`,
        }, c.dotClass)
      })}

      {ungroupedCount > 0 && chip(UNGROUPED, 'Ungrouped', ungroupedCount, neutral, null)}

      {onManage && (
        <button
          type="button"
          onClick={onManage}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-sp-ink-300 hover:text-sp-green-400 transition"
        >
          <Settings2 size={13} /> Manage groups
        </button>
      )}
    </div>
  )
}
