import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Menu, X } from 'lucide-react'
import Logo from '../components/Logo'
import { C, DISPLAY, BODY, MONO, HAIRLINE, HAIRLINE_STRONG, hatch, eyebrow, h2Style } from './landing/theme'
import { Reveal, CountUp } from './landing/motion'
import RequestForm from './landing/RequestForm'

/**
 * Public marketing landing page — built from BUILD_LANDING_PAGE.md.
 *
 * Deliberately its own design system (Archivo / Archivo Narrow / IBM Plex
 * Mono, zero border-radius, flat hairline-ruled surfaces) rather than the
 * app's sp-* token set — the doc scopes itself to just this route, the
 * authenticated app behind login is untouched. Design tokens live in
 * ./landing/theme; scroll-motion primitives in ./landing/motion.
 *
 * Cut per the client: Testimonials and Staff sections (both require real
 * quotes/names/bios the doc says must never ship as placeholders).
 */

const NAV_LINKS = [
  { label: 'Process', href: '#process' },
  { label: 'Results', href: '#results' },
  { label: 'FAQ', href: '#faq' },
]

export default function LandingPage() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    const prev = document.documentElement.style.scrollBehavior
    document.documentElement.style.scrollBehavior = 'smooth'
    return () => { document.documentElement.style.scrollBehavior = prev }
  }, [])

  // Single passive scroll listener, rAF-throttled, driving two transform-only
  // reads (progress bar width via scaleX, nav compaction past a threshold) —
  // no layout-triggering work per frame, so it stays smooth on mobile.
  useEffect(() => {
    let ticking = false
    function update() {
      const doc = document.documentElement
      const max = doc.scrollHeight - doc.clientHeight
      setProgress(max > 0 ? window.scrollY / max : 0)
      setScrolled(window.scrollY > 40)
      ticking = false
    }
    function onScroll() {
      if (!ticking) { ticking = true; requestAnimationFrame(update) }
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <div style={{ background: C.ink, color: C.paper, fontFamily: BODY, minHeight: '100vh' }}>
      <style>{`
        .lp-anchor { scroll-margin-top: 72px; }
        .lp-link:hover { color: ${C.greenBright} !important; }
        .lp-btn-primary { background: ${C.green}; color: ${C.inkOnGreen}; transition: background-color .12s ease; }
        .lp-btn-primary:hover { background: ${C.greenBright}; }
        .lp-btn-secondary { border: 1px solid rgba(255,255,255,.18); color: ${C.paper}; transition: border-color .12s ease, color .12s ease; }
        .lp-btn-secondary:hover { border-color: ${C.green}; color: ${C.greenBright}; }
        .lp-faq-q:hover { color: ${C.greenBright} !important; }
        .lp-input { background: ${C.ink}; transition: background-color .12s ease; }
        .lp-input:focus { background: ${C.inkWell}; outline: 2px solid ${C.greenBright}; outline-offset: -2px; }
        .lp-focus:focus-visible { outline: 2px solid ${C.greenBright}; outline-offset: 2px; }
        @keyframes spRise { from { transform: scaleY(.15); opacity: .2 } to { transform: scaleY(1); opacity: 1 } }
        .lp-bar { animation-name: spRise; animation-duration: .6s; animation-timing-function: ease-out; animation-fill-mode: both; }
        .lp-reveal { opacity: 0; transform: translateY(20px); transition: opacity .6s cubic-bezier(.16,.8,.24,1), transform .6s cubic-bezier(.16,.8,.24,1); }
        .lp-reveal-in { opacity: 1; transform: translateY(0); }
        @media (prefers-reduced-motion: reduce) {
          .lp-bar { animation: none !important; opacity: 1 !important; transform: scaleY(1) !important; }
          .lp-reveal { opacity: 1 !important; transform: none !important; transition: none !important; }
        }
        @media (max-width: 880px) {
          .lp-hero-a { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 900px) {
          .lp-process-sticky { position: static !important; top: auto !important; }
        }
      `}</style>

      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 2, zIndex: 60, background: 'rgba(255,255,255,.06)' }}>
        <div style={{ height: '100%', width: '100%', background: C.green, transform: `scaleX(${progress})`, transformOrigin: '0 0' }} />
      </div>

      <Nav mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} scrolled={scrolled} />
      <SplitHero />
      <KeywordStrip />
      <Process />
      <ImageBand />
      <Results />
      <Faq />
      <FourUpStrip />
      <RequestForm />
      <Footer />
    </div>
  )
}

