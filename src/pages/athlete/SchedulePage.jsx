import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import {
  getProgramForAthlete, subscribeCompletions, setExerciseComplete, getAthletePrefs, saveAthletePrefs,
  subscribeExerciseWeights, saveExerciseWeight,
} from '../../firebase/firestore'
import {
  CheckCircle2, Circle, ChevronDown, ChevronUp, ChevronLeft, Dumbbell, Sparkles, X, Wind, Heart, Zap, Flame,
  CircleDot, ListChecks, PlayCircle, CalendarClock, PartyPopper, Moon,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import EmptyState from '../../components/EmptyState'
import ProgressRing from '../../components/ProgressRing'
import Skeleton from '../../components/Skeleton'
import { programTypeInfo, exerciseCategoryInfo, categoryRank, DAY_TYPES, LIFTING_DAY_TYPES } from '../../constants/programTypes'
import { isExerciseComplete, keyForWrite, groupIntoSlots, buildSlots, isSlotComplete } from '../../utils/programIds'
import { computeStreak } from '../../utils/programSchedule'

const CATEGORY_ICONS = { Wind, Heart, Zap, Flame, CircleDot, ListChecks, Dumbbell }
const DAY_TYPE_ICONS = { Moon, Flame, Zap, Sparkles }
const LIFTING_DAY_TYPE_ICONS = { Dumbbell }

// The one day (first found, in week order) in this program tagged with the
// given College Remote Athlete day type — see ProgramEditorModal's Day
// Type dropdown. A program only ever defines one instance of each type;
// it isn't repeated per week the way an in-house athlete's calendar is.
function findDayForType(program, typeKey) {
  for (const week of program.weeks || []) {
    for (const day of week.days || []) {
      if (day.dayType === typeKey && day.exercises?.length) return day
    }
  }
  return null
}

// Labels are custom here rather than pulled from programTypeInfo because
// "Throwing/Post-Throw" reads better as a tab name than the program badge's
// plain "Throwing".
const TAB_META = {
  correctives: { label: 'Pre-Throwing',        fallbackCategory: 'General' },
  throwing:    { label: 'Throwing/Post-Throw', fallbackCategory: 'Catch Play' },
  mobility:    { label: 'Mobility',             fallbackCategory: 'Mobility' },
  lifting:     { label: 'Lift',                 fallbackCategory: 'Lift' },
}
const TAB_ORDER = ['correctives', 'throwing', 'mobility', 'lifting']

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

// A handful of common video hosts need a specific embeddable URL shape —
// everything else (direct file links, Google Drive preview links a coach
// already copied correctly) is passed through as-is.
function toEmbedUrl(url) {
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^www\./, '')
    if (host === 'youtube.com' || host === 'm.youtube.com') {
      let id = u.searchParams.get('v')
      if (!id && u.pathname.startsWith('/shorts/')) id = u.pathname.split('/')[2]
      return id ? `https://www.youtube.com/embed/${id}` : url
    }
    if (host === 'youtu.be') {
      const id = u.pathname.slice(1)
      return id ? `https://www.youtube.com/embed/${id}` : url
    }
    if (host === 'vimeo.com') {
      const id = u.pathname.split('/').filter(Boolean).pop()
      return id ? `https://player.vimeo.com/video/${id}` : url
    }
    if (host === 'drive.google.com' && url.includes('/view')) {
      return url.replace('/view', '/preview')
    }
    return url
  } catch {
    return url
  }
}

