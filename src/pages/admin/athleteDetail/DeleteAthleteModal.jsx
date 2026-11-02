import { X } from 'lucide-react'

/**
 * Delete-athlete confirmation, which becomes a results summary once
 * `deleteResult` is set rather than closing straight to a toast that could
 * overstate what actually happened.
 *
 * The two manual steps it lists are the two things deleteAthleteCompletely
 * genuinely cannot reach — the Firebase Auth login (needs the Admin SDK, so a
 * Cloud Function, which this project has no Blaze plan for) and rows already
 * pushed to the coach's Google Sheets. See firestore.js for the full
 * reasoning; the modal's job is to say so out loud instead of implying they
 * were handled.
 */
export default function DeleteAthleteModal({ athlete, deleteResult, saving, onDelete, onClose, onDone }) {
  return (
      <div className="animate-modal-backdrop fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
        <div className="animate-modal-panel bg-sp-ink-800 border border-sp-ink-600 rounded-2xl w-full max-w-sm p-6 shadow-xl">
          {!deleteResult ? (
            <>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-white">Delete Athlete?</h2>
                <button onClick={onClose} className="p-1 hover:bg-white/10 text-sp-ink-300 rounded-lg"><X size={18} /></button>
              </div>
              <p className="text-sm text-sp-ink-300 mb-5">
                This will permanently remove <span className="font-semibold text-white">{athlete.name}</span>'s profile, assessment, chat history, workout completions, logged velo/weight, programs, and facility bookings. This cannot be undone.
              </p>
              <p className="text-xs text-sp-ink-400 mb-5">
                Two things this won't touch: their login (Firebase Auth account) and any rows already pushed to your Google Sheets — you'll get a checklist for those after.
              </p>
              <div className="flex gap-3">
                <button onClick={onClose} className="flex-1 py-2.5 border border-sp-ink-600 text-sp-ink-100 rounded-xl text-sm font-medium hover:bg-white/5 transition">Cancel</button>
                <button onClick={onDelete} disabled={saving} className="flex-1 py-2.5 bg-red-500 text-white rounded-xl text-sm font-semibold hover:bg-red-600 disabled:opacity-60 transition">
                  {saving ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </>
          ) : (
            <>
              <h2 className="text-lg font-bold text-white mb-4">{athlete.name}'s data removed</h2>
              <ul className="text-sm text-sp-ink-300 space-y-1.5 mb-5">
                <li>✓ Profile, assessment, chat history, completions, logs, and {deleteResult.programs} program{deleteResult.programs === 1 ? '' : 's'} deleted</li>
                {deleteResult.facilityBookings > 0 && <li>✓ {deleteResult.facilityBookings} facility booking{deleteResult.facilityBookings === 1 ? '' : 's'} cancelled and released</li>}
                {deleteResult.storagePhoto && <li>✓ Profile photo removed</li>}
                {deleteResult.errors.length > 0 && (
                  <li className="text-amber-400">⚠ Some data couldn't be removed automatically — see below.</li>
                )}
              </ul>
              {deleteResult.errors.length > 0 && (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 mb-4 text-xs text-amber-300 space-y-1">
                  {deleteResult.errors.map((e, i) => <p key={i}>{e}</p>)}
                </div>
              )}
              <div className="bg-white/5 rounded-xl p-3 mb-5 text-xs text-sp-ink-300 space-y-2">
                <p className="font-semibold text-sp-ink-100">Two manual steps remain:</p>
                <p>
                  1. Remove their login in{' '}
                  <a href="https://console.firebase.google.com/project/superior-performance-ba102/authentication/users" target="_blank" rel="noreferrer" className="text-sp-green-400 underline">
                    Firebase Console → Authentication
                  </a>
                  {athlete.email && <> — search for <span className="font-mono text-sp-ink-100">{athlete.email}</span></>}.
                </p>
                <p>2. Remove any matching rows from your Assessment Intake / Outputs sheets by athlete name, if you push data there.</p>
              </div>
              <button
                onClick={onDone}
                className="w-full py-2.5 bg-sp-green-500 text-white rounded-xl text-sm font-semibold hover:bg-sp-green-600 transition"
              >
                Done
              </button>
            </>
          )}
        </div>
      </div>
  )
}
