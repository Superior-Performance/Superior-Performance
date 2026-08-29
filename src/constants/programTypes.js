// An athlete can have up to one active program per type running concurrently
// — pre-throwing (key stays 'correctives' for backward compatibility),
// throwing, mobility and lifting are independent tracks, not one program at
// a time. Programs missing `programType` predate this and are treated as
// 'correctives' everywhere they're read. Each type gets its own tab on the
// athlete's schedule — see SchedulePage.jsx.
export const PROGRAM_TYPES = [
  { key: 'correctives', label: 'Pre-Throwing', shortLabel: 'Pre-Throwing', badgeClass: 'bg-sp-green-100 text-sp-green-800', dotClass: 'bg-sp-green-500', textClass: 'text-sp-green-600' },
  { key: 'throwing',    label: 'Throwing',      shortLabel: 'Throwing',    badgeClass: 'bg-blue-100 text-blue-700',       dotClass: 'bg-blue-500',       textClass: 'text-blue-600' },
  { key: 'mobility',    label: 'Mobility',      shortLabel: 'Mobility',    badgeClass: 'bg-teal-100 text-teal-800',       dotClass: 'bg-teal-500',        textClass: 'text-teal-600' },
  { key: 'lifting',     label: 'Lifting',       shortLabel: 'Lifting',     badgeClass: 'bg-amber-100 text-amber-800',     dotClass: 'bg-amber-500',      textClass: 'text-amber-600' },
]

export function programTypeInfo(key) {
  return PROGRAM_TYPES.find(t => t.key === key) || PROGRAM_TYPES[0]
}

// A day's exercises are tagged by category (stored as free text on the
// exercise, same string the coach's Sheet puts in its "Category" column) so
// one day can mix Mobilization, Correctives, Movement Activation and one of
// the three plyo routines instead of one label for the whole day. Catch Play
// (the throwing program) is merged in alongside these as its own category —
// see CATCH_PLAY_INFO — so the athlete sees one unified, clickable set of
// category tiles per day rather than throwing as a separately-styled block.
// `aliases` covers shorthand a coach's Sheet dropdown might use instead of
// the full name (e.g. the Outputs tab's "Recovery Plyo" instead of "Recovery
// Day Plyos") — matched case/whitespace-insensitively, same as `key`.
export const EXERCISE_CATEGORIES = [
  { key: 'Mobilization',           label: 'Mobilization',           icon: 'Wind',  badgeClass: 'bg-sky-50 text-sky-700',       dotClass: 'bg-sky-500' },
  // slotLabel — when a category's either/or pairs (see utils/programIds'
  // altGroup) should read as "Corrective 1", "Corrective 2" rather than the
  // generic "Choose one," this is the singular noun to number. Only set
  // where that's actually wanted; every other category's either/or pairs
  // keep the plain "Choose one" treatment.
  { key: 'Correctives',            label: 'Correctives',            slotLabel: 'Corrective', icon: 'Heart', badgeClass: 'bg-sp-green-100 text-sp-green-800', dotClass: 'bg-sp-green-500' },
  { key: 'Movement Activation',    label: 'Movement Activation',    icon: 'Zap',   badgeClass: 'bg-amber-50 text-amber-700',   dotClass: 'bg-amber-500' },
  // shortLabel is what the athlete's daily schedule shows — "Hybrid Day
  // Plyos" vs. "High-Intent Day Plyos" vs. "Recovery Day Plyos" is a
  // distinction the coach needs when building the program (see the category
  // dropdown in ProgramEditorModal, which still shows the full `label`), but
  // a given day only ever has one of the three, so the athlete just sees
  // "Plyos" rather than the routine-specific name.
  { key: 'Hybrid Day Plyos',       label: 'Hybrid Day Plyos',       shortLabel: 'Plyos', icon: 'Flame', badgeClass: 'bg-purple-50 text-purple-700', dotClass: 'bg-purple-500', aliases: ['Hybrid Plyo', 'Hybrid Plyos'] },
  { key: 'High-Intent Day Plyos',  label: 'High-Intent Day Plyos',  shortLabel: 'Plyos', icon: 'Flame', badgeClass: 'bg-purple-50 text-purple-700', dotClass: 'bg-purple-500', aliases: ['High Intent Day Plyo', 'High Intent Plyo', 'High-Intent Plyo'] },
  { key: 'Recovery Day Plyos',     label: 'Recovery Day Plyos',     shortLabel: 'Plyos', icon: 'Flame', badgeClass: 'bg-purple-50 text-purple-700', dotClass: 'bg-purple-500', aliases: ['Recovery Plyo', 'Recovery Plyos'] },
]

