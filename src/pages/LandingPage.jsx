import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Calendar, TrendingUp, MessageCircle, Zap, ChevronRight, Target, BarChart2, ArrowRight, Mail, ClipboardList } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import Logo from '../components/Logo'
import InquiryModal from '../components/InquiryModal'
import { PROGRAM_TYPES } from '../constants/programTypes'

const FEATURES = [
  {
    icon: Calendar,
    title: 'Weekly Programming',
    desc: 'Your full throwing program delivered day by day. Know exactly what to do and when.',
  },
  {
    icon: Zap,
    title: 'Velocity Tracking',
    desc: 'Log your velo and lift numbers in real time. Watch the numbers climb week over week.',
  },
  {
    icon: TrendingUp,
    title: 'Progress Dashboard',
    desc: 'See your weekly completion rate and overall program progress at a glance.',
  },
  {
    icon: MessageCircle,
    title: 'Direct Coach Chat',
    desc: 'Ask questions and get answers from your coach directly inside the app.',
  },
  {
    icon: Target,
    title: 'Assessment-Based',
    desc: 'Programs built around your individual screen — shoulder, hip, and T-spine mobility, posture, injury history.',
  },
  {
    icon: BarChart2,
    title: 'Rapsodo Integration',
    desc: 'View your Rapsodo session data alongside your programming in one place.',
  },
]

// Brand-colored progression (green fading to white) instead of a rainbow, so
// all six tiles read as one design system while still staying distinct.
const TILE_TONES = [
  { bg: 'linear-gradient(135deg, rgba(46,158,99,0.30), rgba(46,158,99,0.03))', border: 'rgba(46,158,99,0.38)', icon: '#5CC994' },
  { bg: 'linear-gradient(135deg, rgba(46,158,99,0.23), rgba(255,255,255,0.04))', border: 'rgba(46,158,99,0.30)', icon: '#7FD1A8' },
  { bg: 'linear-gradient(135deg, rgba(46,158,99,0.17), rgba(255,255,255,0.05))', border: 'rgba(46,158,99,0.22)', icon: '#A3DEBE' },
  { bg: 'linear-gradient(135deg, rgba(46,158,99,0.11), rgba(255,255,255,0.06))', border: 'rgba(255,255,255,0.16)', icon: '#C7ECD8' },
  { bg: 'linear-gradient(135deg, rgba(46,158,99,0.06), rgba(255,255,255,0.08))', border: 'rgba(255,255,255,0.14)', icon: '#E4F5EC' },
  { bg: 'linear-gradient(135deg, rgba(46,158,99,0.03), rgba(255,255,255,0.10))', border: 'rgba(255,255,255,0.14)', icon: '#FFFFFF' },
]

const STATS = [
  { value: '3', label: 'Concurrent Programs' },
  { value: '6+', label: 'Metrics Tracked' },
  { value: '100%', label: 'Personalized' },
]

// What each of the 3 concurrent program tracks actually is — grounded in the
// real product, not marketing copy. Reuses the same identity (color, label)
// the app itself uses on the athlete's calendar, so the site and the product
// look like the same thing.
const TRACK_COPY = {
  correctives: {
    icon: ClipboardList,
    photo: '/photos/facility-hallway.jpg',
    photoPosition: '62% 48%',
    tone: 'text-sp-green-300',
    desc: 'Built directly from your assessment — shoulder and hip mobility, posture. Every restriction the screen finds gets addressed before you throw a single pitch.',
  },
  throwing: {
    icon: Zap,
    photo: '/photos/baseballs-bucket.jpg',
    photoPosition: '48% 60%',
    tone: 'text-sky-300',
    desc: 'A structured throwing progression that starts once your foundation is in place, matched to where you actually are in your development.',
  },
  lifting: {
    icon: Target,
    photo: '/photos/facility-lane.jpg',
    photoPosition: '82% 42%',
    tone: 'text-amber-300',
    desc: 'Strength work programmed alongside your throwing — individualized the same way as your correctives, not a generic template.',
  },
}

