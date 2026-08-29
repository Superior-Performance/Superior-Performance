import { initials } from '../utils/initials'

// A circular avatar — the athlete's uploaded photo if they have one,
// initials otherwise. `size` picks both the circle's dimensions and a
// proportional font size for the initials fallback; add a new entry here
// rather than passing raw Tailwind classes at each call site.
const SIZES = {
  7:  'w-7 h-7 text-xs',
  8:  'w-8 h-8 text-sm',
  9:  'w-9 h-9 text-sm',
  10: 'w-10 h-10 text-sm',
  12: 'w-12 h-12 text-xl',
  14: 'w-14 h-14 text-2xl',
}

// `onColor` swaps the initials-fallback palette for use on a colored/
// gradient background (e.g. the athlete detail page's hero banner) where
// the normal green-on-dark-card tint wouldn't have enough contrast.
export default function Avatar({ name, photoURL, size = 8, onColor = false, className = '' }) {
  const sizeClass = SIZES[size] || SIZES[8]
  if (photoURL) {
    return <img src={photoURL} alt="" className={`${sizeClass} rounded-full object-cover flex-shrink-0 ${className}`} />
  }
  const fallbackClasses = onColor ? 'bg-white/10 text-sp-green-300' : 'bg-sp-green-500/20 text-sp-green-400'
  return (
    <div className={`${sizeClass} rounded-full ${fallbackClasses} flex items-center justify-center font-bold flex-shrink-0 ${className}`}>
      {initials(name)}
    </div>
  )
}
