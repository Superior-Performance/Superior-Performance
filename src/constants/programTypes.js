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

const GENERAL_INFO = { key: 'General', label: 'General', icon: 'ListChecks', badgeClass: 'bg-gray-100 text-gray-600', dotClass: 'bg-gray-400' }

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
  return found ? found : { ...GENERAL_INFO, key: trimmed, label: trimmed }
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
  const direct = CATEGORY_ORDER.findIndex(c => c.toLowerCase() === trimmed)
  if (direct !== -1) return direct
  const viaAlias = EXERCISE_CATEGORIES.findIndex(c => matchesCategory(c, trimmed))
  return viaAlias === -1 ? Infinity : CATEGORY_ORDER.indexOf(EXERCISE_CATEGORIES[viaAlias].key)
}
