import { useEffect, useRef } from 'react'
import { Check } from 'lucide-react'
import { dayStats, dayStatsByType, dayCountForWeek } from '../../utils/programSchedule'
import { programTypeInfo } from '../../constants/programTypes'

/**
 * Horizontally scrollable day picker for the athlete's schedule.
 *
 * The Today tab used to render exactly one day — the one matching today's
 * date — with no way to reach any other. An athlete who missed Tuesday had
 * nowhere to go and tick it off. This puts the whole program on a scrollable
 * strip so missed work is both visible and reachable.
 *
 * Deliberately a strip and not the editor's month grid: this is a phone screen
 * in a weight room, so it's one row of thumb-sized targets that scrolls, rather
 * than a dense grid that would need pinching to read.
 *
 * Status per day comes from the same dayStats() the streak uses, so a day that
 * reads "done" here is done by exactly the definition the streak counts.
 *
 * Each day carries one dot per program type scheduled on it, in that type's
 * own colour (the same colours the program tabs and badges use — see
 * PROGRAM_TYPES), so the athlete can see at a glance that Tuesday is throwing
 * and mobility while Wednesday is pre-throw only. A filled dot means that
 * type is finished, a hollow one means it isn't; a day with nothing scheduled
 * shows no dots at all rather than a row of empties.
 */

const WEEKDAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

function cellDate(startDate, weekIdx, dayNum) {
  if (!startDate) return null
  const start = new Date(`${startDate}T00:00:00`)
  if (Number.isNaN(start.getTime())) return null
  const d = new Date(start)
  d.setDate(d.getDate() + weekIdx * 7 + (dayNum - 1))
  return d
}

export default function DayStrip({
  programs,
  completions,
  totalWeeks,
  pos,           // today's position — { weekIdx, dayNum, startDate, hasStart }
  selected,      // { weekIdx, dayNum } currently being viewed
  onSelect,
}) {
  const scrollRef = useRef(null)
  const todayRef = useRef(null)

  // Land on today rather than the start of a 12-week program. `instant`
  // because this is the initial position, not a movement worth animating.
  useEffect(() => {
    todayRef.current?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'instant' })
  }, [])

  const days = []
  for (let wi = 0; wi < totalWeeks; wi++) {
    for (let dn = 1; dn <= dayCountForWeek(programs, wi); dn++) {
      days.push({ weekIdx: wi, dayNum: dn })
    }
  }
  if (days.length === 0) return null

  const isBefore = (a, b) => a.weekIdx < b.weekIdx || (a.weekIdx === b.weekIdx && a.dayNum < b.dayNum)

  return (
    <div className="mb-3">
      <div
        ref={scrollRef}
        className="flex gap-1.5 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-none"
      >
        {days.map(({ weekIdx, dayNum }) => {
          const { total, done } = dayStats(programs, completions, weekIdx, dayNum - 1)
          const isToday = weekIdx === pos.weekIdx && dayNum === pos.dayNum
          const isSelected = weekIdx === selected.weekIdx && dayNum === selected.dayNum
          const past = isBefore({ weekIdx, dayNum }, pos)
          const complete = total > 0 && done === total
          const rest = total === 0
          // Only a past day with unfinished work is "missed" — a rest day
          // isn't missed, and today isn't missed while it's still today.
          const missed = past && total > 0 && done < total
          const typeStats = dayStatsByType(programs, completions, weekIdx, dayNum - 1)
          const date = cellDate(pos.startDate, weekIdx, dayNum)
          const startOfWeek = dayNum === 1

          return (
            <div key={`${weekIdx}-${dayNum}`} className="flex items-stretch gap-1.5 flex-shrink-0">
              {/* Week divider doubles as the only place week numbers appear —
                  the strip is otherwise dates, which is what an athlete
                  actually navigates by. */}
              {startOfWeek && (
                <div className="flex flex-col items-center justify-center pl-1 pr-0.5">
                  <span className="text-[9px] font-bold text-sp-ink-300/60 uppercase tracking-wider [writing-mode:vertical-rl] rotate-180">
                    Wk {weekIdx + 1}
                  </span>
                </div>
              )}

              <button
                type="button"
                ref={isToday ? todayRef : undefined}
                onClick={() => onSelect({ weekIdx, dayNum })}
                aria-current={isSelected ? 'date' : undefined}
                aria-label={
                  `${date ? date.toDateString() : `Week ${weekIdx + 1} day ${dayNum}`}` +
                  (rest ? ', rest day' : complete ? ', complete' : missed ? ', missed' : `, ${done} of ${total} done`)
                }
                className={`w-[52px] py-2 rounded-xl border flex flex-col items-center gap-1 transition ${
                  isSelected
                    ? 'border-sp-green-500 bg-sp-green-500/15'
                    : missed
                      ? 'border-amber-400/60 bg-sp-ink-800 hover:border-amber-400'
                      : 'border-sp-ink-600 bg-sp-ink-800 hover:border-sp-ink-300/40'
                }`}
              >
                <span className="text-[9px] font-semibold uppercase tracking-wide text-sp-ink-300">
                  {date ? WEEKDAY_INITIALS[date.getDay()] : `D${dayNum}`}
                </span>

                <span className={`text-sm font-bold leading-none w-6 h-6 flex items-center justify-center rounded-full ${
                  isToday ? 'bg-sp-green-500 text-white' : 'text-sp-ink-50'
                }`}>
                  {date ? date.getDate() : dayNum}
                </span>

                {/* A dot per program type scheduled that day, filled once
                    that type is done. The whole day being complete still gets
                    the check — it reads faster than four filled dots, and it's
                    the thing an athlete looks for. A rest day shows nothing at
                    all rather than empties that would read as skipped work. */}
                <span className="h-2 flex items-center justify-center gap-0.5">
                  {complete ? (
                    <Check size={11} className="text-sp-green-400" strokeWidth={3} />
                  ) : rest ? null : (
                    typeStats.map(({ type, total: t, done: d }) => (
                      <span
                        key={type}
                        className={`w-1.5 h-1.5 rounded-full ${programTypeInfo(type).dotClass} ${
                          d === t ? '' : 'opacity-40'
                        }`}
                      />
                    ))
                  )}
                </span>
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