export const CATCH_PLAY_INFO = { key: 'Catch Play', label: 'Catch Play', icon: 'CircleDot', badgeClass: 'bg-indigo-50 text-indigo-700', dotClass: 'bg-indigo-500' }

// College Remote Athlete Mode's four fixed day types (see AdminAthleteDetail
// and SchedulePage). A day in ANY of the athlete's active programs
// (correctives/pre-throw, throwing, mobility, lifting) can carry one of
// these as its `dayType` — the athlete then picks a type and sees every
// program's content tagged with it, merged together, regardless of which
// week it lives in.
//
// The coach's Outputs sheet encodes this by putting the label itself
// ("High Intent Day", "Recovery Day", etc.) straight into a row's Day
// column instead of a weekday name — see matchDayType below, used by
// AdminAthleteDetail's pull so this gets tagged automatically rather than
// requiring the coach to re-set it by hand in ProgramEditorModal after
// every re-pull. `key` stays 'medium' for the Hybrid entry (renamed from
// "Medium Day") so already-pulled programs' stored dayType values keep
// matching — only `label`/`aliases` changed, plus "Medium Day" is kept as
// an alias since that's still what the sheet's Day column says today.
export const DAY_TYPES = [
  { key: 'high_intent', label: 'High Intent Day', icon: 'Flame', aliases: ['High-Intent Day'] },
  { key: 'medium',      label: 'Hybrid Day',       icon: 'Zap',  aliases: ['Medium Day'] },
  { key: 'synergy',     label: 'Synergy Day',      icon: 'Sparkles' },
  { key: 'recovery',    label: 'Recovery Day',     icon: 'Moon' },
]

export function dayTypeInfo(key) {
  return DAY_TYPES.find(t => t.key === key) || null
}

// Matches a raw "Day" column value from the Outputs sheet against the day
// type labels, case/whitespace-insensitively. Returns the day type key, or
// null if it doesn't look like a day-type label (a real weekday name,
// "Day 1", "-", a date range, etc. all return null so the normal week/day
// parsing handles them instead).
export function matchDayType(raw) {
  const trimmed = String(raw || '').trim().toLowerCase()
  if (!trimmed) return null
  const found = DAY_TYPES.find(dt =>
    dt.label.toLowerCase() === trimmed || (dt.aliases || []).some(a => a.toLowerCase() === trimmed)
  )
  return found ? found.key : null
}

// Lifting's own College Remote Athlete Mode day types — completely separate
// from DAY_TYPES above. A lifting split (upper/lower, twice each) isn't a
// point on the same throwing-intensity axis as High Intent/Hybrid/Synergy/
// Recovery, so it needed its own vocabulary rather than being forced onto
// that one. A lifting day's `dayType` field is drawn from this list instead
// — same field, same findDayForType matching, just a different set of valid
// values depending on the program's type. Never mix these two lists.
// `label` is exactly the Lifting Outputs sheet's Day column text ("Upper Day
// 1", not "Upper Body Day 1") — matchLiftingDayType does an exact match, so
// drifting from the sheet's actual wording here silently breaks every pull
// (it did once already; see AdminAthleteDetail's createDraftFromRows).
export const LIFTING_DAY_TYPES = [
  { key: 'upper_1', label: 'Upper Day 1', icon: 'Dumbbell' },
  { key: 'lower_1', label: 'Lower Day 1', icon: 'Dumbbell' },
  { key: 'upper_2', label: 'Upper Day 2', icon: 'Dumbbell' },
  { key: 'lower_2', label: 'Lower Day 2', icon: 'Dumbbell' },
]

