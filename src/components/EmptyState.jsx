// Shared empty-state treatment — a soft gradient icon badge instead of a bare
// gray icon, used anywhere a list/page has nothing to show yet.
export default function EmptyState({ icon: Icon, title, subtitle, compact = false }) {
  return (
    <div className={`flex flex-col items-center justify-center text-center px-6 ${compact ? 'py-10' : 'min-h-[60vh]'}`}>
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
        style={{ background: 'linear-gradient(135deg, rgba(46,158,99,0.12), rgba(46,158,99,0.05))' }}
      >
        <Icon size={26} className="text-sp-green-500" strokeWidth={1.75} />
      </div>
      <h2 className="text-base font-semibold text-gray-800">{title}</h2>
      {subtitle && <p className="text-gray-400 text-sm mt-1 max-w-xs">{subtitle}</p>}
    </div>
  )
}
