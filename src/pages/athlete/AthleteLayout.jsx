import { Outlet, NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import {
  CalendarDays, MessageCircle, TrendingUp, BarChart2, Activity, LogOut, UserCircle, ExternalLink,
} from 'lucide-react'

const NAV = [
  { to: 'schedule', label: 'Schedule',  Icon: CalendarDays },
  { to: 'progress', label: 'Progress',  Icon: TrendingUp    },
  { to: 'data',     label: 'Track',     Icon: BarChart2     },
  { to: 'chat',     label: 'Chat',      Icon: MessageCircle },
  { to: 'rapsodo',  label: 'Rapsodo',   Icon: Activity      },
  { to: 'account',  label: 'Account',   Icon: UserCircle    },
]

export default function AthleteLayout() {
  const { userProfile, logout } = useAuth()
  const location = useLocation()
  const onRapsodo = location.pathname.includes('/rapsodo')

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      {/* Top header */}
      <header className="surface-brand relative overflow-hidden text-white px-4 pt-safe-top">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(circle at 15% 0%, rgba(107,140,255,0.25), transparent 60%)' }}
        />
        <div className="relative flex items-center justify-between h-14">
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, #3b5bdb, #2541b0)' }}
            >
              <svg viewBox="0 0 24 24" className="w-4.5 h-4.5 text-white" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                <path d="M2 12h20" />
              </svg>
            </div>
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
        className="flex-1 overflow-y-auto pb-20"
        style={{ display: onRapsodo ? 'none' : 'block' }}
      >
        <Outlet />
      </main>

      {/* Bottom nav */}
      <nav className="fixed bottom-0 inset-x-0 bg-white border-t border-gray-200 safe-bottom z-50">
        <div className="flex px-1.5 py-1.5">
          {NAV.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex-1 flex flex-col items-center justify-center py-1.5 gap-0.5 rounded-xl mx-0.5 transition-colors ${
                  isActive ? 'bg-brand-50 text-brand-600' : 'text-gray-400 hover:text-gray-600'
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
