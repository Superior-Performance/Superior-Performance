import { Flag, X } from 'lucide-react'
import { flaggedFindings } from '../constants/assessmentFields'

const MAX_PRIORITIES = 3

/**
 * Which findings actually drive this athlete's program.
 *
 * A full screen throws off a dozen flagged values — Limited here, Fail there —
 * and a program can't chase all of them. This scans what the coach just
 * entered, shows each flagged finding as a chip, and asks for the three that
 * matter, in order, plus optionally why.
 *
 * Reads the form's current values, so it updates as the coach fills the page
 * in; the ranking itself is stored on the assessment (priorityRanking, an
 * ordered array of field keys, and priorityNote).
 *
 * Degree fields don't appear here yet — their flagging thresholds are being
 * decided on Ian's side, and a made-up threshold would put invented clinical
 * judgement in front of a coach. See FLAG_THRESHOLDS.
 */
export default function PriorityRanking({ assessment, ranking = [], note = '', onChange }) {
  const findings = flaggedFindings(assessment)
  const ranked = ranking.filter(key => findings.some(f => f.key === key))
  const byKey = Object.fromEntries(findings.map(f => [f.key, f]))

  function toggle(key) {
    if (ranked.includes(key)) {
      onChange({ ranking: ranked.filter(k => k !== key), note })
    } else if (ranked.length < MAX_PRIORITIES) {
      onChange({ ranking: [...ranked, key], note })
    }
  }

  return (
    <div className="bg-sp-ink-800 rounded-2xl border border-sp-ink-600 p-6 mt-5">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-9 h-9 rounded-full bg-sp-green-500/15 text-sp-green-400 flex items-center justify-center flex-shrink-0">
          <Flag size={17} />
        </div>
        <div className="min-w-0">
          <h2 className="font-semibold text-white">Priority Ranking</h2>
          <p className="text-xs text-sp-ink-300 mt-0.5 max-w-xl">
            Everything flagged on this assessment, pulled from what you entered above.
            Pick the {MAX_PRIORITIES} that actually drive the program, in order.
          </p>
        </div>
      </div>

      {findings.length === 0 ? (
        <p className="text-sm text-sp-ink-300 bg-sp-ink-900/40 border border-sp-ink-600/60 rounded-xl px-4 py-5 text-center">
          Nothing flagged yet — fill in the assessment above and anything limited, failed
          or positive shows up here to rank.
        </p>
      ) : (
        <>
          {/* The picked three, in the order they were picked. */}
          <div className="mb-4">
            <p className="text-[11px] font-bold text-sp-ink-300 uppercase tracking-wider mb-2">
              Priorities ({ranked.length}/{MAX_PRIORITIES})
            </p>
            {ranked.length === 0 ? (
              <p className="text-xs text-sp-ink-300/70">None picked yet — tap a finding below.</p>
            ) : (
              <div className="space-y-1.5">
                {ranked.map((key, i) => (
                  <div key={key} className="flex items-center gap-2.5 bg-sp-green-500/10 border border-sp-green-500/30 rounded-xl px-3 py-2">
                    <span className="w-5 h-5 rounded-full bg-sp-green-500 text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0">
                      {i + 1}
                    </span>
                    <span className="text-sm text-white min-w-0 flex-1 truncate">{byKey[key]?.label}</span>
                    <span className="text-xs text-sp-green-300 flex-shrink-0">{byKey[key]?.value}</span>
                    <button
                      type="button"
                      onClick={() => toggle(key)}
                      aria-label={`Remove ${byKey[key]?.label} from priorities`}
                      className="p-1 -m-1 text-sp-ink-300/70 hover:text-red-400 transition flex-shrink-0"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <p className="text-[11px] font-bold text-sp-ink-300 uppercase tracking-wider mb-2">
            Flagged on this assessment ({findings.length})
          </p>
          <div className="flex flex-wrap gap-2 mb-5">
            {findings.map(f => {
              const rank = ranked.indexOf(f.key)
              const picked = rank !== -1
              const full = ranked.length >= MAX_PRIORITIES && !picked
              return (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => toggle(f.key)}
                  disabled={full}
                  aria-pressed={picked}
                  title={full ? `Remove one of the ${MAX_PRIORITIES} first` : undefined}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition ${
                    picked
                      ? 'bg-sp-green-500/20 border-sp-green-500 text-sp-green-300'
                      : full
                        ? 'bg-sp-ink-900/40 border-sp-ink-600/60 text-sp-ink-300/40 cursor-not-allowed'
                        : 'bg-sp-ink-900/40 border-sp-ink-600 text-sp-ink-200 hover:border-sp-green-500/50'
                  }`}
                >
                  {picked && <span className="font-bold">{rank + 1}</span>}
                  {f.label}
                  <span className={picked ? 'text-sp-green-400' : 'text-sp-ink-300/70'}>{f.value}</span>
                </button>
              )
            })}
          </div>

          <label className="block text-sm font-medium text-sp-ink-100 mb-1.5" htmlFor="priority-note">
            Why these three
          </label>
          <textarea
            id="priority-note"
            value={note}
            onChange={e => onChange({ ranking: ranked, note: e.target.value })}
            rows={2}
            placeholder="Optional — the reasoning you'd want to remember at the next re-screen."
            className="w-full px-3.5 py-2.5 border border-sp-ink-600 rounded-xl text-sm text-sp-ink-50 placeholder-sp-ink-300 bg-sp-ink-900 focus:outline-none focus:ring-2 focus:ring-sp-green-500"
          />
        </>
      )}
    </div>
  )
}
