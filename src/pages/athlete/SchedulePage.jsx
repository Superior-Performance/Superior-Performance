import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import {
  getProgramForAthlete, subscribeCompletionsForPrograms, setExerciseComplete, getAthletePrefs, saveAthletePrefs,
  subscribeExerciseWeightsForPrograms, saveExerciseWeight,
} from '../../firebase/firestore'
import {
  Dumbbell, Sparkles, X, Flame, CalendarClock, PartyPopper, Moon,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import EmptyState from '../../components/EmptyState'
import ProgressRing from '../../components/ProgressRing'
import Skeleton from '../../components/Skeleton'
import { PROGRAM_TYPES, programTypeInfo } from '../../constants/programTypes'
import { isExerciseComplete, keyForWrite, buildSlots, isSlotComplete } from '../../utils/programIds'
import { computeStreak, dayStats } from '../../utils/programSchedule'
import DayStrip from './DayStrip'
import CategoryTiles from './schedule/CategoryTiles'
import LiftingBrowser from './schedule/LiftingBrowser'
import ExerciseDetailModal from './schedule/ExerciseDetailModal'

// Labels are custom here rather than pulled from programTypeInfo because
// "Throwing/Post-Throw" reads better as a tab name than the program badge's
// plain "Throwing".
const TAB_META = {
  correctives: { label: 'Pre-Throwing',        fallbackCategory: 'General' },
  throwing:    { label: 'Throwing/Post-Throw', fallbackCategory: 'Catch Play' },
  arm_care:    { label: 'Arm Care',             fallbackCategory: 'Arm Care' },
  mobility:    { label: 'Mobility',             fallbackCategory: 'Mobility' },
  lifting:     { label: 'Lift',                 fallbackCategory: 'Lift' },
}
// Deliberately a separate list from PROGRAM_TYPES rather than derived from it:
// this is the order the work happens in a session, and the badge order is not
// obliged to match it. A new program type has to be added in BOTH places or it
// renders everywhere else and is silently missing from the athlete's tabs.
const TAB_ORDER = ['correctives', 'throwing', 'arm_care', 'mobility', 'lifting']

export default function SchedulePage() {
  const { currentUser } = useAuth()
  // Every athlete — in-house, remote and Premier alike — runs on this one
  // dated calendar. College Remote athletes used to get a separate dateless
  // screen here where they picked a day type and nothing they did was ever
  // recorded; which weekdays they train is now a setting on the athlete
  // (users/{uid}.trainingDays, see utils/trainingDays) rather than a whole
  // parallel view, so there is deliberately no athleteType branch on this
  // page. Day types still exist — they just decide which weekday a session
  // lands on at pull time instead of replacing the calendar.
  const [programs, setPrograms]       = useState([]) // every active program, any type
  const [completions, setCompletions] = useState({})
  const [weights, setWeights]         = useState({}) // this week's working weight per exercise
  const [dayTabs, setDayTabs]         = useState({}) // which program tab is selected within each day
  // Category tiles are an accordion, not independent toggles — opening one
  // auto-collapses whatever else was open in that day/program-tab so this
  // page never turns into a long stack of expanded exercise lists.
  const [openBlock, setOpenBlock]     = useState({})
  // Same idea, one level deeper — numbered either/or slots (e.g. "Corrective
  // 1"/"Corrective 2", see EXERCISE_CATEGORIES' slotLabel) stay collapsed
  // until tapped, and opening one closes whichever was open in that block.
  const [openSlot, setOpenSlot]       = useState({})
  const [detail, setDetail]           = useState(null) // { ex, program } — exercise detail modal
  const [loading, setLoading]         = useState(true)
  // Programs the coach has edited since this athlete last acknowledged them.
  const [noticesSeen, setNoticesSeen] = useState(null)   // null until loaded
  const [dismissing, setDismissing]   = useState(false)
  // Which day the Today tab is showing. null means "follow today", so the page
  // rolls over at midnight on its own instead of pinning to whatever date
  // happened to be current when it mounted.
  const [selectedDay, setSelectedDay]   = useState(null)

  useEffect(() => {
    if (!currentUser) return
    Promise.all([
      getProgramForAthlete(currentUser.uid),
      getAthletePrefs(currentUser.uid),
    ]).then(([snap, prefsSnap]) => {
      setPrograms(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setNoticesSeen(prefsSnap.data()?.programNoticesSeen || {})
      setLoading(false)
    })
  }, [currentUser])

  // Scoped to the active programs rather than the whole collection — see
  // subscribeCompletionsForPrograms. Keyed on the joined ids, not the array,
  // because a fresh array identity on every render would tear the listeners
  // down and rebuild them (and re-bill every document) on each pass.
  const programIds = programs.map(p => p.id)
  const programKey = programIds.join(',')

  useEffect(() => {
    if (!currentUser) return
    return subscribeCompletionsForPrograms(currentUser.uid, programKey ? programKey.split(',') : [], setCompletions)
  }, [currentUser, programKey])

  useEffect(() => {
    if (!currentUser) return
    return subscribeExerciseWeightsForPrograms(currentUser.uid, programKey ? programKey.split(',') : [], setWeights)
  }, [currentUser, programKey])

  function toggleBlock(groupKey, blockKey) {
    setOpenBlock(prev => ({ ...prev, [groupKey]: prev[groupKey] === blockKey ? null : blockKey }))
  }

  function toggleSlot(blockScopeKey, altGroup) {
    setOpenSlot(prev => ({ ...prev, [blockScopeKey]: prev[blockScopeKey] === altGroup ? null : altGroup }))
  }

  async function saveWeight(programId, exerciseId, exerciseName, value) {
    try {
      await saveExerciseWeight(currentUser.uid, `${programId}_${exerciseId}`, { value, exercise: exerciseName, programId })
    } catch {
      toast.error('Could not save weight.')
    }
  }

  // A true toggle now — tapping a completed exercise un-checks it instead of
  // being a no-op, so a mis-tap doesn't lock an athlete out of fixing it.
  async function toggleExerciseComplete(programId, exercise, weekIdx, dayIdx, exerciseIdx, wouldFinishDay) {
    const wasComplete = isExerciseComplete(completions, programId, exercise, weekIdx, dayIdx, exerciseIdx)
    try {
      await setExerciseComplete(
        currentUser.uid,
        keyForWrite(programId, exercise, weekIdx, dayIdx, exerciseIdx),
        !wasComplete,
      )
      if (!wasComplete && wouldFinishDay) toast.success('Workout complete! 💪')
    } catch {
      toast.error('Could not save. Try again.')
    }
  }

  // Tapping one option of an either/or corrective pair completes that one
  // and, if the athlete had previously done the other option instead,
  // un-checks it — the slot only ever needs one of the two done.
  function chooseSlotOption(programId, slot, chosenPos, weekIdx, dayIdx, wouldFinishDay) {
    slot.items.forEach(({ ex, i }, pos) => {
      if (pos === chosenPos) return
      if (isExerciseComplete(completions, programId, ex, weekIdx, dayIdx, i)) {
        toggleExerciseComplete(programId, ex, weekIdx, dayIdx, i, false)
      }
    })
    const { ex, i } = slot.items[chosenPos]
    toggleExerciseComplete(programId, ex, weekIdx, dayIdx, i, wouldFinishDay)
  }

  const toMillis = (t) => (t?.toMillis?.() ?? (t ? new Date(t).getTime() : 0))

  // A program is "updated" if the coach edited it more recently than the
  // athlete last dismissed the notice for that program.
  const updatedPrograms = noticesSeen === null ? [] : programs.filter(
    p => p.lastEditedAt && toMillis(p.lastEditedAt) > toMillis(noticesSeen[p.id])
  )

  async function dismissUpdateNotice() {
    setDismissing(true)
    const now = Date.now()
    const next = { ...noticesSeen }
    updatedPrograms.forEach(p => { next[p.id] = now })
    setNoticesSeen(next)          // optimistic — the banner should vanish instantly
    try {
      await saveAthletePrefs(currentUser.uid, { programNoticesSeen: next })
    } catch {
      setNoticesSeen(noticesSeen) // put it back if the write failed
    } finally {
      setDismissing(false)
    }
  }

  if (loading) return <ScheduleSkeleton />

  if (programs.length === 0) {
    return (
      <div className="min-h-[calc(100vh-56px)] bg-sp-ink-900">
        <EmptyState
          icon={Dumbbell}
          title="No program assigned yet"
          subtitle="Your coach will assign a program soon."
          dark
        />
      </div>
    )
  }

  const totalWeeks = Math.max(1, ...programs.map(p => p.weeks?.length || 0))
  const { streak, todayDone, todayDoneCount, todayTotal, pos } = computeStreak(programs, completions, totalWeeks)

  if (pos.notStartedYet) {
    return (
      <div className="min-h-[calc(100vh-56px)] bg-sp-ink-900 px-4 py-5">
        <UpdateNotice programs={updatedPrograms} onDismiss={dismissUpdateNotice} dismissing={dismissing} />
        <div className="surface-brand relative overflow-hidden text-white rounded-2xl p-8 text-center">
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ background: 'radial-gradient(circle at 50% 0%, rgba(46,158,99,0.3), transparent 60%)' }}
          />
          <div className="relative">
            <CalendarClock size={32} className="mx-auto mb-3 text-white/70" />
            <p className="font-display text-xl font-bold">Your program starts soon</p>
            <p className="text-sm text-white/60 mt-1.5">
              {format(new Date(`${pos.startDate}T00:00:00`), 'EEEE, MMM d')} — check back then.
            </p>
          </div>
        </div>
      </div>
    )
  }

  // Lifting doesn't take part in "today" at all — a lift day is Upper/Lower,
  // not a calendar weekday, so its dayNum (a stable 1-4 bucket, see
  // LIFTING_DAY_TYPE_DAYNUM) has no relationship to pos.dayNum here. It gets
  // its own always-available tab via LiftingBrowser instead — see DayBody.
  const liftingPrograms = programs.filter(p => (p.programType || 'correctives') === 'lifting')
  const nonLiftingPrograms = programs.filter(p => (p.programType || 'correctives') !== 'lifting')

  // Week → Day → (if more than one program lands on that day) program tab.
  // What the page is actually showing — today unless the athlete has picked
  // another day off the strip.
  const view = selectedDay ?? { weekIdx: pos.weekIdx, dayNum: pos.dayNum }
  const viewingToday = view.weekIdx === pos.weekIdx && view.dayNum === pos.dayNum
  const viewStats = dayStats(programs, completions, view.weekIdx, view.dayNum - 1)

  const dayMap = new Map() // dayNum -> [{ program, day }]
  nonLiftingPrograms.forEach(program => {
    (program.weeks?.[view.weekIdx]?.days || []).forEach((day, i) => {
      if (!day.exercises?.length) return
      const dayNum = day.dayNum ?? i + 1
      if (dayNum !== view.dayNum) return
      if (!dayMap.has(dayNum)) dayMap.set(dayNum, [])
      dayMap.get(dayNum).push({ program, day })
    })
  })
  const days = Array.from(dayMap.entries())
    .map(([dayNum, entries]) => ({ dayNum, entries }))
    .sort((a, b) => a.dayNum - b.dayNum)

  return (
    <div className="min-h-[calc(100vh-56px)] bg-sp-ink-900 px-4 py-4">
      <UpdateNotice programs={updatedPrograms} onDismiss={dismissUpdateNotice} dismissing={dismissing} />

      <TodayHero
        weekIdx={view.weekIdx}
        dayNum={view.dayNum}
        pastProgram={pos.pastProgram}
        streak={streak}
        todayDone={viewingToday ? todayDone : viewStats.total > 0 && viewStats.done === viewStats.total}
        todayDoneCount={viewingToday ? todayDoneCount : viewStats.done}
        todayTotal={viewingToday ? todayTotal : viewStats.total}
        viewingToday={viewingToday}
        viewDate={pos.hasStart ? dayDate(pos.startDate, view.weekIdx, view.dayNum) : null}
        onBackToToday={() => setSelectedDay(null)}
      />

      <DayStrip
        programs={programs}
        completions={completions}
        totalWeeks={totalWeeks}
        pos={pos}
        selected={view}
        onSelect={setSelectedDay}
      />

      {/* What the strip's colours mean. Only the types this athlete actually
          has — a legend listing programs they aren't running is noise. */}
      <TypeLegend programs={nonLiftingPrograms} />

      {days.length === 0 && liftingPrograms.length === 0 ? (
        <div className="bg-sp-ink-800 rounded-2xl border border-sp-ink-600 p-8 text-center">
          <Moon size={26} className="mx-auto mb-2 text-sp-ink-300" />
          <p className="text-sm font-medium text-white">Rest day</p>
          <p className="text-xs text-sp-ink-300 mt-0.5">Nothing scheduled — recover up for the next one.</p>
        </div>
      ) : (
        <DayBody
          entries={days[0]?.entries || []}
          weekIdx={view.weekIdx}
          dayIdx={view.dayNum - 1}
          groupPrefix="today"
          completions={completions}
          weights={weights}
          selectedType={dayTabs.today}
          onSelectType={(type) => setDayTabs(prev => ({ ...prev, today: type }))}
          openBlock={openBlock}
          toggleBlock={toggleBlock}
          openSlot={openSlot}
          toggleSlot={toggleSlot}
          onToggleComplete={toggleExerciseComplete}
          onChooseSlotOption={chooseSlotOption}
          onOpenDetail={setDetail}
          onSaveWeight={saveWeight}
          liftingPrograms={liftingPrograms}
        />
      )}

      <ExerciseDetailModal detail={detail} onClose={() => setDetail(null)} />
    </div>
  )
}

