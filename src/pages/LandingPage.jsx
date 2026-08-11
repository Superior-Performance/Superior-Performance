import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Calendar, TrendingUp, MessageCircle, Zap, ChevronRight, Target, BarChart2, ArrowRight } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

const FEATURES = [
  {
    icon: Calendar,
    title: 'Weekly Programming',
    desc: 'Your full throwing program delivered day by day. Know exactly what to do and when.',
    color: 'from-blue-500/20 to-blue-600/5',
    iconColor: 'text-blue-400',
    border: 'border-blue-500/20',
  },
  {
    icon: Zap,
    title: 'Velocity Tracking',
    desc: 'Log your velo and lift numbers in real time. Watch the numbers climb week over week.',
    color: 'from-yellow-500/20 to-yellow-600/5',
    iconColor: 'text-yellow-400',
    border: 'border-yellow-500/20',
  },
  {
    icon: TrendingUp,
    title: 'Progress Dashboard',
    desc: 'See your weekly completion rate and overall program progress at a glance.',
    color: 'from-green-500/20 to-green-600/5',
    iconColor: 'text-green-400',
    border: 'border-green-500/20',
  },
  {
    icon: MessageCircle,
    title: 'Direct Coach Chat',
    desc: 'Ask questions and get answers from your coach directly inside the app.',
    color: 'from-purple-500/20 to-purple-600/5',
    iconColor: 'text-purple-400',
    border: 'border-purple-500/20',
  },
  {
    icon: Target,
    title: 'Assessment-Based',
    desc: 'Programs built around your individual scores — grip strength, mobility, velo, sprint time.',
    color: 'from-red-500/20 to-red-600/5',
    iconColor: 'text-red-400',
    border: 'border-red-500/20',
  },
  {
    icon: BarChart2,
    title: 'Rapsodo Integration',
    desc: 'View your Rapsodo session data alongside your programming in one place.',
    color: 'from-cyan-500/20 to-cyan-600/5',
    iconColor: 'text-cyan-400',
    border: 'border-cyan-500/20',
  },
]

const STATS = [
  { value: '12', label: 'Week Programs' },
  { value: '6+', label: 'Metrics Tracked' },
  { value: '100%', label: 'Personalized' },
]

