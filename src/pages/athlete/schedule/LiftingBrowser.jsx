import { useState, useEffect } from 'react'
import { CheckCircle2, ChevronLeft, Dumbbell } from 'lucide-react'
import { LIFTING_DAY_TYPES } from '../../../constants/programTypes'
import { buildSlots, isSlotComplete } from '../../../utils/programIds'
import CategoryTiles from './CategoryTiles'

/**
 * The lifting tab — a week / day-type drill-down rather than a dated day.
 *
 * Kept apart from the Schedule page because it is the one program type that
 * does not answer the question "what am I doing today": see the comment on
 * LiftingBrowser below for why an Upper/Lower day has no weekday, and
 * computeLiftingWeekIdx for how the week advances without one.
 */
const LIFTING_DAY_TYPE_ICONS = { Dumbbell }
// A day type is "done" for a given program/week once every exercise in it
// is checked off — the unit LiftingBrowser's week-gating counts against.
function isLiftingDayTypeDone(program, weekIdx, dayTypeKey, completions) {
  const days = program.weeks?.[weekIdx]?.days || []
  const dayIdx = days.findIndex(d => d.dayType === dayTypeKey && d.exercises?.length)
  if (dayIdx === -1) return false
  const slots = buildSlots(days[dayIdx].exercises)
  return slots.length > 0 && slots.every(slot => isSlotComplete(completions, program.id, slot, weekIdx, dayIdx))
}

// The athlete's current week isn't picked by hand — it's the first week
// that isn't fully done yet (every day type it has tagged, all checked
// off), capped at the program's last week. Lifting has no calendar to
// advance it — a lift day is Upper/Lower, not a weekday — so gating
// progression on "finished all 4 lifts" is the substitute for a fixed
// weekly cadence. That started out as the rule for College Remote athletes,
// who ran on their own schedule; it now applies to everyone, since the
// lifting tab is the same drill-down whatever tier the athlete is on.
// Computed off the first program only; in practice an athlete has exactly
// one active lifting program at a time.
function computeLiftingWeekIdx(program, completions) {
  const weeks = program?.weeks || []
  for (let wi = 0; wi < weeks.length; wi++) {
    const dayTypesThisWeek = LIFTING_DAY_TYPES.filter(dt => weeks[wi].days?.some(d => d.dayType === dt.key && d.exercises?.length))
    if (dayTypesThisWeek.length === 0) continue
    if (!dayTypesThisWeek.every(dt => isLiftingDayTypeDone(program, wi, dt.key, completions))) return wi
  }
  return Math.max(weeks.length - 1, 0)
}

