import { useState, useRef, useEffect } from 'react'
import {
  CheckCircle2, Circle, ChevronDown, ChevronUp, Dumbbell, Wind, Heart, Zap, Flame,
  CircleDot, ListChecks,
} from 'lucide-react'
import { exerciseCategoryInfo, categoryRank } from '../../../constants/programTypes'
import { isExerciseComplete, isSlotComplete, groupIntoSlots } from '../../../utils/programIds'

/**
 * One day's workout, rendered as collapsible category tiles.
 *
 * Shared by the dated day card on the Schedule page and by the lifting
 * drill-down (where a tile is a lifting Block rather than a drill category),
 * which is why this lives on its own rather than inside either of them.
 */
const CATEGORY_ICONS = { Wind, Heart, Zap, Flame, CircleDot, ListChecks, Dumbbell }
// One day's exercises split into their own category tiles instead of one
// flat list — Mobilization / Correctives / Movement Activation / a plyo
// routine / Catch Play — so they read as clearly separate, clickable pieces
// of the workout rather than an undifferentiated checklist. Within a tile,
// exercises sharing an `altGroup` collapse into one either/or slot — see
// utils/programIds.js.
function buildCategoryBlocks(day, fallbackLabel) {
  const blocks = []
  const indexByKey = {}
  ;(day?.exercises || []).forEach((ex, i) => {
    const label = (ex.category || '').trim() || fallbackLabel
    if (indexByKey[label] === undefined) {
      indexByKey[label] = blocks.length
      blocks.push({ key: label, label, items: [] })
    }
    blocks[indexByKey[label]].items.push({ ex, i })
  })
  // A lifting exercise's `blockSlot` (from the sheet's Slot # column) orders
  // it within its block; other program types never set it, so this sort is
  // a no-op there (stable sort keeps their original order).
  blocks.forEach(b => { b.items.sort((a, c) => (a.ex.blockSlot ?? Infinity) - (c.ex.blockSlot ?? Infinity)); b.slots = groupIntoSlots(b.items) })
  return blocks.sort((a, b) => categoryRank(a.label) - categoryRank(b.label))
}
function CategoryTiles({
  program, day, fallbackCategory, currentWeek, dayIdx, groupKey,
  doneCount, totalExercises, showWeight, completions, weights,
  openBlockKey, toggleBlock, openSlot, toggleSlot, onToggleComplete, onChooseSlotOption, onOpenDetail, onSaveWeight,
}) {
  return (
    <>
      {buildCategoryBlocks(day, fallbackCategory).map((block) => {
        const info = exerciseCategoryInfo(block.label)
        const Icon = CATEGORY_ICONS[info.icon] || ListChecks
        const blockOpen = openBlockKey === block.key
        const blockDone = block.slots.filter(slot => isSlotComplete(completions, program.id, slot, currentWeek, dayIdx)).length

        // Number the either/or slots ("Corrective 1", "Corrective 2", ...)
        // in the order they appear — single-exercise slots aren't numbered.
        let slotNum = 0
        const numberedSlots = block.slots.map(slot => slot.items.length > 1 ? { ...slot, slotNum: ++slotNum } : slot)
        const slotScopeKey = `${groupKey}__${block.key}`

        return (
          <div key={block.key} className="border-b border-sp-ink-600 last:border-0">
            <button
              onClick={() => toggleBlock(groupKey, block.key)}
              className="w-full flex items-center justify-between gap-2 px-4 py-2.5 hover:bg-white/5 transition"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 ${info.dotClass}`}>
                  <Icon size={13} className="text-white" />
                </span>
                <span className="text-[11px] font-bold uppercase tracking-wide text-sp-ink-100 truncate">{info.shortLabel || info.label}</span>
                <span className="text-[11px] text-sp-ink-300 flex-shrink-0">{blockDone}/{block.slots.length}</span>
              </div>
              {blockOpen ? <ChevronUp size={14} className="text-sp-ink-300 flex-shrink-0" /> : <ChevronDown size={14} className="text-sp-ink-300 flex-shrink-0" />}
            </button>

            {blockOpen && (
              <div className="divide-y divide-sp-ink-600/60">
                {numberedSlots.map((slot) => {
                  if (slot.items.length <= 1) {
                    return (
                      <ExerciseRow
                        key={slot.items[0].ex.id || slot.items[0].i}
                        ex={slot.items[0].ex}
                        i={slot.items[0].i}
                        program={program}
                        currentWeek={currentWeek}
                        dayIdx={dayIdx}
                        doneCount={doneCount}
                        totalExercises={totalExercises}
                        completions={completions}
                        showWeight={showWeight}
                        weights={weights}
                        onToggleComplete={onToggleComplete}
                        onOpenDetail={onOpenDetail}
                        onSaveWeight={onSaveWeight}
                      />
                    )
                  }

                  // Either/or pair — without a slotLabel (e.g. Mobilization),
                  // both options just show inline as before.
                  if (!info.slotLabel) {
                    return (
                      <AltOptionSlot
                        key={slot.altGroup}
                        slot={slot}
                        program={program}
                        currentWeek={currentWeek}
                        dayIdx={dayIdx}
                        doneCount={doneCount}
                        totalExercises={totalExercises}
                        completions={completions}
                        onChooseSlotOption={onChooseSlotOption}
                        onOpenDetail={onOpenDetail}
                      />
                    )
                  }

                  // With a slotLabel (Correctives) — collapsed behind a
                  // numbered row ("Corrective 1") the athlete taps to reveal
                  // its two options, rather than always showing both.
                  const slotOpen = openSlot[slotScopeKey] === slot.altGroup
                  const slotDone = isSlotComplete(completions, program.id, slot, currentWeek, dayIdx)
                  return (
                    <div key={slot.altGroup}>
                      <button
                        onClick={() => toggleSlot(slotScopeKey, slot.altGroup)}
                        className="w-full flex items-center justify-between gap-2 px-4 py-3 hover:bg-white/5 transition"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {slotDone
                            ? <CheckCircle2 size={18} className="text-sp-green-500 flex-shrink-0" />
                            : <Circle size={18} className="text-sp-ink-300 flex-shrink-0" />
                          }
                          <span className="font-medium text-sm text-sp-ink-50">{info.slotLabel} {slot.slotNum}</span>
                        </div>
                        {slotOpen ? <ChevronUp size={14} className="text-sp-ink-300 flex-shrink-0" /> : <ChevronDown size={14} className="text-sp-ink-300 flex-shrink-0" />}
                      </button>
                      {slotOpen && (
                        <div className="pb-2">
                          <AltOptionSlot
                            slot={slot}
                            program={program}
                            currentWeek={currentWeek}
                            dayIdx={dayIdx}
                            doneCount={doneCount}
                            totalExercises={totalExercises}
                            completions={completions}
                            onChooseSlotOption={onChooseSlotOption}
                            onOpenDetail={onOpenDetail}
                            showChooseLabel={false}
                          />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </>
  )
}
// A single exercise row — the checkbox toggles completion, the name opens
// the detail modal.
function ExerciseRow({
  ex, i, program, currentWeek, dayIdx, doneCount, totalExercises, completions,
  showWeight, weights, onToggleComplete, onOpenDetail, onSaveWeight,
}) {
  const exDone = isExerciseComplete(completions, program.id, ex, currentWeek, dayIdx, i)
  const wouldFinishDay = doneCount + 1 === totalExercises
  const weightKey = ex.id ? `${program.id}_${ex.id}` : null
  return (
    <div className="flex items-center gap-2 px-4 py-3">
      <button
        onClick={(e) => {
          e.stopPropagation()
          onToggleComplete(program.id, ex, currentWeek, dayIdx, i, wouldFinishDay)
        }}
        className="flex-shrink-0"
        aria-label={exDone ? 'Mark incomplete' : 'Mark complete'}
      >
        {exDone
          ? <CheckCircle2 size={22} className="text-sp-green-500" />
          : <Circle size={22} className="text-sp-ink-300" />
        }
      </button>
      <button
        onClick={() => onOpenDetail({ ex, program })}
        className="flex-1 min-w-0 text-left"
      >
        <div className="flex items-center gap-1.5">
          <p className={`font-medium text-sm truncate ${exDone ? 'text-sp-ink-300 line-through' : 'text-sp-ink-50'}`}>{ex.name}</p>
          {ex.notes && (
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" title="Note added — tap to view" />
          )}
        </div>
        <p className="text-xs text-sp-ink-300 mt-0.5">
          {[ex.sets && `${ex.sets} sets`, ex.reps && `${ex.reps} reps`, ex.intensity || ex.load]
            .filter(Boolean).join(' · ')}
        </p>
      </button>
      {showWeight && weightKey && (
        <WeightField
          value={weights[weightKey]?.value}
          onSave={(value) => onSaveWeight(program.id, ex.id, ex.name, value)}
        />
      )}
    </div>
  )
}
// Two corrective exercises presented as either/or — the athlete picks
// whichever they actually did that day and only that one needs checking off.
function AltOptionSlot({ slot, program, currentWeek, dayIdx, doneCount, totalExercises, completions, onChooseSlotOption, onOpenDetail, showChooseLabel = true }) {
  const anyDone = isSlotComplete(completions, program.id, slot, currentWeek, dayIdx)
  return (
    <div className="px-4 py-3">
      {showChooseLabel && <p className="text-[10px] font-bold uppercase tracking-wide text-sp-ink-300 mb-1.5">Choose one</p>}
      <div className="space-y-1.5">
        {slot.items.map(({ ex, i }, pos) => {
          const exDone = isExerciseComplete(completions, program.id, ex, currentWeek, dayIdx, i)
          const wouldFinishDay = !anyDone && doneCount + 1 === totalExercises
          return (
            <div
              key={ex.id || i}
              className={`flex items-center gap-2 rounded-xl border px-2.5 py-2 transition ${
                exDone ? 'border-sp-green-500/40 bg-sp-green-500/10' : 'border-sp-ink-600'
              }`}
            >
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onChooseSlotOption(program.id, slot, pos, currentWeek, dayIdx, wouldFinishDay)
                }}
                className="flex-shrink-0"
                aria-label={exDone ? 'Mark incomplete' : `Choose option ${pos === 0 ? 'A' : 'B'}`}
              >
                {exDone
                  ? <CheckCircle2 size={20} className="text-sp-green-500" />
                  : <Circle size={20} className="text-sp-ink-300" />
                }
              </button>
              <button onClick={() => onOpenDetail({ ex, program })} className="flex-1 min-w-0 text-left">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-bold text-sp-ink-300 flex-shrink-0">{pos === 0 ? 'A' : 'B'}</span>
                  <p className={`font-medium text-sm truncate ${exDone ? 'text-sp-ink-300 line-through' : 'text-sp-ink-50'}`}>{ex.name}</p>
                  {ex.notes && (
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" title="Note added — tap to view" />
                  )}
                </div>
                <p className="text-xs text-sp-ink-300 mt-0.5 pl-4">
                  {[ex.sets && `${ex.sets} sets`, ex.reps && `${ex.reps} reps`, ex.intensity || ex.load]
                    .filter(Boolean).join(' · ')}
                </p>
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
// Inline "this week's weight" field next to an exercise — auto-saves shortly
// after the athlete stops typing (not just on blur/Enter), and flushes any
// still-pending save if the field disappears mid-debounce. Blur-only saving
// lost real entries: switching days/tabs mid-workout unmounts this
// component without ever firing blur, so a weight typed right before
// tapping away silently vanished. The debounce means it's saved within a
// fraction of a second either way, so nothing depends on the athlete
// tapping out of the field first.
function WeightField({ value, onSave }) {
  const [draft, setDraft] = useState(value || '')
  const [saving, setSaving] = useState(false)
  const draftRef = useRef(value || '')
  const savedRef = useRef(value || '')
  const timerRef = useRef(null)

  useEffect(() => {
    setDraft(value || '')
    draftRef.current = value || ''
    savedRef.current = value || ''
  }, [value])

  // Bare fire-and-forget write, no local "saving" state — used from the
  // unmount cleanup below, where the component (and its spinner) is
  // already gone.
  function persist(raw) {
    const trimmed = raw.trim()
    if (trimmed === savedRef.current) return
    savedRef.current = trimmed
    onSave(trimmed)
  }

  async function commitWithSpinner(raw) {
    const trimmed = raw.trim()
    if (trimmed === savedRef.current) return
    setSaving(true)
    try {
      savedRef.current = trimmed
      await onSave(trimmed)
    } finally {
      setSaving(false)
    }
  }

  function handleChange(e) {
    const next = e.target.value
    setDraft(next)
    draftRef.current = next
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => commitWithSpinner(next), 600)
  }

  function handleBlur() {
    if (timerRef.current) clearTimeout(timerRef.current)
    commitWithSpinner(draft)
  }

  useEffect(() => () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      persist(draftRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="flex-shrink-0 flex items-center">
      <input
        type="text"
        inputMode="decimal"
        value={draft}
        onChange={handleChange}
        onBlur={handleBlur}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
        placeholder="lbs"
        disabled={saving}
        className="w-14 px-2 py-1.5 bg-sp-ink-900 border border-sp-ink-600 rounded-lg text-xs text-center text-sp-ink-50 placeholder-sp-ink-300 focus:outline-none focus:ring-2 focus:ring-sp-green-500 disabled:opacity-60"
      />
    </div>
  )
}

export default CategoryTiles
