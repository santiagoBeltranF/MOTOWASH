import { Outlet, NavLink } from 'react-router-dom'
import { CalendarPlus, CalendarCheck, User, Bike, LogOut } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'

const navItems = [
  { to: '/client/book', icon: CalendarPlus, label: 'Agendar' },
  { to: '/client/appointments', icon: CalendarCheck, label: 'Mis citas' },
  { to: '/client/profile', icon: User, label: 'Perfil' },
]

export default function ClientLayout() {
  const { user, logout } = useAuthStore()

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 px-4 py-4 sticky top-0 z-30">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-brand-600 rounded-xl flex items-center justify-center shadow-md shadow-brand-200">
              <Bike className="w-4 h-4 text-white" />
            </div>
            <span className="font-display font-bold text-gray-900">MotoWash</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500 hidden sm:block">{user?.name}</span>
            <button onClick={logout} className="p-2 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-red-500 transition-colors">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-6 pb-24">
        <Outlet />
      </main>

      {/* Bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 safe-area-bottom z-30">
        <div className="max-w-2xl mx-auto flex">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink key={to} to={to} className={({ isActive }) =>
              `flex-1 flex flex-col items-center gap-1 py-3 text-xs font-medium transition-colors ${isActive ? 'text-brand-600' : 'text-gray-400 hover:text-gray-600'}`
            }>
              {({ isActive }) => (
                <>
                  <Icon className={`w-5 h-5 ${isActive ? 'text-brand-600' : ''}`} />
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
