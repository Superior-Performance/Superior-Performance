import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import {
  getProgramForAthlete, subscribeCompletions, setExerciseComplete, getAthletePrefs, saveAthletePrefs,
  subscribeExerciseWeights, saveExerciseWeight,
} from '../../firebase/firestore'
import {
  CheckCircle2, Circle, ChevronDown, ChevronUp, Dumbbell, Sparkles, X, Wind, Heart, Zap, Flame,
  CircleDot, ListChecks, PlayCircle, CalendarClock, PartyPopper, Moon,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import EmptyState from '../../components/EmptyState'
import ProgressRing from '../../components/ProgressRing'
import { programTypeInfo, exerciseCategoryInfo, categoryRank } from '../../constants/programTypes'
import { isExerciseComplete, keyForWrite, groupIntoSlots, buildSlots, isSlotComplete } from '../../utils/programIds'
import { computeStreak } from '../../utils/programSchedule'

const CATEGORY_ICONS = { Wind, Heart, Zap, Flame, CircleDot, ListChecks }

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
  blocks.forEach(b => { b.slots = groupIntoSlots(b.items) })
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
  // Remote athletes pick their own days — the week's program is one flexible
  // set of focuses rather than fixed training days, so this tab shows their
  // whole current week (still just one week, never browsable) instead of a
  // single dated day. In-house athletes (the default) get literally today.
  const isRemote = userProfile?.athleteType === 'remote'

  const [programs, setPrograms]       = useState([]) // every active program, any type
  const [completions, setCompletions] = useState({})
  const [weights, setWeights]         = useState({}) // this week's working weight per exercise
  const [expanded, setExpanded]       = useState(null)
  const [dayTabs, setDayTabs]         = useState({}) // which program tab is selected within each day
  // Category tiles are an accordion, not independent toggles — opening one
  // auto-collapses whatever else was open in that day/program-tab so this
  // page never turns into a long stack of expanded exercise lists.
  const [openBlock, setOpenBlock]     = useState({})
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

  if (loading) return <PageLoader />

  if (programs.length === 0) {
    return (
      <EmptyState
        icon={Dumbbell}
        title="No program assigned yet"
        subtitle="Your coach will assign a program soon."
      />
    )
  }

  const totalWeeks = Math.max(1, ...programs.map(p => p.weeks?.length || 0))
  const { streak, todayDone, todayDoneCount, todayTotal, pos } = computeStreak(programs, completions, totalWeeks)

  if (pos.notStartedYet) {
    return (
      <div className="px-4 py-5">
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

  // Week → Day → (if more than one program lands on that day) program tab.
  // Non-remote athletes only ever see today's dayNum; remote athletes see
  // every day in the current week, since their "days" are flexible focuses
  // rather than dated sessions.
  const dayMap = new Map() // dayNum -> [{ program, day }]
  programs.forEach(program => {
    (program.weeks?.[pos.weekIdx]?.days || []).forEach((day, i) => {
      if (!day.exercises?.length) return
      const dayNum = day.dayNum ?? i + 1
      if (!isRemote && dayNum !== pos.dayNum) return
      if (!dayMap.has(dayNum)) dayMap.set(dayNum, [])
      dayMap.get(dayNum).push({ program, day })
    })
  })
  const days = Array.from(dayMap.entries())
    .map(([dayNum, entries]) => ({ dayNum, entries }))
    .sort((a, b) => a.dayNum - b.dayNum)

  return (
    <div className="px-4 py-5">
      <UpdateNotice programs={updatedPrograms} onDismiss={dismissUpdateNotice} dismissing={dismissing} />

      <TodayHero
        isRemote={isRemote}
        weekIdx={pos.weekIdx}
        dayNum={pos.dayNum}
        pastProgram={pos.pastProgram}
        streak={streak}
        todayDone={todayDone}
        todayDoneCount={todayDoneCount}
        todayTotal={todayTotal}
      />

      {days.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
          <Moon size={26} className="mx-auto mb-2 text-gray-300" />
          <p className="text-sm font-medium text-gray-600">Rest day</p>
          <p className="text-xs text-gray-400 mt-0.5">Nothing scheduled — recover up for the next one.</p>
        </div>
      ) : isRemote ? (
        <div className="space-y-3">
          {days.map(({ dayNum, entries }) => (
            <DayCard
              key={dayNum}
              dayNum={dayNum}
              entries={entries}
              weekIdx={pos.weekIdx}
              completions={completions}
              weights={weights}
              expanded={expanded}
              setExpanded={setExpanded}
              selectedType={dayTabs[dayNum]}
              onSelectType={(type) => setDayTabs(prev => ({ ...prev, [dayNum]: type }))}
              openBlock={openBlock}
              toggleBlock={toggleBlock}
              onToggleComplete={toggleExerciseComplete}
              onChooseSlotOption={chooseSlotOption}
              onOpenDetail={setDetail}
              onSaveWeight={saveWeight}
            />
          ))}
        </div>
      ) : (
        <DayBody
          entries={days[0].entries}
          weekIdx={pos.weekIdx}
          dayIdx={pos.dayNum - 1}
          groupPrefix="today"
          completions={completions}
          weights={weights}
          selectedType={dayTabs.today}
          onSelectType={(type) => setDayTabs(prev => ({ ...prev, today: type }))}
          openBlock={openBlock}
          toggleBlock={toggleBlock}
          onToggleComplete={toggleExerciseComplete}
          onChooseSlotOption={chooseSlotOption}
          onOpenDetail={setDetail}
          onSaveWeight={saveWeight}
        />
      )}

      <ExerciseDetailModal detail={detail} onClose={() => setDetail(null)} />
    </div>
  )
}

function UpdateNotice({ programs, onDismiss, dismissing }) {
  if (programs.length === 0) return null
  return (
    <div className="flex items-start gap-2.5 bg-sp-green-50 border border-sp-green-200 rounded-2xl px-4 py-3 mb-4">
      <Sparkles size={16} className="text-sp-green-600 flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-sp-green-800">Your coach updated your program</p>
        <p className="text-xs text-sp-green-700 mt-0.5">
          {programs.map(p => programTypeInfo(p.programType).shortLabel).join(' and ')}
          {programs.length === 1 ? ' has' : ' have'} changed. Anything you already
          checked off is still saved.
        </p>
      </div>
      <button
        onClick={onDismiss}
        disabled={dismissing}
        className="p-1 -m-1 text-sp-green-600 hover:text-sp-green-800 transition flex-shrink-0"
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
function TodayHero({ isRemote, weekIdx, dayNum, pastProgram, streak, todayDone, todayDoneCount, todayTotal }) {
  const pct = todayTotal ? Math.round((todayDoneCount / todayTotal) * 100) : 0

  if (pastProgram) {
    return (
      <div className="surface-brand relative overflow-hidden text-white rounded-2xl p-5 mb-5 text-center">
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
    <div className="surface-brand relative overflow-hidden text-white rounded-2xl p-5 mb-5">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(circle at 90% 0%, rgba(46,158,99,0.35), transparent 60%)' }}
      />
      <div className="relative flex items-center gap-4">
        <ProgressRing pct={pct} size={72} strokeWidth={7} />
        <div className="flex-1 min-w-0">
          <p className="text-xs text-white/60">{format(new Date(), 'EEEE, MMM d')}</p>
          <p className="font-display text-lg font-bold truncate">
            {isRemote ? "This Week's Focuses" : `Week ${weekIdx + 1} · Day ${dayNum}`}
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
  openBlock, toggleBlock, onToggleComplete, onChooseSlotOption, onOpenDetail, onSaveWeight,
}) {
  const availableTypes = TAB_ORDER.filter(t => entries.some(e => (e.program.programType || 'correctives') === t))
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
                activeType === t ? 'bg-sp-green-500 text-white' : 'bg-white border border-gray-200 text-gray-500'
              }`}
            >
              {TAB_META[t].label}
            </button>
          ))}
        </div>
      )}

      {activeEntry && (
        <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100">
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

// Only used for remote athletes, who see several flexible "day" cards for
// the current week rather than one dated day.
function DayCard({
  dayNum, entries, weekIdx,
  completions, weights, expanded, setExpanded, selectedType, onSelectType,
  openBlock, toggleBlock, onToggleComplete, onChooseSlotOption, onOpenDetail, onSaveWeight,
}) {
  const dayIdx = dayNum - 1
  const key    = `day_${dayNum}`
  const isExpanded = expanded === key

  const totalExercises = entries.reduce((s, e) => s + buildSlots(e.day.exercises).length, 0)
  const doneCount = entries.reduce((s, e) => (
    s + buildSlots(e.day.exercises).filter(slot => isSlotComplete(completions, e.program.id, slot, weekIdx, dayIdx)).length
  ), 0)
  const done = totalExercises > 0 && doneCount === totalExercises

  return (
    <div className={`bg-white rounded-2xl overflow-hidden shadow-sm border transition ${done ? 'border-sp-green-200' : 'border-gray-100'}`}>
      <div
        className="flex items-center px-4 py-3.5 cursor-pointer select-none"
        onClick={() => setExpanded(isExpanded ? null : key)}
      >
        <div className={`w-9 h-9 rounded-full flex items-center justify-center mr-3 flex-shrink-0 ${done ? 'bg-sp-green-100' : 'bg-gray-100'}`}>
          {done ? <CheckCircle2 size={20} className="text-sp-green-500" /> : <ListChecks size={16} className="text-gray-400" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 truncate">Focus {dayNum}</p>
          <p className="text-xs text-gray-400">Tap to view</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${done ? 'bg-sp-green-50 text-sp-green-500' : 'bg-gray-50 text-gray-400'}`}>
            {doneCount}/{totalExercises}
          </span>
          {isExpanded ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
        </div>
      </div>

      {isExpanded && (
        <div className="border-t border-gray-100 px-1 pt-1">
          <DayBody
            entries={entries}
            weekIdx={weekIdx}
            dayIdx={dayIdx}
            groupPrefix={key}
            completions={completions}
            weights={weights}
            selectedType={selectedType}
            onSelectType={onSelectType}
            openBlock={openBlock}
            toggleBlock={toggleBlock}
            onToggleComplete={onToggleComplete}
            onChooseSlotOption={onChooseSlotOption}
            onOpenDetail={onOpenDetail}
            onSaveWeight={onSaveWeight}
          />
        </div>
      )}
    </div>
  )
}

function CategoryTiles({
  program, day, fallbackCategory, currentWeek, dayIdx, groupKey,
  doneCount, totalExercises, showWeight, completions, weights,
  openBlockKey, toggleBlock, onToggleComplete, onChooseSlotOption, onOpenDetail, onSaveWeight,
}) {
  return (
    <>
      {buildCategoryBlocks(day, fallbackCategory).map((block) => {
        const info = exerciseCategoryInfo(block.label)
        const Icon = CATEGORY_ICONS[info.icon] || ListChecks
        const blockOpen = openBlockKey === block.key
        const blockDone = block.slots.filter(slot => isSlotComplete(completions, program.id, slot, currentWeek, dayIdx)).length

        return (
          <div key={block.key} className="border-b border-gray-50 last:border-0">
            <button
              onClick={() => toggleBlock(groupKey, block.key)}
              className="w-full flex items-center justify-between gap-2 px-4 py-2.5 hover:bg-gray-50/60 transition"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 ${info.badgeClass}`}>
                  <Icon size={13} />
                </span>
                <span className="text-[11px] font-bold uppercase tracking-wide text-gray-700 truncate">{info.label}</span>
                <span className="text-[11px] text-gray-400 flex-shrink-0">{blockDone}/{block.slots.length}</span>
              </div>
              {blockOpen ? <ChevronUp size={14} className="text-gray-300 flex-shrink-0" /> : <ChevronDown size={14} className="text-gray-300 flex-shrink-0" />}
            </button>

            {blockOpen && (
              <div className="divide-y divide-gray-50">
                {block.slots.map((slot) => slot.items.length > 1
                  ? (
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
                  : (
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
                )}
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
          : <Circle size={22} className="text-gray-300" />
        }
      </button>
      <button
        onClick={() => onOpenDetail({ ex, program })}
        className="flex-1 min-w-0 text-left"
      >
        <div className="flex items-center gap-1.5">
          <p className={`font-medium text-sm truncate ${exDone ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{ex.name}</p>
          {ex.notes && (
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" title="Note added — tap to view" />
          )}
        </div>
        <p className="text-xs text-gray-400 mt-0.5">
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
function AltOptionSlot({ slot, program, currentWeek, dayIdx, doneCount, totalExercises, completions, onChooseSlotOption, onOpenDetail }) {
  const anyDone = isSlotComplete(completions, program.id, slot, currentWeek, dayIdx)
  return (
    <div className="px-4 py-3">
      <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-1.5">Choose one</p>
      <div className="space-y-1.5">
        {slot.items.map(({ ex, i }, pos) => {
          const exDone = isExerciseComplete(completions, program.id, ex, currentWeek, dayIdx, i)
          const wouldFinishDay = !anyDone && doneCount + 1 === totalExercises
          return (
            <div
              key={ex.id || i}
              className={`flex items-center gap-2 rounded-xl border px-2.5 py-2 transition ${
                exDone ? 'border-sp-green-200 bg-sp-green-50' : 'border-gray-200'
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
                  : <Circle size={20} className="text-gray-300" />
                }
              </button>
              <button onClick={() => onOpenDetail({ ex, program })} className="flex-1 min-w-0 text-left">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-bold text-gray-400 flex-shrink-0">{pos === 0 ? 'A' : 'B'}</span>
                  <p className={`font-medium text-sm truncate ${exDone ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{ex.name}</p>
                  {ex.notes && (
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" title="Note added — tap to view" />
                  )}
                </div>
                <p className="text-xs text-gray-400 mt-0.5 pl-4">
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
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-sm max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between px-5 py-4 border-b border-gray-100">
          <div className="min-w-0">
            <p className="font-bold text-gray-900">{ex.name}</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {[ex.sets && `${ex.sets} sets`, ex.reps && `${ex.reps} reps`, ex.intensity || ex.load].filter(Boolean).join(' · ')}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition flex-shrink-0"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-4">
          {ex.notes && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Notes</p>
              <p className="text-sm text-gray-700">{ex.notes}</p>
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
            <p className="text-sm text-gray-400">No additional details for this exercise.</p>
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
        className="w-14 px-2 py-1.5 border border-gray-200 rounded-lg text-xs text-center text-gray-700 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-sp-green-500 disabled:opacity-60"
      />
    </div>
  )
}

function PageLoader() {
  return (
    <div className="flex justify-center items-center min-h-[60vh]">
      <div className="w-8 h-8 border-3 border-sp-green-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}