// ── 3.1 Sticky nav ──────────────────────────────────────────────────────────
const navLinkDesktop = { fontFamily: MONO, fontSize: 11, letterSpacing: '.16em', textTransform: 'uppercase', color: 'rgba(242,244,243,.62)' }
const navLinkMobile = { fontFamily: MONO, fontSize: 12, letterSpacing: '.16em', textTransform: 'uppercase', color: 'rgba(242,244,243,.72)' }

function Nav({ mobileOpen, setMobileOpen, scrolled }) {
  return (
    <div
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50,
        background: scrolled ? 'rgba(14,17,19,.94)' : 'rgba(14,17,19,.82)',
        backdropFilter: 'blur(14px)',
        borderBottom: `1px solid rgba(255,255,255,${scrolled ? '.12' : '.07'})`,
        padding: scrolled ? '10px 24px' : '14px 24px',
        transition: 'background-color .25s ease, border-color .25s ease, padding .25s ease',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', maxWidth: 1400, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Logo variant="icon" className="h-[34px] w-[34px] flex-shrink-0" />
          <div style={{ lineHeight: 1 }}>
            <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 15, letterSpacing: '.14em', textTransform: 'uppercase', color: C.paper }}>Superior</div>
            <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.3em', color: C.green, marginTop: 3 }}>PERFORMANCE</div>
          </div>
        </div>

        <DesktopNavRight />

        <button
          className="lp-focus"
          onClick={() => setMobileOpen(v => !v)}
          aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={mobileOpen}
          style={{ display: 'none', background: 'transparent', border: 'none', color: C.paper, padding: 6 }}
          data-mobile-toggle
        >
          {mobileOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {mobileOpen && (
        <div data-mobile-menu style={{ display: 'none', flexDirection: 'column', gap: 4, padding: '18px 0 6px', borderTop: HAIRLINE, marginTop: 14 }}>
          {NAV_LINKS.map(l => (
            <a
              key={l.href}
              href={l.href}
              onClick={() => setMobileOpen(false)}
              className="lp-link lp-focus"
              style={{ ...navLinkMobile, padding: '10px 0' }}
            >
              {l.label}
            </a>
          ))}
          <Link
            to="/login"
            onClick={() => setMobileOpen(false)}
            className="lp-link lp-focus"
            style={{ ...navLinkMobile, padding: '10px 0' }}
          >
            Log In
          </Link>
          <a
            href="#request"
            onClick={() => setMobileOpen(false)}
            className="lp-btn-primary lp-focus"
            style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '.16em', textTransform: 'uppercase', textAlign: 'center', padding: '12px 18px', marginTop: 8 }}
          >
            Request Info
          </a>
        </div>
      )}

      <style>{`
        @media (max-width: 700px) {
          [data-mobile-toggle] { display: inline-flex !important; align-items: center; justify-content: center; }
          [data-desktop-nav] { display: none !important; }
          [data-mobile-menu] { display: flex !important; }
        }
      `}</style>
    </div>
  )
}