export function liftingDayTypeInfo(key) {
  return LIFTING_DAY_TYPES.find(t => t.key === key) || null
}

// Mirrors matchDayType above, against LIFTING_DAY_TYPES instead of
// DAY_TYPES — used only when pulling a `lifting` program from the sheet.
export function matchLiftingDayType(raw) {
  const trimmed = String(raw || '').trim().toLowerCase()
  if (!trimmed) return null
  const found = LIFTING_DAY_TYPES.find(dt => dt.label.toLowerCase() === trimmed)
  return found ? found.key : null
}

const GENERAL_INFO = { key: 'General', label: 'General', icon: 'ListChecks', badgeClass: 'bg-gray-100 text-gray-600', dotClass: 'bg-gray-400' }

// A lifting day's exercises are grouped by the sheet's Block column ("Block
// A", "Block B", ...) instead of the correctives-style category taxonomy —
// see AdminAthleteDetail's createDraftFromRows. Gets its own icon/color
// rather than falling into the fully generic GENERAL_INFO treatment.
const LIFTING_BLOCK_INFO = { icon: 'Dumbbell', badgeClass: 'bg-sp-green-100 text-sp-green-800', dotClass: 'bg-sp-green-500' }
const BLOCK_LABEL_RE = /^block\s+([a-z])$/i

function matchesCategory(cat, trimmedLower) {
  if (cat.key.toLowerCase() === trimmedLower) return true
  return (cat.aliases || []).some(a => a.toLowerCase() === trimmedLower)
}

// Matches case/whitespace-insensitively, plus known shorthand aliases, so a
// coach's Sheet dropdown doesn't have to spell things out exactly the way the
// app does to get the right color and icon; anything still unrecognized
// renders with a neutral style instead of falling over.
export function exerciseCategoryInfo(label) {
  const trimmed = String(label || '').trim()
  if (!trimmed) return GENERAL_INFO
  const trimmedLower = trimmed.toLowerCase()
  if (trimmedLower === CATCH_PLAY_INFO.key.toLowerCase()) return CATCH_PLAY_INFO
  const found = EXERCISE_CATEGORIES.find(c => matchesCategory(c, trimmedLower))
  if (found) return found
  if (BLOCK_LABEL_RE.test(trimmed)) return { ...LIFTING_BLOCK_INFO, key: trimmed, label: trimmed }
  return { ...GENERAL_INFO, key: trimmed, label: trimmed }
}

// Display order when categories from different programs (correctives, catch
// play, lifting) get merged onto the same day — unrecognized categories sort
// after all of these, in the order they were first encountered.
const CATEGORY_ORDER = [
  'Mobilization', 'Correctives', 'Movement Activation',
  'Hybrid Day Plyos', 'High-Intent Day Plyos', 'Recovery Day Plyos', 'Catch Play',
]

export function categoryRank(label) {
  const trimmed = String(label || '').trim().toLowerCase()
  // Block A/B/C need a real, deterministic order (not "whatever order the
  // sheet rows happened to arrive in") since they're the whole point of the
  // lifting tab's block accordion — rank by the letter itself, ahead of the
  // Infinity fallback every other unrecognized category gets.
  const blockMatch = trimmed.match(BLOCK_LABEL_RE)
  if (blockMatch) return 1000 + (blockMatch[1].charCodeAt(0) - 97)
  const direct = CATEGORY_ORDER.findIndex(c => c.toLowerCase() === trimmed)
  if (direct !== -1) return direct
  const viaAlias = EXERCISE_CATEGORIES.findIndex(c => matchesCategory(c, trimmed))
  return viaAlias === -1 ? Infinity : CATEGORY_ORDER.indexOf(EXERCISE_CATEGORIES[viaAlias].key)
}
