import { forwardRef } from 'react'
import { WORDMARK_PATH, SUBLINE_PATH } from './logoPaths'

/**
 * Superior Performance logo.
 *
 * The mark is four ascending bars (an athlete's progress) under a pitch arc
 * ending in the ball. The type is outlined, so no webfont is needed to render it.
 *
 *   <Logo className="h-9 w-auto" />                  full lockup on dark
 *   <Logo tone="light" className="h-9 w-auto" />     full lockup on light
 *   <Logo variant="icon" className="h-8 w-8" />      icon only
 *   <Logo tone="mono" className="h-6 text-white" />  one colour, inherits currentColor
 *
 * Size it with className (h-* / w-*). Below ~180px wide the "PERFORMANCE"
 * subline stops reading - use variant="icon" instead.
 */

const TONES = {
  dark:  { bar: '#2E9E63', arc: '#FFFFFF', main: '#FFFFFF', sub: '#2E9E63' },
  light: { bar: '#2E9E63', arc: '#0E1113', main: '#0E1113', sub: '#2E9E63' },
  mono:  { bar: 'currentColor', arc: 'currentColor', main: 'currentColor', sub: 'currentColor' },
}

// x, y, width, height, opacity - the four ascending bars, lightest to darkest.
const BARS = [
  [2, 70, 17, 26, 0.38],
  [25, 58, 17, 38, 0.58],
  [48, 44, 17, 52, 0.79],
  [71, 28, 17, 68, 1],
]

const Logo = forwardRef(function Logo(
  { variant = 'full', tone = 'dark', title = 'Superior Performance', className = '', ...rest },
  ref
) {
  const { bar, arc, main, sub } = TONES[tone] ?? TONES.dark
  const mono = tone === 'mono'

  // Flat single colour for mono, so it survives screen print and embroidery.
  const mark = (
    <>
      {BARS.map(([x, y, w, h, o]) => (
        <rect key={x} x={x} y={y} width={w} height={h} rx="4" fill={bar} opacity={mono ? 1 : o} />
      ))}
      <path d="M 8 62 C 30 56, 52 36, 73 15" fill="none" stroke={arc} strokeWidth="6.5" strokeLinecap="round" />
      <circle cx="81" cy="11" r="9.5" fill={arc} />
    </>
  )

  if (variant === 'icon') {
    return (
      <svg ref={ref} viewBox="0 0 100 100" role="img" aria-label={title} className={className} {...rest}>
        <title>{title}</title>
        {mark}
      </svg>
    )
  }

  return (
    <svg ref={ref} viewBox="0 0 424 112" role="img" aria-label={title} className={className} {...rest}>
      <title>{title}</title>
      <g transform="translate(8,8)">
        {mark}
        <path d={WORDMARK_PATH} fill={main} />
        <path d={SUBLINE_PATH} fill={sub} />
      </g>
    </svg>
  )
})

export default Logo
