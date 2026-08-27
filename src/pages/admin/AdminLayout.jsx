import { useState } from 'react'
import { Outlet, NavLink } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { Users, LayoutList, MessageCircle, LogOut, Settings, Menu, X } from 'lucide-react'
import Logo from '../../components/Logo'

const NAV = [
  { to: '/admin/athletes', label: 'Athletes',  Icon: Users         },
  { to: '/admin/programs', label: 'Programs',  Icon: LayoutList    },
  { to: '/admin/chat',     label: 'Messages',  Icon: MessageCircle },
  { to: '/admin/settings', label: 'Settings',  Icon: Settings      },
]

export default function AdminLayout() {
  const { userProfile, logout } = useAuth()
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="md:flex h-screen bg-sp-ink-900 [color-scheme:dark]">
      {/* Mobile top bar */}
      <div className="md:hidden surface-brand relative overflow-hidden flex items-center justify-between px-4 h-14 text-white">
        <div className="relative flex items-center gap-2.5">
          <Logo variant="icon" className="h-7 w-7 flex-shrink-0" />
          <span className="font-bold text-sm tracking-tight">Superior Performance</span>
        </div>
        <button
          onClick={() => setMobileOpen(true)}
          className="relative p-2 -mr-2 rounded-lg hover:bg-white/10 transition"
          aria-label="Open menu"
        >
          <Menu size={20} />
        </button>
      </div>

      {/* Backdrop (mobile only) */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`surface-brand overflow-hidden w-64 md:w-56 text-white flex flex-col flex-shrink-0
          fixed md:static inset-y-0 left-0 z-50 transition-transform duration-200 ease-out
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}
      >
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(circle at 20% 0%, rgba(46,158,99,0.2), transparent 55%)' }}
        />
        <div className="relative px-5 py-6 border-b border-white/10 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2.5 mb-3">
              <Logo variant="icon" className="h-8 w-8 flex-shrink-0" />
              <span className="font-bold text-sm tracking-tight">Superior Performance</span>
            </div>
            <p className="text-white/40 text-xs">Admin Console</p>
          </div>
          <button
            onClick={() => setMobileOpen(false)}
            className="md:hidden p-1.5 -mt-1 -mr-1 rounded-lg hover:bg-white/10 transition"
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="relative flex-1 px-3 py-4 space-y-1">
          {NAV.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setMobileOpen(false)}
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
            <div className="w-7 h-7 rounded-full bg-sp-green-500 flex items-center justify-center text-xs font-bold">
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