function DesktopNavRight() {
  return (
    <div data-desktop-nav style={{ display: 'flex', alignItems: 'center', gap: 28, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
      <div style={{ display: 'flex', gap: 26, flexWrap: 'wrap' }}>
        {NAV_LINKS.map(l => (
          <a
            key={l.href}
            href={l.href}
            className="lp-link lp-focus"
            style={navLinkDesktop}
          >
            {l.label}
          </a>
        ))}
      </div>
      <Link
        to="/login"
        className="lp-link lp-focus"
        style={navLinkDesktop}
      >
        Log In
      </Link>
      <a
        href="#request"
        className="lp-btn-primary lp-focus"
        style={{ height: 38, display: 'inline-flex', alignItems: 'center', padding: '0 18px', fontFamily: MONO, fontSize: 11, letterSpacing: '.16em', textTransform: 'uppercase' }}
      >
        Request Info
      </a>
    </div>
  )
}

// ── 3.2 Hero — split ─────────────────────────────────────────────────────────
function SplitHero() {
  return (
    <section
      className="lp-hero-a"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 440px), 1fr))',
        minHeight: 'calc(100vh - 64px)',
        paddingTop: 64,
      }}
    >
      {/* Left cell */}
      <div style={{ padding: '80px clamp(24px,5vw,88px)', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 34 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ width: 40, height: 1, background: C.green, flexShrink: 0 }} />
          <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '.22em', textTransform: 'uppercase', color: C.green }}>High School &amp; College Pitchers</span>
        </div>

        <h1 style={{ fontFamily: DISPLAY, fontWeight: 700, textTransform: 'uppercase', fontSize: 'clamp(46px,6.6vw,104px)', lineHeight: .92, letterSpacing: '-.015em', textWrap: 'balance', margin: 0 }}>
          Nobody Hands<br />You Velocity.<br /><span style={{ color: C.green }}>You Build It.</span>
        </h1>

        <p style={{ fontFamily: BODY, fontSize: 'clamp(16px,1.3vw,19px)', lineHeight: 1.6, color: 'rgba(242,244,243,.72)', maxWidth: '46ch', margin: 0, textWrap: 'pretty' }}>
          Individualized throwing programs built from your assessment, then adjusted week by week. No templates. No guessing. Every rep has a reason.
        </p>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
          <a href="#request" className="lp-btn-primary lp-focus" style={{ height: 56, display: 'inline-flex', alignItems: 'center', padding: '0 30px', fontFamily: MONO, fontSize: 12, letterSpacing: '.18em', textTransform: 'uppercase' }}>
            Request Info
          </a>
          <a href="#process" className="lp-btn-secondary lp-focus" style={{ height: 56, display: 'inline-flex', alignItems: 'center', padding: '0 26px', fontFamily: MONO, fontSize: 12, letterSpacing: '.18em', textTransform: 'uppercase' }}>
            See the Process
          </a>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, background: 'rgba(255,255,255,.09)', border: '1px solid rgba(255,255,255,.09)', marginTop: 12 }}>
          {[
            ['+4 mph', 'mph', 'Avg over 12 weeks'],
            ['0', '', 'In-house arm injuries'],
            ['+8 lbs', 'lbs', 'Avg through phases'],
          ].map(([num, , cap], i) => (
            <Reveal key={i} delay={i * 80} style={{ background: C.ink, padding: '20px 18px' }}>
              <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 34, color: C.greenBright }}><CountUp value={num} /></div>
              <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '.16em', textTransform: 'uppercase', color: 'rgba(242,244,243,.5)', marginTop: 8 }}>{cap}</div>
            </Reveal>
          ))}
        </div>
      </div>

      {/* Right cell */}
      <div style={{ borderLeft: HAIRLINE, background: C.inkDeep, minHeight: 520, display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, minHeight: 180, position: 'relative', overflow: 'hidden', borderBottom: HAIRLINE }}>
          <HeroVideo />
        </div>

        <div style={{ padding: '26px 28px 20px', borderBottom: HAIRLINE }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 20 }}>
            <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase', color: 'rgba(242,244,243,.5)' }}>Sample program readout</span>
            <span style={{ fontFamily: MONO, fontSize: 10, color: C.greenBright }}>Week 7 / 12</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1, background: 'rgba(255,255,255,.08)' }}>
            {[
              ['Phase', 'Season on-ramp', false],
              ['Throwing days', 'Monday · Wednesday · Thursday · Saturday', false],
              ['Limiter', 'Hip mobility and scap winging', false],
              ['Correctives', 'Daily', true],
            ].map(([label, value, green], i) => (
              <div key={i} style={{ background: C.inkDeep, padding: '13px 0', display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <span style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 15, letterSpacing: '.06em', textTransform: 'uppercase', color: C.paper }}>{label}</span>
                <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', color: green ? C.greenBright : 'rgba(242,244,243,.66)', textAlign: 'right' }}>{value}</span>
              </div>
            ))}
          </div>
        </div>

        <VeloChart />
      </div>
    </section>
  )
}

