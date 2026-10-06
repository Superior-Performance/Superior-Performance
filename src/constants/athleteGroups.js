import { athleteTypeOf } from './programTypes.js'

/**
 * Roster groups — a winter camp cohort, a travel team training elsewhere.
 *
 * Colour here is only for telling one group's chip from another's at a
 * glance, so the palette deliberately leaves out the two colours that already
 * carry meaning everywhere else in the app: sp-green (brand accent, and
 * "done / on track") and red (destructive only). Amber is in, but only
 * because a group chip never sits next to a day's missed marker.
 *
 * Each entry's classes come in the same shapes the program types use —
 * `dotClass` for the colour dot, `badgeClass` for the chip itself — so group
 * chips and program badges sit next to each other without looking like two
 * different design systems.
 */
export const GROUP_COLORS = [
  { key: 'blue',   dotClass: 'bg-blue-500',   badgeClass: 'bg-blue-500/15 text-blue-300 border-blue-500/40',     activeClass: 'bg-blue-500/25 border-blue-400 text-blue-100' },
  { key: 'purple', dotClass: 'bg-purple-500', badgeClass: 'bg-purple-500/15 text-purple-300 border-purple-500/40', activeClass: 'bg-purple-500/25 border-purple-400 text-purple-100' },
  { key: 'amber',  dotClass: 'bg-amber-500',  badgeClass: 'bg-amber-500/15 text-amber-300 border-amber-500/40',   activeClass: 'bg-amber-500/25 border-amber-400 text-amber-100' },
  { key: 'teal',   dotClass: 'bg-teal-500',   badgeClass: 'bg-teal-500/15 text-teal-300 border-teal-500/40',     activeClass: 'bg-teal-500/25 border-teal-400 text-teal-100' },
  { key: 'sky',    dotClass: 'bg-sky-500',    badgeClass: 'bg-sky-500/15 text-sky-300 border-sky-500/40',        activeClass: 'bg-sky-500/25 border-sky-400 text-sky-100' },
  { key: 'indigo', dotClass: 'bg-indigo-500', badgeClass: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/40', activeClass: 'bg-indigo-500/25 border-indigo-400 text-indigo-100' },
]

export function groupColor(key) {
  return GROUP_COLORS.find(c => c.key === key) || GROUP_COLORS[0]
}

/** Next colour to offer a new group — the first one nothing else is using. */
export function suggestGroupColor(existingGroups = []) {
  const taken = new Set(existingGroups.map(g => g.color))
  return (GROUP_COLORS.find(c => !taken.has(c.key)) || GROUP_COLORS[0]).key
}

/** Groups an athlete belongs to, in the order the groups themselves are in. */
export function groupsOf(athlete, groups) {
  const ids = new Set(athlete?.groupIds || [])
  return groups.filter(g => ids.has(g.id))
}

/**
 * A group that is one of the Premier tier's pools, rather than a free-standing
 * cohort like a winter camp.
 *
 * Marked explicitly on the group document instead of inferred from "has
 * training days" or from who happens to be in it: the roster nests pools
 * underneath Premier, and a camp cohort that drifted in there because it also
 * had a weekly schedule would be filed under a tier it has nothing to do with.
 * Groups with no `kind` are ordinary groups, which is every group that existed
 * before pools did.
 */
export const PREMIER_POOL = 'premier_pool'

export const isPremierPool = (group) => group?.kind === PREMIER_POOL
export const premierPools  = (groups = []) => groups.filter(isPremierPool)
export const plainGroups   = (groups = []) => groups.filter(g => !isPremierPool(g))

/**
 * The filter bar's special selections. A real group id is anything else.
 *
 * 'ungrouped' earns its place: an athlete nobody has filed yet is invisible
 * in every group view, and that's exactly who a coach needs to find.
 *
 * A service tier is encoded as a prefixed string rather than given its own
 * parameter, so the roster pages keep ONE filter value to hold and pass around.
 * The prefix can't collide with a Firestore document id, which never contains
 * a colon.
 */
export const ALL_GROUPS = null
export const UNGROUPED = '__ungrouped__'
const TIER_PREFIX = 'tier:'

export const tierFilter = (tierKey) => `${TIER_PREFIX}${tierKey}`
export const tierOfFilter = (filter) =>
  typeof filter === 'string' && filter.startsWith(TIER_PREFIX) ? filter.slice(TIER_PREFIX.length) : null

/** Does this athlete belong in the current filter? */
export function matchesGroupFilter(athlete, filter) {
  if (filter === ALL_GROUPS) return true
  if (filter === UNGROUPED) return !(athlete?.groupIds?.length > 0)
  const tier = tierOfFilter(filter)
  if (tier) return athleteTypeOf(athlete) === tier
  return (athlete?.groupIds || []).includes(filter)
}
