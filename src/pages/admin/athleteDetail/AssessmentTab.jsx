import { Save, Sparkles, FileSpreadsheet, Download, ChevronDown } from 'lucide-react'
import AssessmentHistory from '../../../components/AssessmentHistory'
import PriorityRanking from '../../../components/PriorityRanking'
import {
  FIELD_GROUPS, ALL_FIELDS, RETIRED_FIELDS,
} from '../../../constants/assessmentFields'

/**
 * The Assessment tab: the intake form, the priority ranking, and the history
 * of past assessments, with the sheet actions (Save, Log to Intake Sheet,
 * Generate Program) in its header.
 *
 * The form mirrors the "Assessment Intake" Google Sheet column-for-column
 * (minus Athlete Name, which the app already tracks) so the saved doc can be
 * handed straight to that sheet — see constants/assessmentFields for the
 * field list and utils/sheetPrograms for the transfer itself.
 *
 * Presentational: every bit of state it reads belongs to the page, so
 * switching tabs away and back can't reset a form or lose a pull in flight.
 */
export default function AssessmentTab({
  assessment, setAssessment, saving, onSave, history, historyLoading, sheetPulls,
}) {
  const {
    sendingToSheet, sendToIntakeSheet, showGenerateMenu, setShowGenerateMenu, anyPulling,
    pullOutputsFromSheet, pullThrowingOutputsFromSheet, pullLiftingOutputsFromSheet,
    pullMobilityOutputsFromSheet, pullAllOutputsFromSheet,
  } = sheetPulls

  return (
    <>
      <div className="bg-sp-ink-800 rounded-2xl border border-sp-ink-600 p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="font-semibold text-white">Assessment Intake</h2>
            <p className="text-xs text-sp-ink-300 mt-0.5">Matches the Assessment Intake Google Sheet field-for-field.</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <button
              onClick={onSave}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 border border-sp-ink-600 text-sp-ink-100 text-sm font-semibold rounded-xl hover:bg-white/5 disabled:opacity-60 transition"
            >
              <Save size={14} />
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={sendToIntakeSheet}
              disabled={sendingToSheet}
              className="flex items-center gap-2 px-4 py-2 border border-sp-ink-600 text-sp-ink-100 text-sm font-semibold rounded-xl hover:bg-white/5 disabled:opacity-60 transition"
            >
              <FileSpreadsheet size={14} />
              {sendingToSheet ? 'Logging…' : 'Log to Intake Sheet'}
            </button>
            <div className="relative">
              <button
                onClick={() => setShowGenerateMenu(v => !v)}
                disabled={anyPulling}
                className="btn-brand flex items-center gap-2 px-4 py-2 text-sm rounded-xl disabled:opacity-60"
              >
                <Sparkles size={14} />
                {anyPulling ? 'Working…' : 'Generate Program'}
                <ChevronDown size={14} className={showGenerateMenu ? 'rotate-180 transition-transform' : 'transition-transform'} />
              </button>

              {showGenerateMenu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowGenerateMenu(false)} />
                  <div className="absolute right-0 mt-2 w-96 bg-sp-ink-800 rounded-xl border border-sp-ink-600 shadow-lg z-20 overflow-hidden">
                    <button
                      onClick={() => { setShowGenerateMenu(false); pullOutputsFromSheet() }}
                      className="w-full text-left px-4 py-3 hover:bg-white/5 transition flex items-start gap-3"
                    >
                      <Download size={15} className="text-sp-ink-300 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-white">Pull from Pre-Throw Outputs</p>
                        <p className="text-xs text-sp-ink-300 mt-0.5">Mobilization, Correctives and Movement Activation merged into one program, by category.</p>
                      </div>
                    </button>
                    <button
                      onClick={() => { setShowGenerateMenu(false); pullThrowingOutputsFromSheet() }}
                      className="w-full text-left px-4 py-3 hover:bg-white/5 transition flex items-start gap-3 border-t border-sp-ink-600/60"
                    >
                      <Download size={15} className="text-sp-ink-300 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-white">Pull from Throwing/Post-Throw Outputs</p>
                        <p className="text-xs text-sp-ink-300 mt-0.5">Catch Play/Post-Throw plus the plyo routines, merged into one throwing program, by category.</p>
                      </div>
                    </button>
                    <button
                      onClick={() => { setShowGenerateMenu(false); pullLiftingOutputsFromSheet() }}
                      className="w-full text-left px-4 py-3 hover:bg-white/5 transition flex items-start gap-3 border-t border-sp-ink-600/60"
                    >
                      <Download size={15} className="text-sp-ink-300 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-white">Pull from Lifting Outputs</p>
                        <p className="text-xs text-sp-ink-300 mt-0.5">Reads the Lifting Outputs tab (with video URLs) as their lifting program.</p>
                      </div>
                    </button>
                    <button
                      onClick={() => { setShowGenerateMenu(false); pullMobilityOutputsFromSheet() }}
                      className="w-full text-left px-4 py-3 hover:bg-white/5 transition flex items-start gap-3 border-t border-sp-ink-600/60"
                    >
                      <Download size={15} className="text-sp-ink-300 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-white">Pull from Mobility Outputs</p>
                        <p className="text-xs text-sp-ink-300 mt-0.5">Reads the Mobility Outputs tab as their mobility program.</p>
                      </div>
                    </button>
                    <button
                      onClick={() => { setShowGenerateMenu(false); pullAllOutputsFromSheet() }}
                      className="w-full text-left px-4 py-3 hover:bg-sp-green-500/10 transition flex items-start gap-3 border-t border-sp-ink-600"
                    >
                      <Sparkles size={15} className="text-sp-green-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-white">Pull All (combined)</p>
                        <p className="text-xs text-sp-ink-300 mt-0.5">Runs all four pulls above in one click — each still lands as its own program, since an athlete keeps one active program per type.</p>
                      </div>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {FIELD_GROUPS.map(({ title, fields }) => (
            <div key={title} className="bg-sp-ink-900/40 border border-sp-ink-600/50 rounded-xl p-4">
              <h3 className="font-semibold text-sp-ink-100 mb-3 text-sm">{title}</h3>
              <div className="grid grid-cols-2 gap-4">
                {fields.map((field) => (
                  <AssessmentField
                    key={field.key}
                    field={field}
                    value={assessment[field.key] || ''}
                    onChange={(v) => setAssessment(p => ({ ...p, [field.key]: v }))}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <PriorityRanking
        assessment={assessment}
        ranking={Array.isArray(assessment.priorityRanking) ? assessment.priorityRanking : []}
        note={assessment.priorityNote || ''}
        onChange={({ ranking, note }) =>
          setAssessment(p => ({ ...p, priorityRanking: ranking, priorityNote: note }))}
      />

      {/* Assessment history — same tab, directly under the form it records */}
      <AssessmentHistory
        entries={history}
        fields={[...ALL_FIELDS, ...RETIRED_FIELDS]}
        loading={historyLoading}
      />
    </>
  )
}

function AssessmentField({ field, value, onChange }) {
  const { label, type, options, wide } = field
  const wrapClass = wide ? 'col-span-2' : ''

  if (type === 'select') {
    return (
      <div className={wrapClass}>
        <label className="block text-xs font-medium text-sp-ink-300 mb-1">{label}</label>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-3.5 py-2.5 border border-sp-ink-600 rounded-xl text-sm text-sp-ink-50 focus:outline-none focus:ring-2 focus:ring-sp-green-500 bg-sp-ink-900"
        >
          <option value="" className="bg-sp-ink-900 text-sp-ink-50">— Select —</option>
          {options.map(opt => (
            <option key={opt} value={opt} className="bg-sp-ink-900 text-sp-ink-50">{opt}</option>
          ))}
        </select>
      </div>
    )
  }

  return (
    <div className={wrapClass}>
      <label className="block text-xs font-medium text-sp-ink-300 mb-1">{label}</label>
      <input
        type={type === 'number' ? 'number' : type === 'date' ? 'date' : 'text'}
        step={type === 'number' ? '0.1' : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3.5 py-2.5 border border-sp-ink-600 rounded-xl text-sm text-sp-ink-50 placeholder-sp-ink-300 bg-sp-ink-900 focus:outline-none focus:ring-2 focus:ring-sp-green-500"
        placeholder={type === 'text' ? '' : '—'}
      />
    </div>
  )
}
