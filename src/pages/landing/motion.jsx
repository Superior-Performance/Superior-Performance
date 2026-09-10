import { useEffect, useRef, useState } from 'react'

/**
 * Scroll-triggered motion primitives for the landing page.
 *
 * Both use a one-shot IntersectionObserver rather than a scroll listener, so
 * they stay cheap on mobile. Reduced-motion users get the final state
 * immediately, with no animation.
 */

// Fade + rise a block into view once it's scrolled into the viewport. Fires
// once and disconnects.
export function Reveal({ children, delay = 0, as: Tag = 'div', style = {}, className = '' }) {
  const ref = useRef(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setVisible(true); return }
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setVisible(true); obs.disconnect() }
    }, { threshold: 0.15, rootMargin: '0px 0px -8% 0px' })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  return (
    <Tag
      ref={ref}
      className={`lp-reveal ${visible ? 'lp-reveal-in' : ''} ${className}`}
      style={{ transitionDelay: visible ? `${delay}ms` : '0ms', ...style }}
    >
      {children}
    </Tag>
  )
}

// Counts a stat's leading number up to its target once scrolled into view —
// keeps whatever sign/unit text surrounds it (e.g. "+4 mph") intact.
export function CountUp({ value, duration = 900 }) {
  const ref = useRef(null)
  const [display, setDisplay] = useState(value)

  useEffect(() => {
    const match = String(value).match(/^([+-]?)(\d+)(.*)$/)
    const el = ref.current
    if (!match || !el) return
    const [, sign, digits, suffix] = match
    const target = Number(digits)

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || target === 0) return

    const obs = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return
      obs.disconnect()
      const start = performance.now()
      function tick(now) {
        const p = Math.min(1, (now - start) / duration)
        const eased = 1 - Math.pow(1 - p, 3)
        setDisplay(`${sign}${Math.round(target * eased)}${suffix}`)
        if (p < 1) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    }, { threshold: 0.4 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [value, duration])

  return <span ref={ref}>{display}</span>
}
