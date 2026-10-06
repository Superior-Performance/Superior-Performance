import { WEEKDAYS, normalizeTrainingDays } from '../utils/trainingDays'

/**
 * Which weekdays an athlete (or a whole Premier pool) trains on.
 *
 * Seven toggles rather than a form with a Save button: a coach setting this up
 * is thinking "Monday, Tuesday, Thursday, Friday", and making them confirm
 * that adds a step without preventing a mistake — every change here is
 * reversible by tapping again. The parent owns persistence so the same control
 * serves an athlete doc and a pool doc without knowing the difference.
 *
 * `inheritedFrom` is the name of the pool an athlete is currently inheriting
 * from, if any. It matters that this reads as inheritance rather than as an
 * empty setting: "nothing selected" and "following the pool" look identical in
 * a row of toggles, and a coach who can't tell them apart will set the days
 * again by hand and quietly detach the athlete from their pool.
 */
export default function TrainingDayPicker({ value, onToggle, disabled = false, inheritedFrom = null, label = 'Training days' }) {
  const selected = new Set(normalizeTrainingDays(value))
  const isInheriting = selected.size === 0 && !!inheritedFrom

  return (
    <div>
      <div className="flex flex-wrap gap-2" role="group" aria-label={label}>
        {WEEKDAYS.map(({ num, label: dayLabel, short }) => {
          const on = selected.has(num)
          return (
            <button
              key={num}
              type="button"
              aria-pressed={on}
              aria-label={dayLabel}
              disabled={disabled}
              onClick={() => onToggle(num)}
              className={`w-12 py-2 rounded-xl border text-xs font-semibold transition disabled:opacity-50 ${
                on
                  ? 'border-sp-green-500 bg-sp-green-500/15 text-white'
                  : 'border-sp-ink-600 bg-sp-ink-900/40 text-sp-ink-300 hover:border-sp-ink-300/40'
              }`}
            >
              {short}
            </button>
          )
        })}
      </div>
      {isInheriting && (
        <p className="text-xs text-sp-ink-300 mt-2">
          Following <span className="text-white font-medium">{inheritedFrom}</span>. Pick days here to set
          this athlete's own schedule instead.
        </p>
      )}
    </div>
  )
}