// Colour key for the day strip's per-type dots. Same colours as the program
// tabs and badges (PROGRAM_TYPES), so the dot on a day and the tab it opens
// match rather than being two unrelated colour systems.
function TypeLegend({ programs }) {
  const types = PROGRAM_TYPES.filter(t => programs.some(p => (p.programType || 'correctives') === t.key))
  if (types.length < 2) return null // one type needs no key
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-3 px-0.5">
      {types.map(t => (
        <span key={t.key} className="flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full ${t.dotClass}`} />
          <span className="text-[10px] text-sp-ink-300">{t.shortLabel}</span>
        </span>
      ))}
    </div>
  )
}

function UpdateNotice({ programs, onDismiss, dismissing }) {
  if (programs.length === 0) return null
  return (
    <div className="flex items-start gap-2.5 bg-sp-green-500/10 border border-sp-green-500/30 rounded-2xl px-4 py-3 mb-3">
      <Sparkles size={16} className="text-sp-green-500 flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-sp-green-400">Your coach updated your program</p>
        <p className="text-xs text-sp-green-300/80 mt-0.5">
          {programs.map(p => programTypeInfo(p.programType).shortLabel).join(' and ')}
          {programs.length === 1 ? ' has' : ' have'} changed. Anything you already
          checked off is still saved.
        </p>
      </div>
      <button
        onClick={onDismiss}
        disabled={dismissing}
        className="p-1 -m-1 text-sp-green-500 hover:text-sp-green-300 transition flex-shrink-0"
        aria-label="Dismiss"
      >
        <X size={16} />
      </button>
    </div>
  )
}

