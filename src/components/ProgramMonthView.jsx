import { DAY_TYPES, LIFTING_DAY_TYPES, programTypeInfo } from '../constants/programTypes'
import { computeTodayPosition } from '../utils/programSchedule'

/**
 * Month-view overview of a program, modelled on Apple Calendar.
 *
 * The editor used to render every week fully expanded in one column, so
 * reaching week 7 of a 12-week program meant scrolling past ~60 days of
 * exercise rows. This puts the whole program on one screen — a week per row, a
 * day per column — and the editor below shows one week at a time.
 *
 * Columns are real weekdays whenever the program has a startDate. That works
 * because a program week is a 7-day block from that date, so every week starts
 * on the same weekday and the grid stays square — no ragged first row the way a
 * real month has. Without a startDate (older programs) it degrades to
 * "Day 1…7", which is still a usable grid, just not a dated one.
 */

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** Date of a given week/day, or null when the program has no startDate. */
function cellDate(startDate, weekIdx, dayNum) {
  if (!startDate) return null
  const start = new Date(`${startDate}T00:00:00`)
  if (Number.isNaN(start.getTime())) return null
  const d = new Date(start)
  d.setDate(d.getDate() + weekIdx * 7 + (dayNum - 1))
  return d
}

export default function ProgramMonthView({
  weeks = [],
  startDate,
  programType,
  viewWeek,
  onSelectWeek,
  onSelectDay,
}) {
  // One editor shows one program, so the grid carries that program type's
  // colour throughout — the same colour its tab, badge and the athlete's day
  // strip use, so a coach looking at "the blue one" and an athlete looking at
  // a blue dot are looking at the same program.
  const typeInfo = programTypeInfo(programType)
  const dayTypes = programType === 'lifting' ? LIFTING_DAY_TYPES : DAY_TYPES
  const labelFor = (key) => dayTypes.find(dt => dt.key === key)?.label

  // Widest week decides the column count — weeks don't all carry 7 days, and a
  // fixed 7 would leave a dead column on programs that never use one.
  const columns = Math.max(1, ...weeks.map(w => w.days?.length || 0))

  const today = computeTodayPosition(weeks.length ? [{ startDate }] : [], weeks.length)
  const isToday = (wi, dayNum) =>
    startDate && today.hasStart && !today.notStartedYet && !today.pastProgram &&
    today.weekIdx === wi && today.dayNum === dayNum

  // With a startDate every row starts on the same weekday, so one header row
  // describes every week.
  const headerLabels = Array.from({ length: columns }, (_, i) => {
    const d = cellDate(startDate, 0, i + 1)
    return d ? WEEKDAY_LABELS[d.getDay()] : `Day ${i + 1}`
  })

  return (
    <div className="border border-sp-ink-600 rounded-xl overflow-hidden bg-sp-ink-900/40">
      <div className="flex items-center justify-between px-3 py-2 border-b border-sp-ink-600">
        <p className="text-[11px] font-bold text-sp-ink-300 uppercase tracking-wider flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${typeInfo.dotClass}`} />
          {typeInfo.label} overview
        </p>
        <button
          type="button"
          onClick={() => onSelectWeek(null)}
          className={`text-[11px] px-2 py-0.5 rounded-lg transition ${
            viewWeek === null
              ? 'bg-sp-green-500/20 text-sp-green-400'
              : 'text-sp-ink-300/70 hover:text-sp-green-400'
          }`}
        >
          Show all weeks
        </button>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[640px]">
          {/* Weekday header — one gutter column for the week label, then days */}
          <div
            className="grid border-b border-sp-ink-600 bg-sp-ink-800/40"
            style={{ gridTemplateColumns: `72px repeat(${columns}, minmax(0, 1fr))` }}
          >
            <div />
            {headerLabels.map((label, i) => (
              <div
                key={i}
                className="px-2 py-1.5 text-[10px] font-semibold text-sp-ink-300 uppercase tracking-wider text-center border-l border-sp-ink-600/60"
              >
                {label}
              </div>
            ))}
          </div>

          {weeks.map((week, wi) => {
            const active = viewWeek === wi
            return (
              <div
                key={wi}
                className={`grid border-b border-sp-ink-600/60 last:border-b-0 transition ${
                  active ? 'bg-sp-green-500/[0.07]' : ''
                }`}
                style={{ gridTemplateColumns: `72px repeat(${columns}, minmax(0, 1fr))` }}
              >
                <button
                  type="button"
                  onClick={() => onSelectWeek(active ? null : wi)}
                  className={`px-2 py-2 text-left text-[11px] font-bold uppercase tracking-wider transition ${
                    active ? 'text-sp-green-400' : 'text-sp-ink-300 hover:text-sp-green-400'
                  }`}
                >
                  Wk {week.weekNum ?? wi + 1}
                </button>

                {Array.from({ length: columns }, (_, ci) => {
                  const day = week.days?.[ci]
                  const dayNum = day?.dayNum ?? ci + 1
                  const date = cellDate(startDate, wi, dayNum)
                  const count = day?.exercises?.length || 0
                  const focus = day?.category || day?.title || ''
                  const typeLabel = labelFor(day?.dayType)

                  if (!day) {
                    return (
                      <div
                        key={ci}
                        className="min-h-[76px] border-l border-sp-ink-600/60 bg-sp-ink-900/30"
                      />
                    )
                  }

                  return (
                    <button
                      key={ci}
                      type="button"
                      onClick={() => onSelectDay(wi, ci)}
                      title={focus || `Day ${dayNum}`}
                      className="min-h-[76px] border-l border-sp-ink-600/60 p-1.5 text-left hover:bg-sp-ink-800/60 transition flex flex-col gap-1"
                    >
                      <span className={`text-[11px] font-semibold leading-none self-start ${
                        isToday(wi, dayNum)
                          ? 'bg-sp-green-500 text-white rounded-full w-5 h-5 flex items-center justify-center'
                          : 'text-sp-ink-200 px-0.5'
                      }`}>
                        {date ? date.getDate() : dayNum}
                      </span>

                      {typeLabel && (
                        <span className={`text-[9px] leading-tight px-1 py-0.5 rounded truncate ${typeInfo.badgeClass}`}>
                          {typeLabel}
                        </span>
                      )}
                      {focus && (
                        <span className="text-[10px] leading-tight text-sp-ink-200 line-clamp-2">
                          {focus}
                        </span>
                      )}
                      {count > 0 && (
                        <span className={`h-1 rounded-full self-stretch ${typeInfo.dotClass}`} />
                      )}
                      {count > 0 && (
                        <span className="text-[9px] text-sp-ink-300/70 mt-auto">
                          {count} {count === 1 ? 'exercise' : 'exercises'}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