function VeloChart() {
  const ref = useRef(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setVisible(true); obs.disconnect() }
    }, { threshold: 0.3 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  const weeks = [
    { h: 38, c: '#1B4332' }, { h: 45, c: '#1B4332' }, { h: 42, c: '#20603F' },
    { h: 53, c: '#22684A' }, { h: 57, c: '#22684A' }, { h: 51, c: '#26794F' },
    { h: 66, c: '#2A8A5C' }, { h: 72, c: '#2A8A5C' }, { h: 69, c: '#2E9C63' },
    { h: 84, c: '#2FA968' }, { h: 88, c: '#37B872' }, { h: 100, c: '#3FC77E' },
  ]

  return (
    <div ref={ref} style={{ padding: '24px 28px 28px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase', color: 'rgba(242,244,243,.5)' }}>Velocity · week 1 → 12</span>
        <span style={{ fontFamily: MONO, fontSize: 10, color: C.greenBright }}>+4 mph</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 88, marginTop: 16 }}>
        {weeks.map((w, i) => (
          <div
            key={i}
            className="lp-bar"
            style={{
              flex: 1, height: `${w.h}%`, background: w.c, transformOrigin: 'bottom',
              animationDelay: `${i * 0.05}s`,
              opacity: visible ? 1 : 0,
              animationPlayState: visible ? 'running' : 'paused',
            }}
          />
        ))}
      </div>
    </div>
  )
}

// Ambient background clip chain for the hero's image slot — muted, hard-cuts
// to the next clip on end and loops back to the first, so it reads the same
// way a photo would. Grayscale + a green-tinted scrim approximates the doc's
// "duotone to near-black + green" treatment without baking a fixed look into
// the encode. Skips autoplay for prefers-reduced-motion, showing the first
// clip's poster frame only.
//
// Both <video> elements stay mounted the whole time (rather than swapping one
// element's `src`), so the next clip keeps preloading in the background while
// the current one plays — swapping which is visible on `ended` is then just a
// visibility flip, not a fresh load. Swapping `src` on a single element was
// the cause of an earlier visible blip/black-frame at the cut.
const HERO_CLIPS = [
  { src: '/videos/hero-release.mp4', poster: '/videos/hero-release-poster.jpg' },
  { src: '/videos/hero-release-2.mp4', poster: '/videos/hero-release-2-poster.jpg' },
  { src: '/videos/hero-release-3.mp4', poster: '/videos/hero-release-3-poster.jpg' },
  { src: '/videos/hero-release-4.mp4', poster: '/videos/hero-release-4-poster.jpg' },
]

function HeroVideo() {
  const [autoplay, setAutoplay] = useState(true)
  const [active, setActive] = useState(0)
  // Plain array of DOM nodes (not useRef objects) populated via callback
  // refs below — sized to the clip list, so adding another clip to
  // HERO_CLIPS is a one-line change rather than adding another hardcoded
  // useRef.
  const videoEls = useRef([]).current

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setAutoplay(!mq.matches)
  }, [])

  // Runs after the `active` state has actually committed — rewinding a
  // just-finished clip inside its own `ended` handler is flaky (some
  // browsers don't apply the seek before the element is next shown), which
  // showed up as a brief blip: the clip would flash its last instant of
  // playback before immediately re-ending on its next turn.
  useEffect(() => {
    videoEls.forEach((el, i) => {
      if (!el) return
      if (i === active) {
        if (autoplay) el.play?.().catch(() => {})
      } else {
        el.pause()
        el.currentTime = 0
      }
    })
  }, [active, autoplay])

  function handleEnded(i) {
    setActive(i === HERO_CLIPS.length - 1 ? 0 : i + 1)
  }

  return (
    <>
      {HERO_CLIPS.map((clip, i) => (
        <video
          key={clip.src}
          ref={el => { videoEls[i] = el }}
          src={clip.src}
          poster={clip.poster}
          autoPlay={autoplay && i === 0}
          muted
          playsInline
          preload="auto"
          aria-hidden="true"
          tabIndex={-1}
          onEnded={() => handleEnded(i)}
          style={{
            position: 'absolute', inset: 0,
            width: '100%', height: '100%', objectFit: 'cover',
            filter: 'grayscale(1) contrast(1.05)',
            display: active === i ? 'block' : 'none',
          }}
        />
      ))}
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(160deg, rgba(11,14,16,.15), rgba(47,169,104,.22))', pointerEvents: 'none' }} />
    </>
  )
}

// ── 3.3 Keyword strip ────────────────────────────────────────────────────────
function KeywordStrip() {
  const items = ['Assessment-driven', 'Weekly adjustments', 'Velocity + command', 'Arm care built in', 'Remote or in-house']
  return (
    <div style={{ background: C.inkDeep, padding: '16px clamp(24px,5vw,88px)', borderBottom: HAIRLINE }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px 44px' }}>
        {items.map((item, i) => (
          <Reveal key={item} delay={i * 60} style={{ display: 'flex', alignItems: 'center', gap: 14, flex: 'none' }}>
            <span style={{ width: 4, height: 4, background: C.green, flexShrink: 0 }} />
            <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '.24em', textTransform: 'uppercase', color: 'rgba(242,244,243,.58)' }}>{item}</span>
          </Reveal>
        ))}
      </div>
    </div>
  )
}

