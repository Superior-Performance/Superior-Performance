import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Pencil, Trash2, XCircle, Search, X } from 'lucide-react'
import { format } from 'date-fns'
import { PROGRAM_TYPES } from '../../../constants/programTypes'

/**
 * The Program tab: one program type at a time via a sub-tab, plus an
 * on-demand search modal for assigning instead of an always-open list, so
 * this stays readable no matter how much history an athlete (or the
 * assignable library) accumulates over a season.
 *
 * Which type is showing (programTypeTab) belongs to the page, so flipping to
 * Assessment and back doesn't drop the coach back on Pre-Throwing. Every
 * write lives in useAthleteProgramActions.
 */
export default function ProgramTab({
  athleteId, programs, activePrograms, programTypeTab, setProgramTypeTab, saving,
  onEditLiveProgram, onRemoveProgram, onAssignProgram, onReviewDraft, onDiscardDraft,
}) {
  const [showAssignModal, setShowAssignModal] = useState(false)

  const currentTypeLabel = PROGRAM_TYPES.find(t => t.key === programTypeTab)?.label || programTypeTab
  const currentTypeProgram = activePrograms[programTypeTab]
  const draftsForType = programs.filter(p =>
    p.athleteId === athleteId && p.active === false && !p.archived && (p.programType || 'correctives') === programTypeTab
  )
  // Only unassigned templates or this athlete's own (non-draft) programs
  // belong here — a program already active for a DIFFERENT athlete must
  // never show up as assignable, or "Assign" would silently steal it.
  const assignableForType = programs.filter(p =>
    (p.programType || 'correctives') === programTypeTab &&
    p.id !== currentTypeProgram?.id &&
    (!p.athleteId || p.athleteId === athleteId) &&
    // Archived programs are excluded explicitly rather than by coincidence.
    // The clause below happens to hide most of them today, because every
    // in-app write that archives also sets active: false AND athleteId: uid
    // — but an archived template (athleteId: null) or an archived program
    // left active satisfies neither half and would land in this picker.
    !p.archived &&
    !(p.active === false && p.athleteId === athleteId)
  )

  return (
    <div className="space-y-4">
      {/* Type sub-tabs — a green dot marks types with an active program */}
      <div className="flex gap-1 bg-sp-ink-800 border border-sp-ink-600 rounded-xl p-1 w-fit">
        {PROGRAM_TYPES.map(({ key: k, label: l }) => (
          <button
            key={k}
            onClick={() => setProgramTypeTab(k)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition ${
              programTypeTab === k ? 'bg-sp-ink-600 text-white' : 'text-sp-ink-300 hover:text-white'
            }`}
          >
            {l}
            {activePrograms[k] && <span className="w-1.5 h-1.5 rounded-full bg-sp-green-500 flex-shrink-0" />}
          </button>
        ))}
      </div>

      {/* Current program — one compact row */}
      <div className="bg-sp-ink-800 rounded-2xl border border-sp-ink-600 px-5 py-4">
        {currentTypeProgram ? (
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 bg-sp-green-500/15 text-sp-green-300 text-[10px] font-semibold uppercase tracking-wide rounded-full flex-shrink-0">Active</span>
                <p className="font-medium text-white truncate">{currentTypeProgram.name}</p>
              </div>
              <p className="text-xs text-sp-ink-300 mt-0.5">
                {currentTypeProgram.weeks?.length || 0} weeks
                {currentTypeProgram.lastEditedAt && (
                  <> · edited {format(currentTypeProgram.lastEditedAt.toDate?.() ?? currentTypeProgram.lastEditedAt, 'MMM d')}</>
                )}
              </p>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                onClick={() => onEditLiveProgram(currentTypeProgram)}
                disabled={saving}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-sp-ink-600 text-sp-ink-100 text-xs font-medium rounded-lg hover:bg-white/5 disabled:opacity-60 transition"
              >
                <Pencil size={13} /> Edit
              </button>
              <button
                onClick={() => onRemoveProgram(programTypeTab)}
                disabled={saving}
                className="p-1.5 text-sp-ink-300/60 hover:text-red-400 transition"
                title="Remove"
                aria-label="Remove program"
              >
                <XCircle size={16} />
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <p className="text-sp-ink-300 text-sm">No {currentTypeLabel.toLowerCase()} program assigned.</p>
            <button
              onClick={() => setShowAssignModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-sp-green-500/15 text-sp-green-300 text-xs font-semibold rounded-lg hover:bg-sp-green-500/25 transition flex-shrink-0"
            >
              <Search size={13} /> Assign Program
            </button>
          </div>
        )}
      </div>

      {/* Drafts awaiting review — collapses away entirely once empty, and
          a published draft is archived so it never comes back here */}
      {draftsForType.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/25 rounded-2xl px-5 py-4">
          <h3 className="font-semibold text-amber-300 mb-2.5 text-xs uppercase tracking-wide">Drafts Awaiting Review</h3>
          <div className="space-y-2">
            {draftsForType.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3">
                <p className="text-sm text-sp-ink-100 truncate">{p.name}</p>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => onReviewDraft(p)}
                    className="text-xs px-3 py-1.5 bg-amber-500/20 text-amber-300 font-medium rounded-lg hover:bg-amber-500/30 transition"
                  >
                    Review
                  </button>
                  <button
                    onClick={() => onDiscardDraft(p)}
                    disabled={saving}
                    className="p-1.5 text-amber-400/50 hover:text-red-400 transition"
                    title="Discard draft"
                    aria-label="Discard draft"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Swapping in a different program is always one click away, even
          with one already active — no need to Remove first */}
      {currentTypeProgram && (
        <button
          onClick={() => setShowAssignModal(true)}
          className="flex items-center gap-1.5 text-sm text-sp-ink-300 hover:text-sp-green-400 transition"
        >
          <Search size={14} /> Assign a different {currentTypeLabel.toLowerCase()} program
        </button>
      )}

      {showAssignModal && (
        <AssignProgramModal
          typeLabel={currentTypeLabel}
          programs={assignableForType}
          saving={saving}
          onAssign={(id) => { setShowAssignModal(false); onAssignProgram(id) }}
          onClose={() => setShowAssignModal(false)}
        />
      )}
    </div>
  )
}

// Search-and-assign picker, opened from the Program tab instead of an
// always-visible list — keeps the athlete page compact as the assignable
// library (general templates + this athlete's own past programs) grows.
function AssignProgramModal({ typeLabel, programs, saving, onAssign, onClose }) {
  const [search, setSearch] = useState('')
  const filtered = programs.filter(p => p.name?.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="animate-modal-backdrop fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="animate-modal-panel bg-sp-ink-800 border border-sp-ink-600 rounded-2xl w-full max-w-md shadow-xl max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-sp-ink-600 flex-shrink-0">
          <h2 className="text-lg font-bold text-white">Assign {typeLabel} Program</h2>
          <button onClick={onClose} className="p-1 hover:bg-white/10 text-sp-ink-300 rounded-lg transition"><X size={18} /></button>
        </div>
        <div className="px-5 py-3 border-b border-sp-ink-600 flex-shrink-0">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-sp-ink-300" />
            <input
              autoFocus
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search programs…"
              className="w-full pl-9 pr-3 py-2 border border-sp-ink-600 rounded-xl text-sm text-sp-ink-50 placeholder-sp-ink-300 bg-sp-ink-900 focus:outline-none focus:ring-2 focus:ring-sp-green-500"
            />
          </div>
        </div>
        <div className="overflow-y-auto flex-1 px-5 py-3">
          {filtered.length === 0 ? (
            <p className="text-sp-ink-300 text-sm py-6 text-center">
              {programs.length === 0
                ? <>No {typeLabel.toLowerCase()} programs yet. Create one in <Link to="/admin/programs" className="text-sp-green-400 underline">Programs</Link>.</>
                : 'No matches.'}
            </p>
          ) : (
            <div className="space-y-1">
              {filtered.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-3 py-2 border-b border-sp-ink-600/60 last:border-0">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white truncate">{p.name}</p>
                    <p className="text-xs text-sp-ink-300">
                      {p.weeks?.length || 0} weeks{!p.athleteId && ' · General'}
                    </p>
                  </div>
                  <button
                    onClick={() => onAssign(p.id)}
                    disabled={saving}
                    className="flex-shrink-0 text-xs px-3 py-1.5 bg-sp-green-500/15 text-sp-green-300 font-medium rounded-lg hover:bg-sp-green-500/25 disabled:opacity-60 transition"
                  >
                    Assign
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
