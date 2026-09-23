import { useState } from 'react'
import { CalendarDays, Moon, Check, Dumbbell } from 'lucide-react'
import { format } from 'date-fns'
import { PROGRAM_TYPES, programTypeInfo, exerciseCategoryInfo, categoryRank, DAY_TYPES, LIFTING_DAY_TYPES } from '../constants/programTypes'
import { buildSlots, isSlotComplete, isExerciseComplete } from '../utils/programIds'
import { cellDate, computeTodayPosition, dayIndexFor, dayCountForWeek, dayStatsByType, activeProgramsForAthlete } from '../utils/programSchedule'

/**
 * What an athlete actually has on a given day, read-only.
 *
 * The only way to see a program used to be the editor, which is a poor place
 * to just look: it shows one program type at a time, every field is an input,
 * and on a live program a stray keystroke writes straight through to what the
 * athlete is following. This answers "what is this kid doing Monday, and did
 * they do it" without putting a single editable control on the screen.
 *
 * Mirrors the athlete's own experience rather than the editor's:
 *  - in-house athletes get dated weeks and days, with every program type that
 *    lands on that date merged into one view, the way their phone shows it
 *  - College Remote athletes have no dates at all, so they get the day-type
 *    picker instead — the same four types their schedule offers
 *  - lifting is always separate, because a lift day is Upper/Lower rather than
 *    a weekday (see LIFTING_DAY_TYPE_DAYNUM)
 *
 * Completion marks come from the same helpers the athlete's page and the
 * streak use, so "done" here means exactly what it means everywhere else.
 */