// Lifting doesn't map onto "today" the way the other program types do — a
// lift day is Upper/Lower, not a calendar weekday — so instead of showing
// whatever's due today it's an explicit drill-down: the athlete's current
// (auto-advancing) week, then which of the four day types, then that day's
// blocks (Block A/B/C, each a collapsible tile via the same CategoryTiles
// machinery, since a lifting exercise's `category` is literally "Block A"
// etc. — see generateDraftProgram in utils/sheetPrograms). Real Firestore
// completions are used, since Week + Day Type together pick out one
// specific, non-repeating day — the same for every athlete, whatever tier
// they're on.
function LiftingBrowser({ programs, completions, weights, onToggleComplete, onChooseSlotOption, onOpenDetail, onSaveWeight }) {
  const primaryProgram = programs[0]
  const totalWeeks = primaryProgram?.weeks?.length || 1
  const weekIdx = computeLiftingWeekIdx(primaryProgram, completions)
  const [selectedDayType, setSelectedDayType] = useState(null)
  const [openBlock, setOpenBlock] = useState({})
  const [openSlot, setOpenSlot] = useState({})

  // The week advances on its own as completions come in — if that just
  // moved the athlete into a new week mid-session, drop back to the day
  // type grid instead of leaving them "inside" a day type that may not
  // even exist in the new week.
  useEffect(() => {
    setSelectedDayType(null)
    setOpenBlock({})
    setOpenSlot({})
  }, [weekIdx])

  function toggleBlock(groupKey, blockKey) {
    setOpenBlock(prev => ({ ...prev, [groupKey]: prev[groupKey] === blockKey ? null : blockKey }))
  }
  function toggleSlot(scopeKey, altGroup) {
    setOpenSlot(prev => ({ ...prev, [scopeKey]: prev[scopeKey] === altGroup ? null : altGroup }))
  }

  const availableDayTypes = LIFTING_DAY_TYPES.filter(dt =>
    programs.some(p => p.weeks?.[weekIdx]?.days?.some(d => d.dayType === dt.key && d.exercises?.length))
  )
  const typeInfo = LIFTING_DAY_TYPES.find(dt => dt.key === selectedDayType) || null
  const allDoneThisWeek = availableDayTypes.length > 0 &&
    availableDayTypes.every(dt => programs.some(p => isLiftingDayTypeDone(p, weekIdx, dt.key, completions)))

  // dayIdx is the day's actual array position within week.days (not
  // dayNum - 1) so completion keys line up correctly regardless of which
  // day types a given week happens to include.
  const entries = selectedDayType
    ? programs
        .map(program => {
          const dayIdx = (program.weeks?.[weekIdx]?.days || []).findIndex(d => d.dayType === selectedDayType && d.exercises?.length)
          return dayIdx === -1 ? null : { program, day: program.weeks[weekIdx].days[dayIdx], dayIdx }
        })
        .filter(Boolean)
    : []

  return (
    <div>
      <div className="mb-3">
        <p className="font-display text-lg font-bold text-white">Week {weekIdx + 1}{totalWeeks > 1 ? ` of ${totalWeeks}` : ''}</p>
        {weekIdx < totalWeeks - 1 ? (
          <p className="text-xs text-sp-ink-300 mt-0.5">
            Complete all {availableDayTypes.length || 4} days to unlock Week {weekIdx + 2}.
          </p>
        ) : allDoneThisWeek ? (
          <p className="text-xs text-sp-green-400 mt-0.5">All weeks complete — nice work.</p>
        ) : null}
      </div>

      {availableDayTypes.length === 0 ? (
        <div className="bg-sp-ink-800 rounded-2xl border border-sp-ink-600 p-6 text-center text-sm text-sp-ink-300">
          Nothing scheduled for lifting this week.
        </div>
      ) : !selectedDayType ? (
        <div className="grid grid-cols-2 gap-3">
          {availableDayTypes.map(dt => {
            const Icon = LIFTING_DAY_TYPE_ICONS[dt.icon] || Dumbbell
            const done = programs.some(p => isLiftingDayTypeDone(p, weekIdx, dt.key, completions))
            return (
              <button
                key={dt.key}
                onClick={() => setSelectedDayType(dt.key)}
                className="bg-sp-ink-800 border border-sp-ink-600 rounded-2xl p-4 text-left hover:border-sp-green-500/40 transition"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="w-9 h-9 rounded-full bg-sp-green-500/15 flex items-center justify-center">
                    <Icon size={17} className="text-sp-green-500" />
                  </div>
                  {done && <CheckCircle2 size={18} className="text-sp-green-500" />}
                </div>
                <p className="font-semibold text-white text-sm">{dt.label}</p>
              </button>
            )
          })}
        </div>
      ) : (
        <div>
          <button
            onClick={() => setSelectedDayType(null)}
            className="flex items-center gap-1.5 text-sm text-sp-ink-300 hover:text-white transition mb-3"
          >
            <ChevronLeft size={16} /> Change day type
          </button>
          <p className="font-display text-lg font-bold text-white mb-3">{typeInfo?.label}</p>

          {entries.length === 0 ? (
            <div className="bg-sp-ink-800 rounded-2xl border border-sp-ink-600 p-6 text-center text-sm text-sp-ink-300">
              Nothing tagged {typeInfo?.label} this week.
            </div>
          ) : (
            entries.map(({ program, day, dayIdx }) => {
              const slots = buildSlots(day.exercises)
              const doneCount = slots.filter(slot => isSlotComplete(completions, program.id, slot, weekIdx, dayIdx)).length
              const groupKey = `lift_${program.id}_${weekIdx}_${selectedDayType}`
              return (
                <div key={program.id} className="bg-sp-ink-800 rounded-2xl overflow-hidden border border-sp-ink-600 mb-3 last:mb-0">
                  <CategoryTiles
                    program={program}
                    day={day}
                    fallbackCategory="Lift"
                    currentWeek={weekIdx}
                    dayIdx={dayIdx}
                    groupKey={groupKey}
                    doneCount={doneCount}
                    totalExercises={slots.length}
                    showWeight
                    completions={completions}
                    weights={weights}
                    openBlockKey={openBlock[groupKey]}
                    toggleBlock={toggleBlock}
                    openSlot={openSlot}
                    toggleSlot={toggleSlot}
                    onToggleComplete={onToggleComplete}
                    onChooseSlotOption={onChooseSlotOption}
                    onOpenDetail={onOpenDetail}
                    onSaveWeight={onSaveWeight}
                  />
                </div>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}

export default LiftingBrowser
