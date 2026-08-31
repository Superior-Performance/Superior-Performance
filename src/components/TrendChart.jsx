import { useRef, useState } from 'react'
import { format } from 'date-fns'

// A real time-series line chart for a single metric over time — dates on
// the x-axis, value gridlines on the y-axis, a hover crosshair + tooltip.
// No charting library in this project, so this is hand-rolled SVG like
// Sparkline/ProgressRing. Single series, so no legend — the section title
// above it already names what's being tracked.
export default function TrendChart({ points, unit, stroke = '#2E9E63', height = 160, goal = null }) {
  const [hoverIdx, setHoverIdx] = useState(null)
  const svgRef = useRef(null)
  const width = 320 // viewBox units; scales to the container via width="100%"

  if (!points || points.length < 2) {
    return (
      <div className="flex items-center justify-center text-xs text-sp-ink-300 text-center px-6" style={{ height }}>
        Log at least 2 entries to see a trend.
      </div>
    )
  }

  const padding = { top: 14, right: 10, bottom: 20, left: 10 }
  const plotW = width - padding.left - padding.right
  const plotH = height - padding.top - padding.bottom

  const hasGoal = typeof goal === 'number' && !Number.isNaN(goal)
  const values = hasGoal ? [...points.map(p => p.value), goal] : points.map(p => p.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = (max - min) || Math.max(Math.abs(max), 1) * 0.1 || 1
  const yPad = range * 0.2
  const scaleMin = min - yPad
  const scaleRange = range + yPad * 2

  const x = (i) => padding.left + (points.length === 1 ? plotW / 2 : (i / (points.length - 1)) * plotW)
  const y = (v) => padding.top + plotH - ((v - scaleMin) / scaleRange) * plotH

  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ')

  const labelIdxs = points.length <= 3
    ? points.map((_, i) => i)
    : [0, Math.floor((points.length - 1) / 2), points.length - 1]

  function handlePointer(clientX) {
    if (!svgRef.current) return
    const rect = svgRef.current.getBoundingClientRect()
    const relX = ((clientX - rect.left) / rect.width) * width
    let closest = 0, closestDist = Infinity
    points.forEach((p, i) => {
      const dist = Math.abs(x(i) - relX)
      if (dist < closestDist) { closestDist = dist; closest = i }
    })
    setHoverIdx(closest)
  }

  const hp = hoverIdx != null ? points[hoverIdx] : null
  const gridValues = [max, (min + max) / 2, min]

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
        onMouseMove={(e) => handlePointer(e.clientX)}
        onMouseLeave={() => setHoverIdx(null)}
        onTouchStart={(e) => handlePointer(e.touches[0].clientX)}
        onTouchMove={(e) => handlePointer(e.touches[0].clientX)}
        onTouchEnd={() => setHoverIdx(null)}
        className="overflow-visible touch-none"
      >
        {gridValues.map((v, i) => (
          <g key={i}>
            <line x1={padding.left} x2={width - padding.right} y1={y(v)} y2={y(v)} stroke="#2A3036" strokeWidth="1" />
            <text x={padding.left} y={y(v) - 3} fontSize="8" fill="#9AA4AC">{Math.round(v * 10) / 10}</text>
          </g>
        ))}

        {hasGoal && (
          <g>
            <line
              x1={padding.left} x2={width - padding.right} y1={y(goal)} y2={y(goal)}
              stroke="#E0A82E" strokeWidth="1.25" strokeDasharray="4,3"
            />
            <text x={width - padding.right} y={y(goal) - 3} fontSize="8" fill="#E0A82E" textAnchor="end">
              Goal · {Math.round(goal * 10) / 10}
            </text>
          </g>
        )}

        <path d={path} fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

        <circle cx={x(points.length - 1)} cy={y(points[points.length - 1].value)} r="3" fill={stroke} />

        {hp && (
          <>
            <line
              x1={x(hoverIdx)} x2={x(hoverIdx)}
              y1={padding.top} y2={height - padding.bottom}
              stroke={stroke} strokeWidth="1" strokeDasharray="2,2" opacity="0.5"
            />
            <circle cx={x(hoverIdx)} cy={y(hp.value)} r="4" fill={stroke} stroke="#0E1113" strokeWidth="1.5" />
          </>
        )}

        {labelIdxs.map(i => (
          <text
            key={i} x={x(i)} y={height - 5} fontSize="8" fill="#9AA4AC"
            textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}
          >
            {format(new Date(points[i].date), 'M/d')}
          </text>
        ))}
      </svg>

      {hp && (
        <div
          className="absolute top-0 z-10 bg-sp-ink-900 border border-sp-ink-600 rounded-lg px-2.5 py-1.5 text-xs pointer-events-none shadow-lg whitespace-nowrap"
          style={{
            left: `${Math.min(Math.max((x(hoverIdx) / width) * 100, 12), 88)}%`,
            transform: 'translateX(-50%)',
          }}
        >
          <p className="font-semibold text-white">{hp.value} {unit}</p>
          <p className="text-sp-ink-300">{format(new Date(hp.date), 'MMM d, yyyy')}</p>
        </div>
      )}
    </div>
  )
}
