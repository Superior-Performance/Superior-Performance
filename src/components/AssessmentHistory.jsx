import { useState } from 'react'
import { History, ChevronDown, ChevronUp, TrendingUp, ArrowRight } from 'lucide-react'
import Sparkline from './Sparkline'
import { sortByDateDesc, diffAssessments, trendableFields } from '../utils/assessmentHistory'

/**
 * An athlete's past assessments: what was recorded when, what changed since
 * the screen before it, and which measurements are moving.
 *
 * Reads only — every entry here was written by a save on the Assessment tab
 * above. Editing history would make it a worse record than the one it
 * replaced, so there is deliberately no edit affordance.
 *
 * Deliberately says nothing about whether a change is good. Up is progress for
 * a velocity reading and the opposite for a pain score, and this component has
 * no way to know which it's looking at — so it shows the direction and lets
 * the coach read it.
 */
export default function AssessmentHistory({ entries = [], fields = [], loading = false }) {
  const [openDate, setOpenDate] = useState(null)
  const [showTrends, setShowTrends] = useState(true)

  const ordered = sortByDateDesc(entries)
  const trends = trendableFields(ordered, fields)

  if (loading) {
    return (
      <div className="bg-sp-ink-800 rounded-2xl border border-sp-ink-600 p-6 mt-5">
        <p className="text-sm text-sp-ink-300">Loading assessment history…</p>
      </div>
    )
  }

  return (
    <div className="bg-sp-ink-800 rounded-2xl border border-sp-ink-600 p-6 mt-5">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-9 h-9 rounded-full bg-sp-green-500/15 text-sp-green-400 flex items-center justify-center flex-shrink-0">
          <History size={17} />
        </div>
        <div className="min-w-0">
          <h2 className="font-semibold text-white">Assessment History</h2>
          <p className="text-xs text-sp-ink-300 mt-0.5 max-w-xl">
            One entry per assessment date. Saving again on the same date updates that
            entry; a new date starts a new one, so re-screening never overwrites what
            it should be compared against.
          </p>
        </div>
      </div>

      {ordered.length === 0 ? (
        <p className="text-sm text-sp-ink-300 bg-sp-ink-900/40 border border-sp-ink-600/60 rounded-xl px-4 py-5 text-center">
          No assessments recorded yet. The next save above becomes the first entry.
        </p>
      ) : (
        <>
          {/* Trends first: the question "is this athlete moving" is the one
              worth answering before any individual screen. */}
          {trends.length > 0 && (
            <div className="mb-5">
              <button
                type="button"
                onClick={() => setShowTrends(v => !v)}
                className="flex items-center gap-1.5 text-xs font-bold text-sp-ink-300 uppercase tracking-wider mb-3 hover:text-sp-green-400 transition"
              >
                <TrendingUp size={13} />
                Measurements over time ({trends.length})
                {showTrends ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              </button>

              {showTrends && (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {trends.map(({ field, series }) => {
                    const first = series[0].value
                    const last = series[series.length - 1].value
                    const change = last - first
                    return (
                      <div key={field.key} className="bg-sp-ink-900/50 border border-sp-ink-600/60 rounded-xl px-3.5 py-3">
                        <p className="text-[11px] text-sp-ink-300 truncate" title={field.label}>{field.label}</p>
                        <div className="flex items-end justify-between gap-2 mt-1">
                          <div>
                            <span className="font-display text-xl font-bold text-white">{last}</span>
                            {change !== 0 && (
                              <span className={`ml-1.5 text-xs font-medium ${change > 0 ? 'text-sp-green-400' : 'text-amber-400'}`}>
                                {change > 0 ? '+' : ''}{Number(change.toFixed(2))}
                              </span>
                            )}
                          </div>
                          <Sparkline values={series.map(p => p.value)} width={72} height={26} />
                        </div>
                        <p className="text-[10px] text-sp-ink-300/70 mt-1">
                          {series.length} reading{series.length === 1 ? '' : 's'} · from {first} on {series[0].date}
                        </p>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          <p className="text-xs font-bold text-sp-ink-300 uppercase tracking-wider mb-3">
            {ordered.length} assessment{ordered.length === 1 ? '' : 's'}
          </p>

          <div className="space-y-2">
            {ordered.map((entry, i) => {
              const previous = ordered[i + 1] // the screen before this one
              const changes = previous ? diffAssessments(entry, previous, fields) : []
              const isOpen = openDate === entry.id
              const filled = fields.filter(f => {
                const v = entry[f.key]
                return v !== undefined && v !== null && String(v).trim() !== ''
              })

              return (
                <div key={entry.id} className="bg-sp-ink-900/40 border border-sp-ink-600/60 rounded-xl overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setOpenDate(isOpen ? null : entry.id)}
                    aria-expanded={isOpen}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/[0.03] transition text-left"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-white">
                        {entry.assessmentDate || entry.id}
                        {i === 0 && (
                          <span className="ml-2 text-[10px] font-semibold bg-sp-green-500/15 text-sp-green-400 px-1.5 py-0.5 rounded-full">
                            Most recent
                          </span>
                        )}
                      </p>
                      <p className="text-[11px] text-sp-ink-300 mt-0.5">
                        {filled.length} field{filled.length === 1 ? '' : 's'} recorded
                        {previous && ` · ${changes.length} change${changes.length === 1 ? '' : 's'} from ${previous.assessmentDate || previous.id}`}
                      </p>
                    </div>
                    {isOpen ? <ChevronUp size={15} className="text-sp-ink-300 flex-shrink-0" /> : <ChevronDown size={15} className="text-sp-ink-300 flex-shrink-0" />}
                  </button>

                  {isOpen && (
                    <div className="px-4 pb-4 border-t border-sp-ink-600/60 pt-3 space-y-4">
                      {previous && (
                        <div>
                          <p className="text-[11px] font-bold text-sp-ink-300 uppercase tracking-wider mb-2">
                            Changed since {previous.assessmentDate || previous.id}
                          </p>
                          {changes.length === 0 ? (
                            <p className="text-xs text-sp-ink-300">Nothing changed between these two.</p>
                          ) : (
                            <div className="space-y-1.5">
                              {changes.map(c => (
                                <div key={c.key} className="flex items-baseline gap-2 text-xs">
                                  <span className="text-sp-ink-300 min-w-0 flex-1 truncate" title={c.label}>{c.label}</span>
                                  <span className="text-sp-ink-300/70">{c.from ?? '—'}</span>
                                  <ArrowRight size={11} className="text-sp-ink-300/50 flex-shrink-0" />
                                  <span className="text-white font-medium">{c.to ?? '—'}</span>
                                  {c.delta !== null && c.delta !== 0 && (
                                    <span className={`font-medium ${c.delta > 0 ? 'text-sp-green-400' : 'text-amber-400'}`}>
                                      ({c.delta > 0 ? '+' : ''}{Number(c.delta.toFixed(2))})
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      <div>
                        <p className="text-[11px] font-bold text-sp-ink-300 uppercase tracking-wider mb-2">
                          Recorded that day
                        </p>
                        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1">
                          {filled.map(f => (
                            <div key={f.key} className="flex items-baseline justify-between gap-2 text-xs">
                              <span className="text-sp-ink-300 truncate" title={f.label}>{f.label}</span>
                              <span className="text-sp-ink-50 text-right">{String(entry[f.key])}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