const HOW_IT_WORKS = [
  { step: '01', title: 'Full Assessment', desc: 'Shoulder, hip, and T-spine mobility, posture, and injury history — a complete physical screen before anything is written.' },
  { step: '02', title: 'Programs Built From Data', desc: 'Your coach builds correctives, throwing, and lifting around what the assessment actually found — not a template everyone gets.' },
  { step: '03', title: 'Train Week By Week', desc: 'Your full calendar shows up in the app, day by day, all three tracks together. Check off exercises as you go.' },
  { step: '04', title: 'Track And Adjust', desc: 'Log velo and lift numbers as you train. Your coach sees your progress and adjusts the program as you improve.' },
]

export default function LandingPage() {
  const { logout } = useAuth()
  const [showInquiry, setShowInquiry] = useState(false)

  // Sign out any existing session so every visit requires fresh credentials
  useEffect(() => { logout() }, [])

  return (
    <div className="relative min-h-screen bg-[#080c14] text-white overflow-x-hidden">

      {/* Glow orbs — absolute (not fixed) so they scroll with the page instead of
          repainting against a fixed viewport, which was leaving a stale seam at
          section boundaries as the page scrolled past them. */}
      <div className="absolute top-[-200px] left-1/2 -translate-x-1/2 w-[800px] h-[800px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(46,158,99,0.15) 0%, transparent 70%)' }} />
      <div className="absolute bottom-[-100px] right-[-100px] w-[500px] h-[500px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(46,158,99,0.08) 0%, transparent 70%)' }} />

      {/* Film-grain texture — flat dark sections otherwise read as unfinished/digital.
          Layered CSS dot patterns (not an SVG feTurbulence data-URI — that filter
          silently fails to rasterize as a background-image in this browser target)
          at two scales/angles so it reads as texture, not a mechanical grid. */}
      <div className="absolute inset-0 pointer-events-none" style={{
        backgroundImage: 'radial-gradient(rgba(255,255,255,0.26) 1px, transparent 1px), radial-gradient(rgba(255,255,255,0.15) 1px, transparent 1px)',
        backgroundSize: '9px 9px, 14px 14px',
        backgroundPosition: '0 0, 4px 6px',
      }} />

      {/* Nav — a solid, blurred bar so it reads as chrome, not a fade into the hero */}
      <div
        className="sticky top-0 z-20 border-b border-white/[0.07]"
        style={{ background: 'rgba(8,12,20,0.82)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}
      >
        <nav className="flex items-center justify-between px-6 py-5 max-w-7xl mx-auto">
          <Logo className="h-12 w-auto" />
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowInquiry(true)}
              className="hidden sm:flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white/60 hover:text-white transition-colors"
            >
              Inquire
            </button>
            <Link
              to="/login"
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-xl border border-white/10 hover:border-white/25 hover:bg-white/5 transition-all"
            >
              Sign In <ArrowRight size={14} />
            </Link>
          </div>
        </nav>
      </div>

      {/* Hero */}
      <section className="relative z-10 px-6 pt-16 pb-32 max-w-7xl mx-auto text-center overflow-hidden">
        <SectionPhoto
          src="/photos/hero-glove.jpg"
          opacity={0.32}
          overlay="linear-gradient(180deg, rgba(8,12,20,0.3) 0%, #080c14 88%)"
          startVisible
        />

        <div className="relative">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-sp-green-500/30 bg-sp-green-500/10 text-xs font-semibold text-sp-green-300 mb-10 tracking-wider uppercase">
          <span className="w-1.5 h-1.5 bg-sp-green-400 rounded-full animate-pulse" />
          Elite Pitcher Development
        </div>

        {/* Headline */}
        <h1 className="font-display text-6xl sm:text-7xl lg:text-8xl font-extrabold tracking-tighter leading-none mb-6">
          <span className="block text-white">Train Like</span>
          <span className="block" style={{
            background: 'linear-gradient(90deg, #68BC8E 0%, #2E9E63 50%, #1B5E3F 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}>
            The Elite.
          </span>
        </h1>

        {/* Sub */}
        <p className="text-white/50 text-lg sm:text-xl max-w-2xl mx-auto mb-12 leading-relaxed">
          Personalized throwing programs built from your assessment data — delivered week by week, tracked pitch by pitch.
        </p>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            to="/login"
            className="group flex items-center gap-2.5 px-7 py-4 font-bold rounded-2xl text-sm transition-all shadow-[0_6px_0_#163f2b,0_14px_34px_-10px_rgba(46,158,99,0.45)] hover:brightness-110 active:translate-y-[3px] active:shadow-[0_2px_0_#163f2b,0_8px_20px_-10px_rgba(46,158,99,0.4)]"
            style={{ background: 'linear-gradient(135deg, #2E9E63, #216341)' }}
          >
            Access Your Program
            <ChevronRight size={16} className="group-hover:translate-x-0.5 transition-transform" />
          </Link>
          <button
            onClick={() => setShowInquiry(true)}
            className="flex items-center gap-2 px-7 py-4 text-sm font-semibold text-white/60 hover:text-white transition-colors"
          >
            Not signed up yet? Inquire
          </button>
        </div>

        {/* Stats row */}
        <div className="flex items-center justify-center gap-12 mt-20 pt-10 border-t border-white/5">
          {STATS.map(({ value, label }) => (
            <div key={label} className="text-center">
              <div className="text-3xl font-extrabold text-white tracking-tight">{value}</div>
              <div className="text-xs text-white/30 mt-1 font-medium uppercase tracking-widest">{label}</div>
            </div>
          ))}
        </div>
        </div>
      </section>

      {/* Three Tracks — real facility photography carries the cards themselves
          (full color, no wash) instead of an ambient background image, so this
          section reads as photographic proof rather than another dark gradient. */}
      <section className="relative z-10 px-6 pb-28 max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <p className="text-sp-green-400 text-xs font-bold uppercase tracking-widest mb-3">Your Program</p>
          <h2 className="text-4xl font-extrabold tracking-tight mb-4">Three tracks, running together.</h2>
          <p className="text-white/40 max-w-lg mx-auto">
            Correctives, throwing, and lifting all run at once — clearly separated on your
            calendar, but built to work as one program, not three.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {PROGRAM_TYPES.filter(({ key }) => TRACK_COPY[key]).map(({ key, label }) => {
            const { icon: Icon, desc, photo, photoPosition, tone } = TRACK_COPY[key]
            return (
              <div
                key={key}
                className="group relative h-80 rounded-2xl overflow-hidden border border-white/10 transition-all duration-300 hover:-translate-y-1"
                style={{ boxShadow: '0 24px 44px -28px rgba(0,0,0,0.85)' }}
              >
                <img
                  src={photo}
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.06]"
                  style={{ objectPosition: photoPosition }}
                />
                <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(14,17,19,0.15) 0%, rgba(14,17,19,0.35) 45%, rgba(14,17,19,0.96) 100%)' }} />
                <div className="absolute bottom-0 left-0 right-0 p-6">
                  <div
                    className={`w-9 h-9 rounded-lg bg-black/50 border border-white/15 flex items-center justify-center mb-3 ${tone}`}
                    style={{ backdropFilter: 'blur(6px)' }}
                  >
                    <Icon size={16} />
                  </div>
                  <h3 className="font-bold text-white text-lg mb-1.5">{label}</h3>
                  <p className="text-white/70 text-sm leading-relaxed">{desc}</p>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="relative z-10 px-6 pb-28 max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <p className="text-sp-green-400 text-xs font-bold uppercase tracking-widest mb-3">The Platform</p>
          <h2 className="text-4xl font-extrabold tracking-tight mb-4">Everything your development needs.</h2>
          <p className="text-white/40 max-w-md mx-auto">One app. Your program, your data, your coach — all connected.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map(({ icon: Icon, title, desc }, i) => {
            const tone = TILE_TONES[i % TILE_TONES.length]
            return (
              <div
                key={title}
                className="group relative rounded-2xl border p-6 hover:scale-[1.02] hover:-translate-y-0.5 transition-all duration-200 cursor-default overflow-hidden"
                style={{ background: tone.bg, borderColor: tone.border, boxShadow: '0 20px 36px -26px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.05)' }}
              >
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                  style={{ background: 'radial-gradient(circle at 50% 0%, rgba(255,255,255,0.03), transparent 70%)' }} />
                <div
                  className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center mb-4"
                  style={{ color: tone.icon, boxShadow: '0 3px 8px -2px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08)' }}
                >
                  <Icon size={19} />
                </div>
                <h3 className="font-bold text-white mb-2">{title}</h3>
                <p className="text-white/45 text-sm leading-relaxed">{desc}</p>
              </div>
            )
          })}
        </div>
      </section>

      {/* How It Works */}
      <section className="relative z-10 px-6 pb-28 max-w-7xl mx-auto overflow-hidden">
        <SectionPhoto
          src="/photos/facility-lane.jpg"
          opacity={0.32}
          overlay="linear-gradient(180deg, rgba(8,12,20,0.5) 0%, rgba(8,12,20,0.9) 100%)"
        />
        <div className="relative">
        <div className="text-center mb-16">
          <p className="text-sp-green-400 text-xs font-bold uppercase tracking-widest mb-3">How It Works</p>
          <h2 className="text-4xl font-extrabold tracking-tight mb-4">From assessment to the mound.</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {HOW_IT_WORKS.map(({ step, title, desc }, i) => (
            <div key={step} className="relative">
              <div
                className="w-11 h-11 rounded-full flex items-center justify-center font-display font-bold text-sm tabular-nums text-sp-green-300 mb-4"
                style={{
                  background: 'linear-gradient(160deg, rgba(46,158,99,0.28), rgba(46,158,99,0.06))',
                  border: '1px solid rgba(46,158,99,0.35)',
                  boxShadow: '0 10px 20px -10px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.1)',
                }}
              >
                {step}
              </div>
              <h3 className="font-bold text-white mb-2">{title}</h3>
              <p className="text-white/45 text-sm leading-relaxed">{desc}</p>
              {i < HOW_IT_WORKS.length - 1 && (
                <div className="hidden lg:block absolute top-[22px] -right-3 w-6 h-px bg-white/10" />
              )}
            </div>
          ))}
        </div>
        </div>
      </section>

      {/* About / Coach */}
      <section className="relative z-10 px-6 pb-28 max-w-7xl mx-auto">
        <div className="relative rounded-3xl overflow-hidden border border-white/10 p-10 sm:p-16">
          <SectionPhoto
            src="/photos/facility-hallway.jpg"
            opacity={0.4}
            overlay="linear-gradient(135deg, rgba(46,158,99,0.25) 0%, rgba(8,12,20,0.88) 60%)"
          />

          {/* Accent line */}
          <div className="absolute top-0 left-0 right-0 h-px"
            style={{ background: 'linear-gradient(90deg, transparent, rgba(46,158,99,0.8), transparent)' }} />

          <div className="relative flex flex-col lg:flex-row gap-10 items-start">
            <div className="flex-shrink-0">
              <div className="w-20 h-20 rounded-2xl flex items-center justify-center text-3xl font-black"
                style={{ background: 'linear-gradient(135deg, #2E9E63, #216341)', boxShadow: '0 16px 30px -12px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.15)' }}>
                SP
              </div>
            </div>
            <div className="flex-1">
              <p className="text-sp-green-400 text-xs font-bold uppercase tracking-widest mb-3">The Method</p>
              <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-6 leading-tight">
                Not a template.<br />
                <span className="text-white/40">Your program.</span>
              </h2>
              <p className="text-white/55 leading-relaxed max-w-2xl mb-4">
                Every athlete who trains with Superior Performance goes through a full physical assessment — shoulder, hip, and T-spine mobility, posture, and injury history. That data drives the program. No two programs are the same because no two athletes are the same.
              </p>
              <p className="text-white/55 leading-relaxed max-w-2xl mb-8">
                Inside the platform you get your full weekly schedule, a direct line to your coach, and real-time tracking of every metric that matters. This is what elite development looks like.
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <Link
                  to="/login"
                  className="inline-flex items-center gap-2 px-6 py-3 font-bold text-sm rounded-xl transition-all shadow-[0_5px_0_#163f2b,0_10px_26px_-10px_rgba(46,158,99,0.4)] hover:brightness-110 active:translate-y-[2px] active:shadow-[0_2px_0_#163f2b,0_6px_16px_-10px_rgba(46,158,99,0.35)]"
                  style={{ background: 'linear-gradient(135deg, #2E9E63, #216341)' }}
                >
                  Sign In <ChevronRight size={15} />
                </Link>
                <button
                  onClick={() => setShowInquiry(true)}
                  className="inline-flex items-center gap-2 px-6 py-3 font-semibold text-sm rounded-xl border border-white/10 text-white/60 hover:text-white hover:border-white/25 transition-all"
                >
                  Inquire about training
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Banner — full-bleed solid green, a deliberate break from the dark
          scroll above so the close of the page has real weight, not another
          faded gradient-on-black section. */}
      <section className="relative z-10 mb-28 overflow-hidden">
        <div
          className="py-24 px-6 relative"
          style={{ background: 'linear-gradient(160deg, #2E9E63 0%, #1B5E3F 100%)' }}
        >
          <div
            className="absolute inset-0 pointer-events-none opacity-25"
            style={{ backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.5) 1px, transparent 1px)', backgroundSize: '28px 28px' }}
          />
          <div className="relative max-w-7xl mx-auto text-center">
            <h2 className="text-5xl sm:text-6xl font-extrabold tracking-tighter mb-6 text-white">
              Ready to<br />
              <span className="text-sp-ink-900">level up?</span>
            </h2>
            <p className="text-white/80 mb-8 max-w-sm mx-auto">Your program is waiting. Sign in to get started.</p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                to="/login"
                className="inline-flex items-center gap-2.5 px-8 py-4 font-bold rounded-2xl text-sm text-white bg-sp-ink-900 transition-all shadow-[0_6px_0_#000,0_16px_30px_-12px_rgba(0,0,0,0.5)] hover:brightness-125 active:translate-y-[3px] active:shadow-[0_2px_0_#000,0_8px_18px_-10px_rgba(0,0,0,0.45)]"
              >
                Access Your Program <ChevronRight size={16} />
              </Link>
              <button
                onClick={() => setShowInquiry(true)}
                className="inline-flex items-center gap-2 px-6 py-4 font-semibold text-sm text-sp-ink-900/70 hover:text-sp-ink-900 transition-colors"
              >
                <Mail size={15} /> Not a member? Inquire
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/5 px-6 py-8 max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2.5 opacity-50">
          <Logo variant="icon" className="h-7 w-7" />
          <span className="font-bold text-sm">Superior Performance</span>
        </div>
        <div className="flex items-center gap-6 text-white/25 text-sm">
          <button onClick={() => setShowInquiry(true)} className="hover:text-white/60 transition">Contact</button>
          <Link to="/login" className="hover:text-white/60 transition">Sign In</Link>
        </div>
        <p className="text-white/15 text-xs">© {new Date().getFullYear()} Superior Performance</p>
      </footer>

      {showInquiry && <InquiryModal onClose={() => setShowInquiry(false)} />}

    </div>
  )
}

/**
 * Real facility photo used as section texture — grayscale, faded well behind
 * an overlay so it never competes with text. Starts invisible and fades in
 * once the section scrolls into view, then fades back out as it scrolls
 * past, via IntersectionObserver rather than a scroll listener (cheaper,
 * no per-frame work). Pass `startVisible` for the hero, which is on screen
 * before the observer has a chance to fire.
 */
// Feathers the top/bottom edges to transparent so the photo dissolves into
// whatever sits above and below it instead of reading as a pasted rectangle.
const PHOTO_FEATHER = 'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.45) 14%, black 34%, black 66%, rgba(0,0,0,0.45) 86%, transparent 100%)'

function SectionPhoto({ src, opacity, overlay, startVisible = false }) {
  const ref = useRef(null)
  const [inView, setInView] = useState(startVisible)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { threshold: 0.1 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={ref} className="absolute inset-0 pointer-events-none">
      <img
        src={src}
        alt=""
        className="absolute inset-0 w-full h-full object-cover transition-opacity duration-[1400ms] ease-out"
        style={{
          filter: 'grayscale(1)',
          opacity: inView ? opacity : 0,
          WebkitMaskImage: PHOTO_FEATHER,
          maskImage: PHOTO_FEATHER,
        }}
      />
      {/* Green duotone so the photo reads as brand, not a raw gray stock shot */}
      <div
        className="absolute inset-0 transition-opacity duration-[1400ms] ease-out"
        style={{
          background: '#1B5E3F',
          mixBlendMode: 'color',
          opacity: inView ? 0.5 : 0,
          WebkitMaskImage: PHOTO_FEATHER,
          maskImage: PHOTO_FEATHER,
        }}
      />
      <div className="absolute inset-0" style={{ background: overlay }} />
    </div>
  )
}
