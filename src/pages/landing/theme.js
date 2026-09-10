/**
 * Design tokens for the public marketing landing page only.
 *
 * The landing route is deliberately its own design system (Archivo / Archivo
 * Narrow / IBM Plex Mono, zero border-radius, flat hairline-ruled surfaces)
 * rather than the app's sp-* token set — see BUILD_LANDING_PAGE.md. The colors
 * are close to but not identical to the app's sp-green tokens; that's the
 * doc's spec, not a bug. The authenticated app behind login is untouched.
 */

export const C = {
  ink: '#0E1113',
  inkDeep: '#0B0E10',
  inkRaised: '#101416',
  inkWell: '#131719',
  inkOnGreen: '#08110C',
  paper: '#F2F4F3',
  green: '#2FA968',
  greenBright: '#3FC77E',
}

export const DISPLAY = "'Archivo Narrow', sans-serif"
export const BODY = "'Archivo', sans-serif"
export const MONO = "'IBM Plex Mono', monospace"

// Hairline rules between flat surfaces — the two weights used across sections.
export const HAIRLINE = '1px solid rgba(255,255,255,.07)'
export const HAIRLINE_STRONG = '1px solid rgba(255,255,255,.1)'

// Visually-hidden but screen-reader-available (used for form field labels).
export const SR_ONLY = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0,0,0,0)' }

export const hatch = {
  backgroundColor: C.inkRaised,
  backgroundImage: 'repeating-linear-gradient(135deg, rgba(255,255,255,.05) 0 1px, transparent 1px 10px)',
}

export const eyebrow = { fontFamily: MONO, fontSize: 11, letterSpacing: '.22em', textTransform: 'uppercase', color: C.green, marginBottom: 26 }

export function h2Style(extra = {}) {
  return { fontFamily: DISPLAY, fontWeight: 700, textTransform: 'uppercase', fontSize: 'clamp(34px,4.4vw,64px)', lineHeight: .96, letterSpacing: '-.01em', ...extra }
}