export default function SchedulePage() {
  const { currentUser, userProfile } = useAuth()
  // College Remote Athlete Mode — no fixed calendar to plan around, so
  // instead of "today" mapping to one dated day, the athlete picks which of
  // the program's four day types (Recovery/High-Intent/Hybrid 1/Hybrid 2 —
  // see constants/programTypes' DAY_TYPES) fits that session. See
  // RemoteDayTypePicker below, which takes over the whole page for these
  // athletes; everything from here through `dayMap` is in-house-only.
  const isRemote = userProfile?.athleteType === 'remote'

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

  useEffect(() => {
    if (!currentUser) return
    return subscribeCompletions(currentUser.uid, (snap) => {
      const map = {}
      snap.forEach((d) => { map[d.id] = d.data() })
      setCompletions(map)
    })
  }, [currentUser])

  useEffect(() => {
    if (!currentUser) return
    return subscribeExerciseWeights(currentUser.uid, (snap) => {
      const map = {}
      snap.forEach((d) => { map[d.id] = d.data() })
      setWeights(map)
    })
  }, [currentUser])

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

  // College Remote Athletes get a completely different page — no calendar,
  // no weeks, just a pick-a-day-type flow. See RemoteDayTypePicker. Lifting
  // is not part of that flow at all — see LiftingBrowser below, used
  // identically here and for in-house athletes.
  if (isRemote) {
    const liftingPrograms  = programs.filter(p => (p.programType || 'correctives') === 'lifting')
    const trainingPrograms = programs.filter(p => (p.programType || 'correctives') !== 'lifting')
    return (
      <div className="min-h-[calc(100vh-56px)] bg-sp-ink-900 px-4 py-4 space-y-6">
        <UpdateNotice programs={updatedPrograms} onDismiss={dismissUpdateNotice} dismissing={dismissing} />
        {trainingPrograms.length > 0 && (
          <RemoteDayTypePicker
            title="Training"
            programs={trainingPrograms}
            dayTypes={DAY_TYPES}
            dayTypeIcons={DAY_TYPE_ICONS}
            emptyHint="Ask your coach to tag a day as Recovery, High-Intent, Synergy, or Hybrid."
            weights={weights}
            onSaveWeight={saveWeight}
            onOpenDetail={setDetail}
          />
        )}
        {liftingPrograms.length > 0 && (
          <div>
            <p className="text-xs font-bold text-sp-ink-300 uppercase tracking-wider mb-3">Lifting</p>
            <LiftingBrowser
              programs={liftingPrograms}
              completions={completions}
              weights={weights}
              onToggleComplete={toggleExerciseComplete}
              onChooseSlotOption={chooseSlotOption}
              onOpenDetail={setDetail}
              onSaveWeight={saveWeight}
            />
          </div>
        )}
        <ExerciseDetailModal detail={detail} onClose={() => setDetail(null)} />
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
  const dayMap = new Map() // dayNum -> [{ program, day }]
  nonLiftingPrograms.forEach(program => {
    (program.weeks?.[pos.weekIdx]?.days || []).forEach((day, i) => {
      if (!day.exercises?.length) return
      const dayNum = day.dayNum ?? i + 1
      if (dayNum !== pos.dayNum) return
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
        weekIdx={pos.weekIdx}
        dayNum={pos.dayNum}
        pastProgram={pos.pastProgram}
        streak={streak}
        todayDone={todayDone}
        todayDoneCount={todayDoneCount}
        todayTotal={todayTotal}
      />

      {days.length === 0 && liftingPrograms.length === 0 ? (
        <div className="bg-sp-ink-800 rounded-2xl border border-sp-ink-600 p-8 text-center">
          <Moon size={26} className="mx-auto mb-2 text-sp-ink-300" />
          <p className="text-sm font-medium text-white">Rest day</p>
          <p className="text-xs text-sp-ink-300 mt-0.5">Nothing scheduled — recover up for the next one.</p>
        </div>
      ) : (
        <DayBody
          entries={days[0]?.entries || []}
          weekIdx={pos.weekIdx}
          dayIdx={pos.dayNum - 1}
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

// The hero card — today's date, a big completion ring, and a streak badge.
// This is the whole point of the "gamified" pass: the athlete's very first
// glance at the tab tells them where they stand today and how many days
// in a row they've kept it up.
function TodayHero({ weekIdx, dayNum, pastProgram, streak, todayDone, todayDoneCount, todayTotal }) {
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
          <p className="text-xs text-white/60">{format(new Date(), 'EEEE, MMM d')}</p>
          <p className="font-display text-lg font-bold truncate">
            Week {weekIdx + 1} · Day {dayNum}
          </p>
          <p className="text-xs text-white/70 mt-0.5">
            {todayTotal > 0
              ? `${todayDoneCount}/${todayTotal} done${todayDone ? ' — nailed it 💪' : ''}`
              : "Nothing logged yet — let's go"}
          </p>
          {streak > 0 && (
            <div className="inline-flex items-center gap-1.5 mt-2 bg-white/10 rounded-full px-2.5 py-1">
              <Flame size={13} className="text-amber-400" />
              <span className="text-xs font-semibold">{streak} day{streak === 1 ? '' : 's'} streak</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// Shared by the single "today" card (in-house athletes) and each of the
// remote athlete's day cards — program-type tabs (if more than one type
// lands on this day) followed by that type's category tiles.
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

// One College Remote Athlete Mode day-type picker: pick one of `dayTypes`,
// then see every program in `programs` tagged with it, merged via the same
// DayBody/CategoryTiles machinery in-house athletes use. Rendered twice by
// SchedulePage — once for training (correctives/throwing/mobility, sharing
// the High Intent/Hybrid/Synergy/Recovery vocabulary) and once for lifting
// (its own independent Upper/Lower vocabulary) — each instance's state is
// fully independent since they're separate component instances.
// Deliberately self-contained — none of this touches the real `completions`
// from Firestore. A college athlete might run the same day type many times
// over a season, and re-running it should start fresh each time rather
// than showing everything already checked off from weeks ago, so
// completion here is ephemeral local state that resets on every selection
// instead of being persisted per exercise like the in-house flow.
function RemoteDayTypePicker({ title, programs, dayTypes, dayTypeIcons, emptyHint, weights, onSaveWeight, onOpenDetail }) {
  const [selectedDayType, setSelectedDayType] = useState(null)
  const [activeProgramTab, setActiveProgramTab] = useState(null)
  const [ephemeral, setEphemeral] = useState({})
  const [openBlock, setOpenBlock] = useState({})
  const [openSlot, setOpenSlot] = useState({})

  function toggleBlock(groupKey, blockKey) {
    setOpenBlock(prev => ({ ...prev, [groupKey]: prev[groupKey] === blockKey ? null : blockKey }))
  }
  function toggleSlot(scopeKey, altGroup) {
    setOpenSlot(prev => ({ ...prev, [scopeKey]: prev[scopeKey] === altGroup ? null : altGroup }))
  }

  function selectDayType(key) {
    setSelectedDayType(key)
    setActiveProgramTab(null)
    setEphemeral({})
    setOpenBlock({})
    setOpenSlot({})
  }

  function ephemeralToggle(programId, exercise, wi, di, ei, wouldFinishDay) {
    const key = keyForWrite(programId, exercise, wi, di, ei)
    const wasComplete = isExerciseComplete(ephemeral, programId, exercise, wi, di, ei)
    setEphemeral(prev => ({ ...prev, [key]: { completed: !wasComplete } }))
    if (!wasComplete && wouldFinishDay) toast.success('Workout complete.')
  }

  function ephemeralChooseSlotOption(programId, slot, chosenPos, wi, di, wouldFinishDay) {
    slot.items.forEach(({ ex, i }, pos) => {
      if (pos === chosenPos) return
      if (isExerciseComplete(ephemeral, programId, ex, wi, di, i)) {
        ephemeralToggle(programId, ex, wi, di, i, false)
      }
    })
    const { ex, i } = slot.items[chosenPos]
    ephemeralToggle(programId, ex, wi, di, i, wouldFinishDay)
  }

  const availableTypes = dayTypes.filter(dt =>
    programs.some(p => findDayForType(p, dt.key))
  )

  const typeInfo = dayTypes.find(dt => dt.key === selectedDayType) || null
  const entries = selectedDayType
    ? programs
        .map(program => {
          const day = findDayForType(program, selectedDayType)
          return day ? { program, day } : null
        })
        .filter(Boolean)
    : []

  return (
    <div>
      <p className="text-xs font-bold text-sp-ink-300 uppercase tracking-wider mb-3">{title}</p>

      {availableTypes.length === 0 ? (
        <div className="bg-sp-ink-800 rounded-2xl border border-sp-ink-600 p-8 text-center">
          <ListChecks size={26} className="mx-auto mb-2 text-sp-ink-300" />
          <p className="text-sm font-medium text-white">No day types set up yet</p>
          <p className="text-xs text-sp-ink-300 mt-0.5">{emptyHint}</p>
        </div>
      ) : !selectedDayType ? (
        <div>
          <p className="text-sm text-sp-ink-300 mb-3">Pick whichever day type fits the session you're about to run.</p>
          <div className="grid grid-cols-2 gap-3">
            {availableTypes.map(dt => {
              const Icon = dayTypeIcons[dt.icon] || Zap
              return (
                <button
                  key={dt.key}
                  onClick={() => selectDayType(dt.key)}
                  className="bg-sp-ink-800 border border-sp-ink-600 rounded-2xl p-4 text-left hover:border-sp-green-500/40 transition"
                >
                  <div className="w-9 h-9 rounded-full bg-sp-green-500/15 flex items-center justify-center mb-3">
                    <Icon size={17} className="text-sp-green-500" />
                  </div>
                  <p className="font-semibold text-white text-sm">{dt.label}</p>
                </button>
              )
            })}
          </div>
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
              Nothing tagged {typeInfo?.label} yet.
            </div>
          ) : (
            <DayBody
              entries={entries}
              weekIdx={0}
              dayIdx={0}
              groupPrefix={`remote_${selectedDayType}`}
              completions={ephemeral}
              weights={weights}
              selectedType={activeProgramTab}
              onSelectType={setActiveProgramTab}
              openBlock={openBlock}
              toggleBlock={toggleBlock}
              openSlot={openSlot}
              toggleSlot={toggleSlot}
              onToggleComplete={ephemeralToggle}
              onChooseSlotOption={ephemeralChooseSlotOption}
              onOpenDetail={onOpenDetail}
              onSaveWeight={onSaveWeight}
            />
          )}
        </div>
      )}
    </div>
  )
}

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
// off), capped at the program's last week. A remote athlete runs on their
// own schedule rather than a fixed calendar, so gating progression on
// "finished all 4 lifts" is the natural substitute for a fixed weekly
// cadence — see AdminAthleteDetail comment history for why. Computed off
// the first program only; in practice an athlete has exactly one active
// lifting program at a time.
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
// etc. — see AdminAthleteDetail's createDraftFromRows). Real Firestore
// completions are used (unlike RemoteDayTypePicker's ephemeral state) since
// Week + Day Type together pick out one specific, non-repeating day for
// every athlete, in-house or remote.
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

// Tapping an exercise's name (not its checkbox) opens this — full notes and,
// if the drill has one, a video that plays inside the app instead of
// bouncing the athlete out to YouTube or wherever it's hosted.
function ExerciseDetailModal({ detail, onClose }) {
  const [showVideo, setShowVideo] = useState(false)
  useEffect(() => { setShowVideo(false) }, [detail?.ex?.id])
  if (!detail) return null
  const { ex } = detail

  return (
    <div className="animate-modal-backdrop fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="animate-modal-panel bg-sp-ink-800 rounded-2xl w-full max-w-sm max-h-[85vh] overflow-y-auto border border-sp-ink-600" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between px-5 py-4 border-b border-sp-ink-600">
          <div className="min-w-0">
            <p className="font-bold text-sp-ink-50">{ex.name}</p>
            <p className="text-xs text-sp-ink-300 mt-0.5">
              {[ex.sets && `${ex.sets} sets`, ex.reps && `${ex.reps} reps`, ex.intensity || ex.load].filter(Boolean).join(' · ')}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-lg transition flex-shrink-0 text-sp-ink-300"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-4">
          {ex.notes && (
            <div>
              <p className="text-xs font-semibold text-sp-ink-300 uppercase tracking-wide mb-1">Notes</p>
              <p className="text-sm text-sp-ink-100">{ex.notes}</p>
            </div>
          )}

          {ex.videoUrl && !showVideo && (
            <button
              onClick={() => setShowVideo(true)}
              className="btn-brand w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm"
            >
              <PlayCircle size={16} /> Watch Video
            </button>
          )}

          {ex.videoUrl && showVideo && (
            <div className="rounded-xl overflow-hidden bg-black" style={{ aspectRatio: '16 / 9' }}>
              <iframe
                src={toEmbedUrl(ex.videoUrl)}
                className="w-full h-full"
                allow="autoplay; encrypted-media; picture-in-picture"
                allowFullScreen
                title={ex.name}
              />
            </div>
          )}

          {!ex.notes && !ex.videoUrl && (
            <p className="text-sm text-sp-ink-300">No additional details for this exercise.</p>
          )}
        </div>
      </div>
    </div>
  )
}

// Inline "this week's weight" field next to an exercise — saves on blur/Enter
// so the athlete can log it mid-workout without leaving the program tab.
function WeightField({ value, onSave }) {
  const [draft, setDraft] = useState(value || '')
  const [saving, setSaving] = useState(false)

  useEffect(() => { setDraft(value || '') }, [value])

  async function commit() {
    const trimmed = draft.trim()
    if (trimmed === (value || '')) return
    setSaving(true)
    try {
      await onSave(trimmed)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex-shrink-0 flex items-center">
      <input
        type="text"
        inputMode="decimal"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
        placeholder="lbs"
        disabled={saving}
        className="w-14 px-2 py-1.5 bg-sp-ink-900 border border-sp-ink-600 rounded-lg text-xs text-center text-sp-ink-50 placeholder-sp-ink-300 focus:outline-none focus:ring-2 focus:ring-sp-green-500 disabled:opacity-60"
      />
    </div>
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