export default function AthleteProgramView({ programs = [], completions = {}, athleteType = 'in_house', athleteId }) {
  // Filtered here rather than by the caller: the page's program list carries
  // the general library too, and a template rendered as this athlete's work
  // is the bug this view shipped with.
  const active = activeProgramsForAthlete(programs, athleteId)
  const lifting = active.filter(p => (p.programType || 'correctives') === 'lifting')
  const dated = active.filter(p => (p.programType || 'correctives') !== 'lifting')
  const isRemote = athleteType === 'remote'

  const totalWeeks = Math.max(1, ...active.map(p => p.weeks?.length || 0))
  const today = computeTodayPosition(dated, totalWeeks)
  const [weekIdx, setWeekIdx] = useState(() =>
    today.hasStart && !today.notStartedYet && !today.pastProgram ? today.weekIdx : 0)
  const [dayNum, setDayNum] = useState(() => (today.hasStart ? today.dayNum : 1))
  const [dayType, setDayType] = useState(DAY_TYPES[0].key)

  if (active.length === 0) {
    return (
      <div className="bg-sp-ink-800 rounded-2xl border border-sp-ink-600 p-8 text-center">
        <CalendarDays size={26} className="mx-auto mb-2 text-sp-ink-300" />
        <p className="text-sm font-medium text-white">No active program</p>
        <p className="text-xs text-sp-ink-300 mt-0.5">Assign one from the Program tab to see a schedule here.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="bg-sp-ink-800 rounded-2xl border border-sp-ink-600 px-5 py-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-full bg-sp-green-500/15 text-sp-green-400 flex items-center justify-center flex-shrink-0">
            <CalendarDays size={17} />
          </div>
          <div className="min-w-0">
            <h2 className="font-semibold text-white text-sm">Schedule</h2>
            <p className="text-xs text-sp-ink-300 mt-0.5 max-w-xl">
              {isRemote
                ? 'This athlete picks a day type rather than following dates, so this shows what each type holds across every program.'
                : 'What this athlete sees, day by day, with everything they have completed. Read-only — nothing here can change a program.'}
            </p>
          </div>
        </div>
      </div>

      {isRemote
        ? <RemoteView programs={dated} lifting={lifting} completions={completions} dayType={dayType} onPickType={setDayType} />
        : (
          <DatedView
            programs={dated} lifting={lifting} completions={completions}
            totalWeeks={totalWeeks} today={today}
            weekIdx={weekIdx} dayNum={dayNum}
            onPickWeek={setWeekIdx} onPickDay={setDayNum}
          />
        )}
    </div>
  )
}

/* ── in-house: dated weeks and days ─────────────────────────────────────── */

function DatedView({ programs, lifting, completions, totalWeeks, today, weekIdx, dayNum, onPickWeek, onPickDay }) {
  const startDate = today.startDate
  const dayCount = Math.max(1, dayCountForWeek(programs, weekIdx))
  const date = cellDate(startDate, weekIdx, dayNum)
  const entries = programs
    .map(p => {
      const idx = dayIndexFor(p, weekIdx, dayNum)
      return idx === -1 ? null : { program: p, day: p.weeks[weekIdx].days[idx], dayIdx: idx }
    })
    .filter(e => e && e.day?.exercises?.length)
    .sort((a, b) => typeOrder(a.program) - typeOrder(b.program))

  return (
    <>
      <div className="bg-sp-ink-800 rounded-2xl border border-sp-ink-600 p-4">
        {/* Week picker — weeks are the unit a coach thinks in. */}
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="text-[11px] font-bold text-sp-ink-300 uppercase tracking-wider mr-1">Week</span>
          {Array.from({ length: totalWeeks }, (_, w) => (
            <button
              key={w}
              type="button"
              onClick={() => onPickWeek(w)}
              className={`w-8 h-8 rounded-lg text-xs font-semibold transition ${
                w === weekIdx ? 'bg-sp-green-500 text-white' : 'bg-sp-ink-900/60 text-sp-ink-300 hover:text-white'
              }`}
            >
              {w + 1}
            </button>
          ))}
        </div>

        {/* Days of that week, with a dot per program type scheduled — same
            colours and the same lookup the athlete's own strip uses. */}
        <div className="grid grid-cols-7 gap-1.5">
          {Array.from({ length: Math.max(dayCount, 7) }, (_, i) => {
            const d = i + 1
            const cellDateValue = cellDate(startDate, weekIdx, d)
            const types = dayStatsByType(programs, completions, weekIdx, d - 1)
            const isToday = today.hasStart && today.weekIdx === weekIdx && today.dayNum === d
            const selected = d === dayNum
            return (
              <button
                key={d}
                type="button"
                onClick={() => onPickDay(d)}
                className={`py-2 rounded-xl border flex flex-col items-center gap-1 transition ${
                  selected ? 'border-sp-green-500 bg-sp-green-500/15' : 'border-sp-ink-600 bg-sp-ink-900/40 hover:border-sp-ink-300/40'
                }`}
              >
                <span className="text-[9px] uppercase tracking-wide text-sp-ink-300">
                  {cellDateValue ? format(cellDateValue, 'EEE') : `D${d}`}
                </span>
                <span className={`text-sm font-bold leading-none w-6 h-6 flex items-center justify-center rounded-full ${
                  isToday ? 'bg-sp-green-500 text-white' : 'text-sp-ink-50'
                }`}>
                  {cellDateValue ? cellDateValue.getDate() : d}
                </span>
                <span className="h-2 flex items-center gap-0.5">
                  {types.map(t => (
                    <span
                      key={t.type}
                      className={`w-1.5 h-1.5 rounded-full ${programTypeInfo(t.type).dotClass} ${t.done === t.total ? '' : 'opacity-40'}`}
                    />
                  ))}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <DayDetail
        title={date ? format(date, 'EEEE, MMM d') : `Week ${weekIdx + 1} · Day ${dayNum}`}
        entries={entries}
        completions={completions}
        weekIdx={weekIdx}
      />

      {lifting.length > 0 && <LiftingSection programs={lifting} completions={completions} weekIdx={weekIdx} />}
    </>
  )
}

/* ── College Remote: day types, no dates ────────────────────────────────── */

function RemoteView({ programs, lifting, completions, dayType, onPickType }) {
  const entries = programs.flatMap(p =>
    (p.weeks || []).flatMap((week, wi) =>
      (week.days || []).map((day, di) => ({ program: p, day, dayIdx: di, weekIdx: wi }))
    ).filter(e => e.day?.dayType === dayType && e.day?.exercises?.length)
  ).sort((a, b) => typeOrder(a.program) - typeOrder(b.program))

  return (
    <>
      <div className="bg-sp-ink-800 rounded-2xl border border-sp-ink-600 p-4">
        <div className="flex flex-wrap gap-2">
          {DAY_TYPES.map(dt => (
            <button
              key={dt.key}
              type="button"
              onClick={() => onPickType(dt.key)}
              className={`px-3.5 py-2 rounded-xl border text-sm font-medium transition ${
                dt.key === dayType
                  ? 'border-sp-green-500 bg-sp-green-500/15 text-white'
                  : 'border-sp-ink-600 bg-sp-ink-900/40 text-sp-ink-300 hover:border-sp-ink-300/40'
              }`}
            >
              {dt.label}
            </button>
          ))}
        </div>
      </div>

      <DayDetail
        title={DAY_TYPES.find(d => d.key === dayType)?.label || 'Day'}
        entries={entries}
        completions={completions}
        weekIdx={null}
        // Remote completions are ephemeral by design on the athlete side, so
        // a tick column and a "0/2 done" here would read as an athlete who
        // did nothing rather than a mode that records nothing.
        showCompletion={false}
        note="College Remote sessions aren't ticked off — their day types repeat, so nothing is recorded as done."
      />

      {lifting.length > 0 && <LiftingSection programs={lifting} completions={completions} weekIdx={0} />}
    </>
  )
}

/* ── shared pieces ──────────────────────────────────────────────────────── */

const typeOrder = (p) => PROGRAM_TYPES.findIndex(t => t.key === (p.programType || 'correctives'))

function DayDetail({ title, entries, completions, weekIdx, note, showCompletion = true }) {
  if (entries.length === 0) {
    return (
      <div className="bg-sp-ink-800 rounded-2xl border border-sp-ink-600 p-8 text-center">
        <Moon size={24} className="mx-auto mb-2 text-sp-ink-300" />
        <p className="text-sm font-medium text-white">{title}</p>
        <p className="text-xs text-sp-ink-300 mt-0.5">Rest day — nothing scheduled.</p>
      </div>
    )
  }

  return (
    <div className="bg-sp-ink-800 rounded-2xl border border-sp-ink-600 p-5">
      <p className="font-semibold text-white mb-1">{title}</p>
      {note && <p className="text-[11px] text-sp-ink-300 mb-3">{note}</p>}

      <div className="space-y-4 mt-3">
        {entries.map(({ program, day, dayIdx, weekIdx: entryWeek }) => {
          const wi = weekIdx ?? entryWeek ?? 0
          const info = programTypeInfo(program.programType)
          const slots = buildSlots(day.exercises)
          const done = showCompletion
            ? slots.filter(s => isSlotComplete(completions, program.id, s, wi, dayIdx)).length
            : null
          const groups = groupByCategory(day.exercises)

          return (
            <div key={`${program.id}-${wi}-${dayIdx}`} className="bg-sp-ink-900/40 border border-sp-ink-600/60 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className={`w-2 h-2 rounded-full ${info.dotClass}`} />
                <span className="text-sm font-semibold text-white">{info.label}</span>
                {day.category && <span className="text-xs text-sp-ink-300">· {day.category}</span>}
                <span className="ml-auto text-xs text-sp-ink-300">
                  {showCompletion ? `${done}/${slots.length} done` : `${slots.length} exercise${slots.length === 1 ? '' : 's'}`}
                </span>
              </div>

              <div className="space-y-3">
                {groups.map(group => (
                  <div key={group.key}>
                    <p className="text-[11px] font-bold text-sp-ink-300 uppercase tracking-wider mb-1.5">
                      {exerciseCategoryInfo(group.key).shortLabel || group.key}
                    </p>
                    <div className="space-y-1">
                      {group.items.map(({ ex, i }) => {
                        const complete = showCompletion && isExerciseComplete(completions, program.id, ex, wi, dayIdx, i)
                        return (
                          <div key={ex.id || i} className="flex items-baseline gap-2 text-xs">
                            {showCompletion && (
                              <span className="w-3.5 flex-shrink-0">
                                {complete && <Check size={12} className="text-sp-green-400" strokeWidth={3} />}
                              </span>
                            )}
                            <span className={complete ? 'text-sp-ink-300 line-through' : 'text-sp-ink-50'}>{ex.name}</span>
                            <span className="text-sp-ink-300/70 ml-auto text-right">
                              {[ex.sets && `${ex.sets}×`, ex.reps, ex.intensity || ex.load].filter(Boolean).join(' ')}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** Lifting browsed by its own day types, never by date. */
function LiftingSection({ programs, completions, weekIdx }) {
  const [openType, setOpenType] = useState(LIFTING_DAY_TYPES[0].key)
  const match = programs.flatMap(p =>
    (p.weeks || []).flatMap((week, wi) =>
      (week.days || []).map((day, di) => ({ program: p, day, dayIdx: di, weekIdx: wi }))
    ).filter(e => e.day?.dayType === openType && e.day?.exercises?.length)
  )

  return (
    <div className="bg-sp-ink-800 rounded-2xl border border-sp-ink-600 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Dumbbell size={15} className="text-amber-400" />
        <span className="text-sm font-semibold text-white">Lifting</span>
        <span className="text-[11px] text-sp-ink-300">· by day type, not date</span>
      </div>
      <div className="flex flex-wrap gap-2 mb-3">
        {LIFTING_DAY_TYPES.map(dt => (
          <button
            key={dt.key}
            type="button"
            onClick={() => setOpenType(dt.key)}
            className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition ${
              dt.key === openType
                ? 'border-amber-500 bg-amber-500/15 text-amber-200'
                : 'border-sp-ink-600 bg-sp-ink-900/40 text-sp-ink-300 hover:border-sp-ink-300/40'
            }`}
          >
            {dt.label}
          </button>
        ))}
      </div>
      <DayDetail
        title={LIFTING_DAY_TYPES.find(d => d.key === openType)?.label || 'Lift'}
        entries={match}
        completions={completions}
        weekIdx={null}
      />
    </div>
  )
}

/** Exercises grouped by category, in the same order the athlete sees. */
function groupByCategory(exercises = []) {
  const groups = []
  const index = {}
  exercises.forEach((ex, i) => {
    const key = (ex.category || '').trim() || 'General'
    if (index[key] === undefined) {
      index[key] = groups.length
      groups.push({ key, items: [] })
    }
    groups[index[key]].items.push({ ex, i })
  })
  return groups.sort((a, b) => categoryRank(a.key) - categoryRank(b.key))
}