// Calendar date of a week/day, using the same startDate + (week * 7) +
// (dayNum - 1) mapping computeTodayPosition walks in reverse.
function dayDate(startDate, weekIdx, dayNum) {
  if (!startDate) return null
  const d = new Date(`${startDate}T00:00:00`)
  if (Number.isNaN(d.getTime())) return null
  d.setDate(d.getDate() + weekIdx * 7 + (dayNum - 1))
  return d
}

// The hero card — the viewed day's date, a big completion ring, and a streak
// badge (today only — a streak isn't a property of some other day).
// This is the whole point of the "gamified" pass: the athlete's very first
// glance at the tab tells them where they stand today and how many days
// in a row they've kept it up.
function TodayHero({
  weekIdx, dayNum, pastProgram, streak, todayDone, todayDoneCount, todayTotal,
  viewingToday = true, viewDate = null, onBackToToday,
}) {
  const pct = todayTotal ? Math.round((todayDoneCount / todayTotal) * 100) : 0

  if (pastProgram) {
    return (
      <div className="surface-brand relative overflow-hidden text-white rounded-2xl p-4 mb-4 text-center">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(circle at 50% 0%, rgba(46,158,99,0.35), transparent 60%)' }}
        />
        <div className="relative">
          <PartyPopper size={26} className="mx-auto mb-2 text-sp-green-300" />
          <p className="font-display text-lg font-bold">Program complete!</p>
          <p className="text-xs text-white/60 mt-1">Check the Progress tab for the full recap.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="surface-brand relative overflow-hidden text-white rounded-2xl p-4 mb-4">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(circle at 90% 0%, rgba(46,158,99,0.35), transparent 60%)' }}
      />
      <div className="relative flex items-center gap-4">
        <ProgressRing pct={pct} size={72} strokeWidth={7} />
        <div className="flex-1 min-w-0">
          <p className="text-xs text-white/60">
            {format(viewDate || new Date(), 'EEEE, MMM d')}
            {!viewingToday && <span className="text-white/40"> · not today</span>}
          </p>
          <p className="font-display text-lg font-bold truncate">
            Week {weekIdx + 1} · Day {dayNum}
          </p>
          <p className="text-xs text-white/70 mt-0.5">
            {todayTotal > 0
              ? `${todayDoneCount}/${todayTotal} done${todayDone ? ' — nailed it 💪' : ''}`
              : viewingToday ? "Nothing logged yet — let's go" : 'Rest day — nothing scheduled'}
          </p>
          {viewingToday ? (
            streak > 0 && (
              <div className="inline-flex items-center gap-1.5 mt-2 bg-white/10 rounded-full px-2.5 py-1">
                <Flame size={13} className="text-amber-400" />
                <span className="text-xs font-semibold">{streak} day{streak === 1 ? '' : 's'} streak</span>
              </div>
            )
          ) : (
            <button
              type="button"
              onClick={onBackToToday}
              className="inline-flex items-center gap-1.5 mt-2 bg-white/10 hover:bg-white/20 rounded-full px-2.5 py-1 transition"
            >
              <CalendarClock size={13} className="text-sp-green-300" />
              <span className="text-xs font-semibold">Back to today</span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// The body of the viewed day — program-type tabs (if more than one type
// lands on this day) followed by that type's category tiles. It took a
// groupPrefix because it used to be rendered once per day card in the
// since-removed College Remote view; every athlete now has exactly one
// day card, the dated one.
function DayBody({
  entries, weekIdx, dayIdx, groupPrefix,
  completions, weights, selectedType, onSelectType,
  openBlock, toggleBlock, openSlot, toggleSlot, onToggleComplete, onChooseSlotOption, onOpenDetail, onSaveWeight,
  liftingPrograms = [],
}) {
  // Lifting is always available as a tab (if the athlete has an active
  // lifting program) regardless of whether it landed in today's `entries` —
  // it isn't date-driven, see LiftingBrowser.
  const availableTypes = TAB_ORDER.filter(t =>
    t === 'lifting' ? liftingPrograms.length > 0 : entries.some(e => (e.program.programType || 'correctives') === t)
  )
  const activeType = availableTypes.includes(selectedType) ? selectedType : availableTypes[0]
  const activeEntry = entries.find(e => (e.program.programType || 'correctives') === activeType)
  const groupKey = `${groupPrefix}_${activeType}`

  const entrySlots = entries.map(e => ({ entry: e, slots: buildSlots(e.day.exercises) }))
  const totalExercises = entrySlots.reduce((s, { slots }) => s + slots.length, 0)
  const doneCount = entrySlots.reduce((s, { entry, slots }) => (
    s + slots.filter(slot => isSlotComplete(completions, entry.program.id, slot, weekIdx, dayIdx)).length
  ), 0)

  return (
    <>
      {availableTypes.length > 1 && (
        <div className="flex gap-1 px-1 pb-2 overflow-x-auto no-scrollbar">
          {availableTypes.map(t => (
            <button
              key={t}
              onClick={() => onSelectType(t)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                activeType === t ? 'bg-sp-green-500 text-white' : 'bg-sp-ink-800 border border-sp-ink-600 text-sp-ink-300'
              }`}
            >
              {TAB_META[t].label}
            </button>
          ))}
        </div>
      )}

      {activeType === 'lifting' ? (
        <LiftingBrowser
          programs={liftingPrograms}
          completions={completions}
          weights={weights}
          onToggleComplete={onToggleComplete}
          onChooseSlotOption={onChooseSlotOption}
          onOpenDetail={onOpenDetail}
          onSaveWeight={onSaveWeight}
        />
      ) : activeEntry && (
        <div className="bg-sp-ink-800 rounded-2xl overflow-hidden border border-sp-ink-600">
          <CategoryTiles
            program={activeEntry.program}
            day={activeEntry.day}
            fallbackCategory={TAB_META[activeType].fallbackCategory}
            currentWeek={weekIdx}
            dayIdx={dayIdx}
            groupKey={groupKey}
            doneCount={doneCount}
            totalExercises={totalExercises}
            showWeight={activeType === 'lifting'}
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
      )}
    </>
  )
}

// Roughly mirrors the shape of a loaded day — streak card, program tabs,
// a few category tiles — so the page doesn't flash blank before settling
// into its real layout.
function ScheduleSkeleton() {
  return (
    <div className="min-h-[calc(100vh-56px)] bg-sp-ink-900 px-4 py-5 space-y-4">
      <Skeleton className="h-28 rounded-2xl" />
      <div className="flex gap-2">
        <Skeleton className="h-9 w-24 rounded-xl" />
        <Skeleton className="h-9 w-24 rounded-xl" />
        <Skeleton className="h-9 w-24 rounded-xl" />
      </div>
      <Skeleton className="h-14 rounded-2xl" />
      <Skeleton className="h-14 rounded-2xl" />
      <Skeleton className="h-14 rounded-2xl" />
    </div>
  )
}