// ── 3.4 Process ──────────────────────────────────────────────────────────────
function Process() {
  const steps = [
    { i: '01', t: 'Assessment', d: 'Mobility, strength, mechanics and current workload get measured before anything is prescribed. We find the limiter, not just the symptom.' },
    { i: '02', t: 'Individualized Program', d: 'Throwing, lifting and arm care written into one plan with phases that match your calendar — offseason build, in-season maintain, playoff peak.' },
    { i: '03', t: 'Weekly Tracking', d: 'Every session logged, every number reviewed. The program moves when you do — and it backs off before your arm makes that decision for you.' },
  ]
  return (
    <section id="process" className="lp-anchor" style={{ padding: 'clamp(72px,9vw,140px) clamp(24px,5vw,88px)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: 'clamp(32px,5vw,80px)', alignItems: 'start' }}>
        <div className="lp-process-sticky" style={{ position: 'sticky', top: 100 }}>
          <p style={eyebrow}>01 — The Process</p>
          <h2 style={h2Style()}>Three steps.<br />No shortcuts.</h2>
          <p style={{ fontFamily: BODY, fontSize: 16, lineHeight: 1.65, color: 'rgba(242,244,243,.6)', maxWidth: '34ch', marginTop: 22 }}>
            Your program is written for your arm, your movement, and your season — then rewritten as you change.
          </p>
          <div style={{ marginTop: 40, borderTop: HAIRLINE_STRONG }}>
            {[
              ['Assessment', 'One session'],
              ['Program block', '12 weeks'],
              ['Check-ins', 'Weekly'],
              ['Delivery', 'Remote or in-house'],
            ].map(([label, value]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '16px 0', borderBottom: HAIRLINE_STRONG }}>
                <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '.16em', textTransform: 'uppercase', color: 'rgba(242,244,243,.5)' }}>{label}</span>
                <span style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 15, letterSpacing: '.04em', textTransform: 'uppercase' }}>{value}</span>
              </div>
            ))}
          </div>
        </div>

        <div>
          {steps.map((s, i) => (
            <Reveal
              key={s.i}
              delay={i * 100}
              style={{
                display: 'grid', gridTemplateColumns: 'auto minmax(0,1fr)', gap: 'clamp(20px,3vw,44px)',
                padding: '34px 0', borderTop: HAIRLINE_STRONG,
                borderBottom: i === steps.length - 1 ? HAIRLINE_STRONG : 'none',
              }}
            >
              <span style={{ fontFamily: MONO, fontSize: 12, letterSpacing: '.16em', color: C.green, paddingTop: 6 }}>{s.i}</span>
              <div>
                <h3 style={{ fontFamily: DISPLAY, fontWeight: 700, textTransform: 'uppercase', fontSize: 'clamp(24px,2.6vw,34px)', lineHeight: 1.05, margin: 0 }}>{s.t}</h3>
                <p style={{ fontFamily: BODY, fontSize: 16, lineHeight: 1.65, color: 'rgba(242,244,243,.68)', maxWidth: '56ch', marginTop: 14 }}>{s.d}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── 3.5 Full-bleed image band ────────────────────────────────────────────────
function ImageBand() {
  return (
    <section style={{ minHeight: 'clamp(320px, 44vw, 560px)', ...hatch, padding: 'clamp(24px,4vw,56px)', position: 'relative', display: 'flex', alignItems: 'flex-end', borderBottom: HAIRLINE }}>
      <span style={{ position: 'absolute', top: 'clamp(24px,4vw,56px)', left: 'clamp(24px,4vw,56px)', fontFamily: MONO, fontSize: 10, color: 'rgba(242,244,243,.58)', lineHeight: 1.9, maxWidth: '90%' }}>
        [ full-bleed image band ] / bullpen wide shot, 21:9 crop, 2400px+ / duotone: near-black + #2FA968
      </span>
      <Reveal as="h2" style={{ fontFamily: DISPLAY, fontWeight: 700, textTransform: 'uppercase', fontSize: 'clamp(28px,3.6vw,52px)', lineHeight: 1, letterSpacing: '-.01em', maxWidth: '24ch', margin: 0 }}>
        Every rep<br />gets logged.
      </Reveal>
    </section>
  )
}

// ── 3.6 Results — inverted ───────────────────────────────────────────────────
function Results() {
  const cells = [
    { num: '+4', unit: 'mph average', cap: 'Average 4mph jump over 12 weeks', rows: [['Measured', 'Rapsodo, week 4 vs 12'], ['Window', '12-week block'], ['Range seen', '+2 to +11 mph']] },
    { num: '0', unit: 'arm injuries', cap: '0 in-house arm injuries to date', rows: [['Since', 'Day one'], ['Built in', 'Daily correctives'], ['Workload', 'Capped and logged']] },
    { num: '+8', unit: 'lbs gained', cap: 'Average 8lbs gained through training phases', rows: [['Measured', 'Weigh-in, each phase'], ['Driver', 'Lifting + nutrition targets'], ['Goal', 'Usable mass, not filler']] },
  ]
  return (
    <section id="results" className="lp-anchor" style={{ padding: 'clamp(72px,9vw,140px) clamp(24px,5vw,88px)', background: C.green, color: C.inkOnGreen }}>
      <Reveal>
        <p style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '.22em', textTransform: 'uppercase', color: C.inkOnGreen, marginBottom: 26 }}>02 — Results</p>
        <h2 style={{ ...h2Style(), color: C.inkOnGreen, maxWidth: '22ch' }}>The numbers we hold ourselves to.</h2>
        <p style={{ fontFamily: BODY, fontSize: 17, lineHeight: 1.6, color: C.inkOnGreen, maxWidth: '56ch', marginTop: 20 }}>
          Averages across the pitchers who finish a full 12-week block with us. The first few weeks build mechanics and strength before throwing intent ramps up — velocity is measured at week four, then again at week twelve.
        </p>
      </Reveal>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 1, background: 'rgba(8,17,12,.22)', border: '1px solid rgba(8,17,12,.22)', marginTop: 'clamp(40px,5vw,72px)' }}>
        {cells.map((cell, i) => (
          <Reveal key={i} delay={i * 100} style={{ background: C.green, padding: 'clamp(28px,3.5vw,48px)' }}>
            <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 'clamp(56px,7vw,96px)', lineHeight: .9, color: C.inkOnGreen }}><CountUp value={cell.num} /></div>
            <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 20, textTransform: 'uppercase', letterSpacing: '.02em', color: C.inkOnGreen, marginTop: 6 }}>{cell.unit}</div>
            <div style={{ fontFamily: MONO, fontSize: 11, lineHeight: 1.8, letterSpacing: '.1em', textTransform: 'uppercase', color: C.inkOnGreen, marginTop: 14 }}>{cell.cap}</div>
            <div style={{ marginTop: 22 }}>
              {cell.rows.map(([label, value]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, padding: '11px 0', borderTop: '1px solid rgba(8,17,12,.22)' }}>
                  <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: C.inkOnGreen }}>{label}</span>
                  <span style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 14, letterSpacing: '.04em', textTransform: 'uppercase', color: C.inkOnGreen, textAlign: 'right' }}>{value}</span>
                </div>
              ))}
            </div>
          </Reveal>
        ))}
      </div>
      <p style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '.08em', color: 'rgba(8,17,12,.8)', marginTop: 20 }}>
        Averages across athletes completing a full 12-week block. Individual results vary based on starting point, consistency, and training age.
      </p>
    </section>
  )
}

