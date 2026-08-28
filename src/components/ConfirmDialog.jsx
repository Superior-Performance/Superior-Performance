// Branded stand-in for window.confirm() — the native dialog is unstyled
// (an OS-chrome popup) and breaks the moment it appears next to everything
// else in the app. Since confirm() is synchronous and a React modal can't
// be, callers hold the pending action in state and pass it as onConfirm —
// see AdminAthleteDetail/ProgramEditorModal for the calling pattern.
export default function ConfirmDialog({ title, message, confirmLabel = 'Confirm', danger = false, onConfirm, onCancel }) {
  return (
    <div className="animate-modal-backdrop fixed inset-0 bg-black/60 z-[70] flex items-center justify-center p-4" onClick={onCancel}>
      <div className="animate-modal-panel bg-sp-ink-800 border border-sp-ink-600 rounded-2xl w-full max-w-sm p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-white mb-2">{title}</h2>
        <p className="text-sm text-sp-ink-300 mb-5">{message}</p>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 py-2.5 border border-sp-ink-600 text-sp-ink-100 rounded-xl text-sm font-medium hover:bg-white/5 transition">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition ${
              danger ? 'bg-red-500 text-white hover:bg-red-600' : 'btn-brand'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
