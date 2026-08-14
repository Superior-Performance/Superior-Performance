import { Outlet, NavLink } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { Users, LayoutList, MessageCircle, LogOut, Settings } from 'lucide-react'

const NAV = [
  { to: '/admin/athletes', label: 'Athletes',  Icon: Users         },
  { to: '/admin/programs', label: 'Programs',  Icon: LayoutList    },
  { to: '/admin/chat',     label: 'Messages',  Icon: MessageCircle },
  { to: '/admin/settings', label: 'Settings',  Icon: Settings      },
]

export default function AdminLayout() {
  const { userProfile, logout } = useAuth()

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="surface-brand relative overflow-hidden w-56 text-white flex flex-col flex-shrink-0">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(circle at 20% 0%, rgba(107,140,255,0.2), transparent 55%)' }}
        />
        <div className="relative px-5 py-6 border-b border-white/10">
          <div className="flex items-center gap-2.5 mb-3">
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
            <span className="font-bold text-sm tracking-tight">Superior Performance</span>
          </div>
          <p className="text-white/40 text-xs">Admin Console</p>
        </div>

        <nav className="relative flex-1 px-3 py-4 space-y-1">
          {NAV.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition ${
                  isActive
                    ? 'bg-white/15 text-white'
                    : 'text-white/60 hover:text-white hover:bg-white/10'
                }`
              }
            >
              <Icon size={17} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="relative px-3 py-4 border-t border-white/10">
          <div className="flex items-center gap-2 px-3 py-2 mb-2">
            <div className="w-7 h-7 rounded-full bg-brand-500 flex items-center justify-center text-xs font-bold">
              {userProfile?.name?.charAt(0) || 'A'}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium truncate">{userProfile?.name || 'Admin'}</p>
              <p className="text-[10px] text-white/40">Administrator</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="flex items-center gap-2 w-full px-3 py-2 text-white/50 hover:text-white text-sm rounded-xl hover:bg-white/10 transition"
          >
            <LogOut size={15} />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  )
}