export default function LandingPage() {
  const { logout } = useAuth()

  // Sign out any existing session so every visit requires fresh credentials
  useEffect(() => { logout() }, [])

  return (
    <div className="min-h-screen bg-[#080c14] text-white overflow-x-hidden">

      {/* Background grid */}
      <div className="fixed inset-0 pointer-events-none" style={{
        backgroundImage: 'linear-gradient(rgba(59,91,219,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(59,91,219,0.06) 1px, transparent 1px)',
        backgroundSize: '60px 60px',
      }} />

      {/* Glow orbs */}
      <div className="fixed top-[-200px] left-1/2 -translate-x-1/2 w-[800px] h-[800px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(59,91,219,0.15) 0%, transparent 70%)' }} />
      <div className="fixed bottom-[-100px] right-[-100px] w-[500px] h-[500px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(59,91,219,0.08) 0%, transparent 70%)' }} />

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-6 py-5 max-w-7xl mx-auto">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #3b5bdb, #2541b0)' }}>
            <svg viewBox="0 0 24 24" className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
              <path d="M2 12h20"/>
            </svg>
          </div>
          <span className="font-extrabold text-lg tracking-tight">Superior Performance</span>
        </div>
        <Link
          to="/login"
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-xl border border-white/10 hover:border-white/25 hover:bg-white/5 transition-all"
        >
          Sign In <ArrowRight size={14} />
        </Link>
      </nav>

      {/* Hero */}
      <section className="relative z-10 px-6 pt-16 pb-32 max-w-7xl mx-auto text-center">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-brand-500/30 bg-brand-500/10 text-xs font-semibold text-brand-300 mb-10 tracking-wider uppercase">
          <span className="w-1.5 h-1.5 bg-brand-400 rounded-full animate-pulse" />
          Elite Pitcher Development
        </div>

        {/* Headline */}
        <h1 className="text-6xl sm:text-7xl lg:text-8xl font-extrabold tracking-tighter leading-none mb-6">
          <span className="block text-white">Train Like</span>
          <span className="block" style={{
            background: 'linear-gradient(90deg, #6b8cff 0%, #3b5bdb 40%, #a78bfa 100%)',
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
            className="group flex items-center gap-2.5 px-7 py-4 font-bold rounded-2xl text-sm transition-all shadow-lg"
            style={{ background: 'linear-gradient(135deg, #3b5bdb, #2541b0)', boxShadow: '0 0 40px rgba(59,91,219,0.4)' }}
          >
            Access Your Program
            <ChevronRight size={16} className="group-hover:translate-x-0.5 transition-transform" />
          </Link>
          <a
            href="#features"
            className="flex items-center gap-2 px-7 py-4 text-sm font-semibold text-white/60 hover:text-white transition-colors"
          >
            See how it works
          </a>
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
      </section>

      {/* Features */}
      <section id="features" className="relative z-10 px-6 pb-28 max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <p className="text-brand-400 text-xs font-bold uppercase tracking-widest mb-3">The Platform</p>
          <h2 className="text-4xl font-extrabold tracking-tight mb-4">Everything your development needs.</h2>
          <p className="text-white/40 max-w-md mx-auto">One app. Your program, your data, your coach — all connected.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map(({ icon: Icon, title, desc, color, iconColor, border }) => (
            <div
              key={title}
              className={`group relative rounded-2xl border ${border} bg-gradient-to-br ${color} p-6 hover:scale-[1.02] transition-all duration-200 cursor-default overflow-hidden`}
            >
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                style={{ background: 'radial-gradient(circle at 50% 0%, rgba(255,255,255,0.03), transparent 70%)' }} />
              <div className={`w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center mb-4 ${iconColor}`}>
                <Icon size={19} />
              </div>
              <h3 className="font-bold text-white mb-2">{title}</h3>
              <p className="text-white/45 text-sm leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* About / Coach */}
      <section className="relative z-10 px-6 pb-28 max-w-7xl mx-auto">
        <div className="relative rounded-3xl overflow-hidden border border-white/10 p-10 sm:p-16"
          style={{ background: 'linear-gradient(135deg, rgba(59,91,219,0.15) 0%, rgba(8,12,20,0.8) 60%)' }}>
          {/* Accent line */}
          <div className="absolute top-0 left-0 right-0 h-px"
            style={{ background: 'linear-gradient(90deg, transparent, rgba(59,91,219,0.8), transparent)' }} />

          <div className="flex flex-col lg:flex-row gap-10 items-start">
            <div className="flex-shrink-0">
              <div className="w-20 h-20 rounded-2xl flex items-center justify-center text-3xl font-black"
                style={{ background: 'linear-gradient(135deg, #3b5bdb, #2541b0)' }}>
                SP
              </div>
            </div>
            <div className="flex-1">
              <p className="text-brand-400 text-xs font-bold uppercase tracking-widest mb-3">The Method</p>
              <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-6 leading-tight">
                Not a template.<br />
                <span className="text-white/40">Your program.</span>
              </h2>
              <p className="text-white/55 leading-relaxed max-w-2xl mb-4">
                Every athlete who trains with Superior Performance goes through a full assessment — grip strength, shoulder mobility, sprint time, and baseline velo. That data drives the program. No two programs are the same because no two athletes are the same.
              </p>
              <p className="text-white/55 leading-relaxed max-w-2xl mb-8">
                Inside the platform you get your full weekly schedule, a direct line to your coach, and real-time tracking of every metric that matters. This is what elite development looks like.
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <Link
                  to="/login"
                  className="inline-flex items-center gap-2 px-6 py-3 font-bold text-sm rounded-xl transition-all"
                  style={{ background: 'linear-gradient(135deg, #3b5bdb, #2541b0)', boxShadow: '0 0 30px rgba(59,91,219,0.3)' }}
                >
                  Sign In <ChevronRight size={15} />
                </Link>
                <a
                  href="mailto:jcdeakins@gmail.com"
                  className="inline-flex items-center gap-2 px-6 py-3 font-semibold text-sm rounded-xl border border-white/10 text-white/60 hover:text-white hover:border-white/25 transition-all"
                >
                  Get started
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Banner */}
      <section className="relative z-10 px-6 pb-28 max-w-7xl mx-auto">
        <div className="text-center">
          <h2 className="text-5xl sm:text-6xl font-extrabold tracking-tighter mb-6">
            Ready to<br />
            <span style={{
              background: 'linear-gradient(90deg, #6b8cff, #a78bfa)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}>level up?</span>
          </h2>
          <p className="text-white/40 mb-8 max-w-sm mx-auto">Your program is waiting. Sign in to get started.</p>
          <Link
            to="/login"
            className="inline-flex items-center gap-2.5 px-8 py-4 font-bold rounded-2xl text-sm transition-all"
            style={{ background: 'linear-gradient(135deg, #3b5bdb, #2541b0)', boxShadow: '0 0 60px rgba(59,91,219,0.35)' }}
          >
            Access Your Program <ChevronRight size={16} />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/5 px-6 py-8 max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #3b5bdb, #2541b0)' }}>
            <svg viewBox="0 0 24 24" className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
              <path d="M2 12h20"/>
            </svg>
          </div>
          <span className="font-bold text-sm text-white/50">Superior Performance</span>
        </div>
        <div className="flex items-center gap-6 text-white/25 text-sm">
          <a href="mailto:jcdeakins@gmail.com" className="hover:text-white/60 transition">Contact</a>
          <Link to="/login" className="hover:text-white/60 transition">Sign In</Link>
        </div>
        <p className="text-white/15 text-xs">© {new Date().getFullYear()} Superior Performance</p>
      </footer>

    </div>
  )
}