// ── 3.9 FAQ ──────────────────────────────────────────────────────────────────
const FAQ_ITEMS = [
  { q: 'Do I have to train in person?', a: 'No. Programs run remotely with weekly check-ins, and in-house work is available if you’re local. The assessment and the tracking are the same either way.' },
  { q: 'How long before I see velocity?', a: 'Our average is a 4mph jump over 12 weeks. Some arms move faster, some need the first block spent on movement and strength before throwing intent goes up.' },
  { q: 'What happens at the assessment?', a: 'Mobility and strength screening, a look at your delivery, and a review of your current throwing workload. That’s what the program gets written from.' },
  { q: 'Can I run this during my season?', a: 'Yes. In-season programs are built to maintain velocity and manage workload, not to add volume on top of your outings.' },
  { q: 'What ages do you work with?', a: 'Primarily high school and college pitchers. If you’re outside that range, send a note and we’ll tell you honestly whether we’re the right fit.' },
]

function Faq() {
  const [openFaq, setOpenFaq] = useState(0)
  return (
    <section id="faq" className="lp-anchor" style={{ padding: 'clamp(72px,9vw,140px) clamp(24px,5vw,88px)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: 'clamp(32px,5vw,80px)', alignItems: 'start' }}>
        <Reveal>
          <p style={eyebrow}>05 — FAQ</p>
          <h2 style={h2Style()}>Straight<br />answers.</h2>
        </Reveal>
        <div>
          {FAQ_ITEMS.map((item, i) => {
            const open = openFaq === i
            return (
              <Reveal key={item.q} delay={i * 60} style={{ borderTop: HAIRLINE_STRONG }}>
                <button
                  className="lp-faq-q lp-focus"
                  onClick={() => setOpenFaq(open ? -1 : i)}
                  aria-expanded={open}
                  aria-controls={`faq-panel-${i}`}
                  style={{
                    width: '100%', background: 'transparent', border: 'none', padding: '26px 0',
                    display: 'flex', justifyContent: 'space-between', gap: 20, alignItems: 'center',
                    textAlign: 'left', cursor: 'pointer', color: C.paper,
                  }}
                >
                  <span style={{ fontFamily: DISPLAY, fontWeight: 700, textTransform: 'uppercase', fontSize: 'clamp(18px,1.7vw,22px)', letterSpacing: '.01em' }}>{item.q}</span>
                  <span style={{ fontFamily: MONO, fontSize: 15, color: C.green, flex: 'none' }}>{open ? '—' : '+'}</span>
                </button>
                {open && (
                  <p id={`faq-panel-${i}`} style={{ fontFamily: BODY, fontSize: 16, lineHeight: 1.7, color: 'rgba(242,244,243,.68)', maxWidth: '60ch', padding: '0 0 28px', margin: 0 }}>
                    {item.a}
                  </p>
                )}
              </Reveal>
            )
          })}
          <div style={{ borderTop: HAIRLINE_STRONG }} />
        </div>
      </div>
    </section>
  )
}

// ── 3.10 Four-up image strip ─────────────────────────────────────────────────
function FourUpStrip() {
  const items = ['3:4 — weight room', '3:4 — arm care work', '3:4 — coach + athlete', '3:4 — mound, game day']
  return (
    <div style={{ background: C.inkDeep }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 1, background: 'rgba(255,255,255,.09)' }}>
        {items.map((label, i) => (
          <Reveal key={label} delay={i * 80} style={{ aspectRatio: '3 / 4', ...hatch, padding: 20, position: 'relative' }}>
            <span style={{ position: 'absolute', left: 20, bottom: 20, fontFamily: MONO, fontSize: 10, color: 'rgba(242,244,243,.58)', lineHeight: 1.9 }}>{label}</span>
          </Reveal>
        ))}
      </div>
    </div>
  )
}

// ── 3.12 Footer ───────────────────────────────────────────────────────────────
const footerLinkStyle = { fontFamily: MONO, fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase', color: 'rgba(242,244,243,.58)' }

function Footer() {
  return (
    <footer style={{ padding: '44px clamp(24px,5vw,88px) 28px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Logo variant="icon" className="h-[28px] w-[28px] flex-shrink-0" />
          <span style={footerLinkStyle}>Superior Performance</span>
        </div>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          {[['Process', '#process'], ['Results', '#results'], ['Request Info', '#request']].map(([label, href]) => (
            <a key={href} href={href} className="lp-link lp-focus" style={footerLinkStyle}>
              {label}
            </a>
          ))}
        </div>
      </div>

      <div
        style={{
          display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '12px 24px',
          marginTop: 32, paddingTop: 24, borderTop: HAIRLINE,
        }}
      >
        <span style={{ ...footerLinkStyle, letterSpacing: '.1em' }}>
          © {new Date().getFullYear()} Superior Performance · <a href="mailto:superiorperformance.sp@gmail.com" className="lp-link lp-focus" style={{ color: 'inherit' }}>superiorperformance.sp@gmail.com</a>
        </span>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          {[['Privacy Policy', '/privacy'], ['Terms & Conditions', '/terms'], ['Refund Policy', '/refund-policy']].map(([label, to]) => (
            <Link key={to} to={to} className="lp-link lp-focus" style={{ ...footerLinkStyle, letterSpacing: '.1em' }}>
              {label}
            </Link>
          ))}
        </div>
      </div>
    </footer>
  )
}
