import { X } from 'lucide-react'

/**
 * Name and display-email for one athlete.
 *
 * Deliberately only those two fields: tier, training days and groups are set
 * in place on the profile page instead (see AthleteProfileCards), because a
 * coach changes those far more often than a name. The email here is the
 * display copy on users/{uid} — their actual login email lives in Firebase
 * Auth and this cannot touch it, which is why the field says so.
 */
export default function EditAthleteModal({ editName, setEditName, editEmail, setEditEmail, saving, onSubmit, onClose }) {
  return (
      <div className="animate-modal-backdrop fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
        <div className="animate-modal-panel bg-sp-ink-800 border border-sp-ink-600 rounded-2xl w-full max-w-md p-6 shadow-xl">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-bold text-white">Edit Athlete</h2>
            <button onClick={onClose} className="p-1 hover:bg-white/10 text-sp-ink-300 rounded-lg"><X size={18} /></button>
          </div>
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-sp-ink-100 mb-1">Full Name</label>
              <input
                required
                value={editName}
                onChange={e => setEditName(e.target.value)}
                className="w-full px-3.5 py-2.5 border border-sp-ink-600 rounded-xl text-sm text-sp-ink-50 bg-sp-ink-900 focus:outline-none focus:ring-2 focus:ring-sp-green-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-sp-ink-100 mb-1">Email (display only)</label>
              <input
                type="email"
                value={editEmail}
                onChange={e => setEditEmail(e.target.value)}
                className="w-full px-3.5 py-2.5 border border-sp-ink-600 rounded-xl text-sm text-sp-ink-50 bg-sp-ink-900 focus:outline-none focus:ring-2 focus:ring-sp-green-500"
              />
              <p className="text-xs text-sp-ink-300 mt-1">Note: this updates the display name only, not their login email.</p>
            </div>
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-sp-ink-600 text-sp-ink-100 rounded-xl text-sm font-medium hover:bg-white/5 transition">Cancel</button>
              <button type="submit" disabled={saving} className="btn-brand flex-1 py-2.5 rounded-xl text-sm">
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      </div>
  )
}
