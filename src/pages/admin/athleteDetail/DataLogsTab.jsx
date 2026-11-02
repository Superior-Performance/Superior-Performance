import { Zap, Scale, X, Download, Plus, Flag, Target } from 'lucide-react'
import { format } from 'date-fns'

/**
 * The Data Logs tab: the coach's view of this athlete's body weight and velo
 * history, the goals those charts are measured against, and the season
 * report export.
 *
 * Presentational — every write is in athleteDetail/useAthleteDataLogs, whose
 * return value arrives here as `dataLogs`.
 */
export default function DataLogsTab({ logs, dataLogs }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-sp-ink-300 uppercase tracking-wider">Body Weight & Velo</p>
        <div className="flex gap-2">
          <button
            onClick={dataLogs.exportSeasonReport}
            disabled={dataLogs.exportingReport}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-sp-ink-800 border border-sp-ink-600 text-sp-ink-100 hover:bg-white/5 transition disabled:opacity-60"
          >
            <Download size={13} /> Export Report
          </button>
          <button
            onClick={() => dataLogs.openAddLog('weight')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-sp-ink-800 border border-sp-ink-600 text-sp-ink-100 hover:bg-white/5 transition"
          >
            <Plus size={13} /> Body Weight
          </button>
          <button
            onClick={() => dataLogs.openAddLog('velo')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-sp-ink-800 border border-sp-ink-600 text-sp-ink-100 hover:bg-white/5 transition"
          >
            <Plus size={13} /> Velo
          </button>
        </div>
      </div>

      {/* Goals — a coach-set target shown as a reference line on the
          athlete's own trend charts (TrendChart's `goal` prop). Admin-only
          on purpose: athletes can only self-write photoURL on their user
          doc, see firestore.rules. */}
      <div className="bg-sp-ink-800 rounded-2xl border border-sp-ink-600 p-4">
        <div className="flex items-center gap-1.5 mb-3">
          <Target size={13} className="text-amber-400" />
          <p className="text-xs font-semibold text-sp-ink-300 uppercase tracking-wider">Goals</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-sp-ink-300 mb-1">Velo (mph)</label>
            <input
              type="number"
              step="0.1"
              value={dataLogs.goalVelo}
              onChange={e => dataLogs.setGoalVelo(e.target.value)}
              placeholder="e.g. 90"
              className="w-28 px-3 py-2 border border-sp-ink-600 rounded-lg text-sm text-sp-ink-50 placeholder-sp-ink-300 bg-sp-ink-900 focus:outline-none focus:ring-2 focus:ring-sp-green-500"
            />
          </div>
          <div>
            <label className="block text-xs text-sp-ink-300 mb-1">Body Weight (lbs)</label>
            <input
              type="number"
              step="0.1"
              value={dataLogs.goalWeight}
              onChange={e => dataLogs.setGoalWeight(e.target.value)}
              placeholder="e.g. 190"
              className="w-28 px-3 py-2 border border-sp-ink-600 rounded-lg text-sm text-sp-ink-50 placeholder-sp-ink-300 bg-sp-ink-900 focus:outline-none focus:ring-2 focus:ring-sp-green-500"
            />
          </div>
          <button
            onClick={dataLogs.saveGoals}
            disabled={dataLogs.savingGoals}
            className="px-4 py-2 bg-sp-green-500 hover:bg-sp-green-600 text-white rounded-lg text-sm font-semibold transition disabled:opacity-60"
          >
            {dataLogs.savingGoals ? 'Saving…' : 'Save Goals'}
          </button>
        </div>
      </div>
      <div className="bg-sp-ink-800 rounded-2xl border border-sp-ink-600 overflow-hidden">
      <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-white/[0.03] border-b border-sp-ink-600">
            <th className="text-left px-5 py-3 text-xs font-semibold text-sp-ink-300 uppercase tracking-wider">Type</th>
            <th className="text-left px-5 py-3 text-xs font-semibold text-sp-ink-300 uppercase tracking-wider">Value</th>
            <th className="text-left px-5 py-3 text-xs font-semibold text-sp-ink-300 uppercase tracking-wider">Notes</th>
            <th className="text-left px-5 py-3 text-xs font-semibold text-sp-ink-300 uppercase tracking-wider">Date</th>
            <th className="text-left px-5 py-3 text-xs font-semibold text-sp-ink-300 uppercase tracking-wider">Flag</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-sp-ink-600/60">
          {logs.map(log => (
            <tr key={log.id} className={`hover:bg-white/[0.04] ${log.flagged ? 'bg-amber-500/5' : ''}`}>
              <td className="px-5 py-3">
                <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${
                  log.type === 'velo' ? 'bg-amber-500/15 text-amber-300' : 'bg-sky-500/15 text-sky-300'
                }`}>
                  {log.type === 'velo' ? <Zap size={11} /> : <Scale size={11} />}
                  {log.type === 'velo' ? 'Velo' : 'Body Weight'}
                </span>
              </td>
              <td className="px-5 py-3 font-medium text-white">{log.value} {log.type === 'velo' ? 'mph' : 'lbs'}</td>
              <td className="px-5 py-3 text-sp-ink-300 max-w-xs truncate" title={log.notes || ''}>{log.notes || '—'}</td>
              <td className="px-5 py-3 text-sp-ink-300">{log.date ? format(new Date(log.date), 'MMM d, yyyy') : '—'}</td>
              <td className="px-5 py-3">
                <button
                  onClick={() => dataLogs.toggleLogFlag(log.id, !log.flagged)}
                  className={`p-1.5 rounded-lg transition ${log.flagged ? 'text-amber-400' : 'text-sp-ink-300/40 hover:text-sp-ink-300'}`}
                  aria-label={log.flagged ? 'Unflag entry' : 'Flag for follow-up'}
                  title={log.flagged ? 'Unflag' : 'Flag for follow-up'}
                >
                  <Flag size={15} fill={log.flagged ? 'currentColor' : 'none'} />
                </button>
              </td>
            </tr>
          ))}
          {logs.length === 0 && (
            <tr><td colSpan={5} className="px-5 py-8 text-center text-sp-ink-300">No data logged yet.</td></tr>
          )}
        </tbody>
      </table>
      </div>
      </div>
    </div>
  )
}

/**
 * Add a body weight / velo entry. Rendered by the page rather than by the tab
 * above, so it sits with the page's other modals.
 */
export function AddLogModal({ dataLogs }) {
  return (
    <div className="animate-modal-backdrop fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="animate-modal-panel bg-sp-ink-800 border border-sp-ink-600 rounded-2xl w-full max-w-sm p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white">Add Log Entry</h2>
          <button onClick={() => dataLogs.setShowAddLog(false)} className="p-1 hover:bg-white/10 text-sp-ink-300 rounded-lg"><X size={18} /></button>
        </div>
        <form onSubmit={dataLogs.handleAddLog} className="space-y-4">
          <div className="flex gap-2">
            {[{ key: 'velo', label: 'Velo', Icon: Zap }, { key: 'weight', label: 'Body Weight', Icon: Scale }].map(t => (
              <button
                key={t.key}
                type="button"
                onClick={() => dataLogs.setLogType(t.key)}
                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition ${
                  dataLogs.logType === t.key ? 'bg-sp-green-500 text-white' : 'bg-white/5 text-sp-ink-300'
                }`}
              >
                <t.Icon size={15} />
                {t.label}
              </button>
            ))}
          </div>

          <div>
            <label className="text-xs font-medium text-sp-ink-300 mb-1 block">
              {dataLogs.logType === 'velo' ? 'Velo (mph)' : 'Body Weight (lbs)'}
            </label>
            <input
              type="number"
              step="0.1"
              required
              value={dataLogs.logValue}
              onChange={(e) => dataLogs.setLogValue(e.target.value)}
              placeholder={dataLogs.logType === 'velo' ? 'e.g. 87.5' : 'e.g. 185'}
              className="w-full px-4 py-2.5 bg-sp-ink-900 border border-sp-ink-600 text-white placeholder-sp-ink-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sp-green-500"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-sp-ink-300 mb-1 block">Date</label>
            <input
              type="date"
              required
              value={dataLogs.logDate}
              onChange={(e) => dataLogs.setLogDate(e.target.value)}
              style={{ colorScheme: 'dark' }}
              className="w-full px-4 py-2.5 bg-sp-ink-900 border border-sp-ink-600 text-white rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sp-green-500"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-sp-ink-300 mb-1 block">Notes (optional) — visible to the athlete too</label>
            <input
              type="text"
              value={dataLogs.logNotes}
              onChange={(e) => dataLogs.setLogNotes(e.target.value)}
              placeholder="Context for this entry"
              className="w-full px-4 py-2.5 bg-sp-ink-900 border border-sp-ink-600 text-white placeholder-sp-ink-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sp-green-500"
            />
          </div>

          <button
            type="submit"
            disabled={dataLogs.logSaving}
            className="btn-brand w-full py-3 rounded-xl flex items-center justify-center gap-2"
          >
            {dataLogs.logSaving && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
            {dataLogs.logSaving ? 'Saving…' : 'Save Entry'}
          </button>
        </form>
      </div>
    </div>
  )
}
