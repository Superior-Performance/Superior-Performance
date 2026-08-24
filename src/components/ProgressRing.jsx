// Shared circular progress indicator — the Today tab's hero ring and the
// Progress tab's overall/consistency rings are the same shape at different
// sizes, so the stroke-dasharray math lives here once.
export default function ProgressRing({
  pct, size = 64, strokeWidth = 8,
  trackColor = 'rgba(255,255,255,.15)', progressColor = '#2E9E63', textColor = 'white',
  showLabel = true,
}) {
  const clamped = Math.min(100, Math.max(0, pct || 0))
  const r = (size - strokeWidth) / 2
  const c = 2 * Math.PI * r
  const dash = (clamped / 100) * c
  const center = size / 2

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="flex-shrink-0">
      <circle cx={center} cy={center} r={r} fill="none" stroke={trackColor} strokeWidth={strokeWidth} />
      <circle
        cx={center} cy={center} r={r} fill="none"
        stroke={progressColor} strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={`${dash} ${c - dash}`}
        strokeDashoffset={c / 4}
        transform={`rotate(-90 ${center} ${center})`}
        style={{ transition: 'stroke-dasharray .6s ease' }}
      />
      {showLabel && (
        <text x={center} y={center + size * 0.05} textAnchor="middle" fill={textColor} fontSize={size * 0.22} fontWeight="bold">
          {Math.round(clamped)}%
        </text>
      )}
    </svg>
  )
}
