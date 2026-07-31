import { useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { Bike, LayoutDashboard, Wrench, Calendar, Clock, Tag, Users, BarChart3, Settings, LogOut, Menu, X, ChevronRight } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'

// `soloAdmin` marca lo que el cajero no debe ver: configuración, servicios,
// promociones, horarios y reportes del negocio.
const navItems = [
  { to: '/admin/dashboard', icon: LayoutDashboard, label: 'Dashboard', soloAdmin: true },
  { to: '/admin/services', icon: Wrench, label: 'Servicios', soloAdmin: true },
  { to: '/admin/schedule', icon: Clock, label: 'Horarios', soloAdmin: true },
  { to: '/admin/appointments', icon: Calendar, label: 'Citas' },
  { to: '/admin/promotions', icon: Tag, label: 'Promociones', soloAdmin: true },
  { to: '/admin/clients', icon: Users, label: 'Clientes' },
  { to: '/admin/reports', icon: BarChart3, label: 'Reportes', soloAdmin: true },
  { to: '/admin/settings', icon: Settings, label: 'Configuración', soloAdmin: true },
]

export default function AdminLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { user, logout } = useAuthStore()

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-100 shadow-lg transform transition-transform duration-300 lg:translate-x-0 lg:static lg:shadow-none ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center gap-3 px-6 py-5 border-b border-gray-100">
            <div className="w-9 h-9 bg-brand-600 rounded-xl flex items-center justify-center shadow-md shadow-brand-200">
              <Bike className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="font-display font-bold text-gray-900 leading-tight">MotoWash</p>
              <p className="text-xs text-gray-400">{user?.role === 'cashier' ? 'Caja' : 'Panel Admin'}</p>
            </div>
            <button onClick={() => setSidebarOpen(false)} className="ml-auto lg:hidden text-gray-400 hover:text-gray-600">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Nav */}
          <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
            {navItems.filter(i => !i.soloAdmin || user?.role === 'admin').map(({ to, icon: Icon, label }) => (
              <NavLink key={to} to={to}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 group ${
                    isActive ? 'bg-brand-50 text-brand-700' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`
                }
                onClick={() => setSidebarOpen(false)}>
                {({ isActive }) => (
                  <>
                    <Icon className={`w-4.5 h-4.5 ${isActive ? 'text-brand-600' : 'text-gray-400 group-hover:text-gray-600'}`} style={{width:'18px',height:'18px'}} />
                    {label}
                    {isActive && <ChevronRight className="ml-auto w-3.5 h-3.5 text-brand-400" />}
                  </>
                )}
              </NavLink>
            ))}
          </nav>

          {/* User */}
          <div className="px-3 py-4 border-t border-gray-100">
            <div className="flex items-center gap-3 px-3 py-2 rounded-lg">
              <div className="w-8 h-8 bg-brand-100 rounded-full flex items-center justify-center">
                <span className="text-xs font-semibold text-brand-700">{user?.name?.[0]?.toUpperCase()}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{user?.name}</p>
                <p className="text-xs text-gray-400 truncate">{user?.email}</p>
              </div>
            </div>
            <button onClick={logout}
              className="flex items-center gap-2 w-full px-3 py-2 mt-1 text-sm text-red-500 hover:bg-red-50 rounded-lg transition-colors">
              <LogOut className="w-4 h-4" /> Cerrar sesión
            </button>
          </div>
        </div>
      </aside>

      {/* Overlay mobile */}
      {sidebarOpen && <div className="fixed inset-0 z-40 bg-black/20 lg:hidden" onClick={() => setSidebarOpen(false)} />}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-white border-b border-gray-100 px-4 lg:px-8 py-4 flex items-center gap-4 sticky top-0 z-30">
          <button onClick={() => setSidebarOpen(true)} className="lg:hidden text-gray-500 hover:text-gray-700">
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex-1" />
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <span className="w-2 h-2 bg-emerald-400 rounded-full" />
            Sistema activo
          </div>
        </header>
        <main className="flex-1 p-4 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
