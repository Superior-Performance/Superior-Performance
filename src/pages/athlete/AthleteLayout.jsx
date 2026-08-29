import { useRef, useState } from 'react'
import { Outlet, NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import {
  Flame, MessageCircle, TrendingUp, Activity, LogOut, UserCircle, ExternalLink, RefreshCw,
} from 'lucide-react'
import Logo from '../../components/Logo'

// Pull-to-refresh distance (px) needed to trigger a reload. Installed as a
// home-screen icon, the app has no browser chrome and no reload button —
// body already sets overscroll-behavior: none (see index.css) to stop the
// page from bouncing/showing blank space at scroll bounds, which as a side
// effect kills the native pull-to-refresh gesture too. This replaces it
// with our own, scoped to the one shared scroll container every athlete
// tab renders into (see <main> below) — not the Rapsodo tab, which is a
// separate always-mounted iframe <main> never contains.
const PULL_THRESHOLD = 70

// "Track" no longer gets its own tab — velo/weight PR logging moved into
// Progress alongside the rest of the long-term view. See ProgressPage.
const NAV = [
  { to: 'schedule', label: 'Today',    Icon: Flame         },
  { to: 'progress', label: 'Progress', Icon: TrendingUp    },
  { to: 'chat',     label: 'Chat',     Icon: MessageCircle },
  { to: 'rapsodo',  label: 'Rapsodo',  Icon: Activity      },
  { to: 'account',  label: 'Account',  Icon: UserCircle    },
]

export default function AthleteLayout() {
  const { userProfile, logout } = useAuth()
  const location = useLocation()
  const onRapsodo = location.pathname.includes('/rapsodo')

  const mainRef = useRef(null)
  const pullStartY = useRef(null)
  const [pullDistance, setPullDistance] = useState(0)
  const [refreshing, setRefreshing] = useState(false)

  // Only starts tracking a pull when already scrolled to the very top —
  // otherwise this is just a normal downward scroll and should do nothing.
  function handlePointerDown(e) {
    if (refreshing || mainRef.current?.scrollTop > 0) return
    pullStartY.current = e.clientY
  }
  function handlePointerMove(e) {
    if (pullStartY.current == null) return
    const delta = e.clientY - pullStartY.current
    if (delta <= 0) { setPullDistance(0); return }
    // Damped so it doesn't track 1:1 with the finger — reads as "pulling
    // against something" rather than the content just sliding freely.
    setPullDistance(Math.min(delta * 0.5, 100))
  }
  function handlePointerUp() {
    if (pullStartY.current == null) return
    if (pullDistance >= PULL_THRESHOLD) {
      setRefreshing(true)
      setPullDistance(PULL_THRESHOLD)
      window.location.reload()
    } else {
      setPullDistance(0)
    }
    pullStartY.current = null
  }

  return (
    <div className="flex flex-col min-h-screen bg-sp-ink-900">
      {/* Top header */}
      <header className="surface-brand relative overflow-hidden text-white px-4 pt-safe-top">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(circle at 15% 0%, rgba(46,158,99,0.25), transparent 60%)' }}
        />
        <div className="relative flex items-center justify-between h-14">
          <div className="flex items-center gap-2.5">
            <Logo variant="icon" className="h-8 w-8 flex-shrink-0" />
            <div>
              <p className="text-xs text-white/60 leading-none">Welcome back</p>
              <p className="font-bold leading-tight">{userProfile?.name || 'Athlete'}</p>
            </div>
          </div>
          {onRapsodo ? (
            <a
              href="https://cloud.rapsodo.com"
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-full hover:bg-white/10 transition"
              aria-label="Open Rapsodo in browser"
            >
              <ExternalLink size={18} />
            </a>
          ) : (
            <button
              onClick={logout}
              className="p-2 rounded-full hover:bg-white/10 transition"
              aria-label="Sign out"
            >
              <LogOut size={18} />
            </button>
          )}
        </div>
      </header>

      {/* Persistent Rapsodo iframe — always mounted so login session is preserved */}
      <div
        style={{ display: onRapsodo ? 'flex' : 'none' }}
        className="flex-col flex-1 pb-16"
      >
        <iframe
          src="https://cloud.rapsodo.com"
          title="Rapsodo Cloud"
          className="flex-1 w-full border-none"
          style={{ height: 'calc(100vh - 56px - 64px)' }}
        />
      </div>

      {/* All other page content */}
      <main
        ref={mainRef}
        className="flex-1 overflow-y-auto pb-20"
        style={{ display: onRapsodo ? 'none' : 'block' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {/* Pull-to-refresh indicator — height tracks the pull so content
            visibly pushes down, same as a native app's gesture. */}
        <div
          className="flex items-center justify-center overflow-hidden transition-[height] duration-150"
          style={{ height: pullDistance }}
        >
          {pullDistance > 8 && (
            <RefreshCw
              size={20}
              className={refreshing || pullDistance >= PULL_THRESHOLD ? 'text-sp-green-500 animate-spin' : 'text-sp-ink-300'}
              style={{
                transform: `rotate(${pullDistance * 2.5}deg)`,
                opacity: Math.min(pullDistance / PULL_THRESHOLD, 1),
              }}
            />
          )}
        </div>
        <Outlet />
      </main>

      {/* Bottom nav — stays dark across every tab, light or dark page content
          alike, so it reads as one consistent app chrome rather than
          flipping tone depending on which page is open. */}
      <nav className="fixed bottom-0 inset-x-0 bg-sp-ink-900 border-t border-sp-ink-600 safe-bottom z-50">
        <div className="flex px-1.5 py-1.5">
          {NAV.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex-1 flex flex-col items-center justify-center py-1.5 gap-0.5 rounded-xl mx-0.5 transition-colors ${
                  isActive ? 'bg-sp-green-500/15 text-sp-green-500' : 'text-sp-ink-300 hover:text-white'
                }`
              }
            >
              <Icon size={21} />
              <span className="text-[10px] font-medium">{label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
