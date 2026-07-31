import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/authStore'
import LoginPage from './pages/auth/LoginPage'
import Verify2FAPage from './pages/auth/Verify2FAPage'
import RegisterPage from './pages/auth/RegisterPage'
import AdminLayout from './pages/admin/AdminLayout'
import Dashboard from './pages/admin/Dashboard'
import Services from './pages/admin/Services'
import Schedule from './pages/admin/Schedule'
import Appointments from './pages/admin/Appointments'
import Caja from './pages/admin/Caja'
import Promotions from './pages/admin/Promotions'
import Clients from './pages/admin/Clients'
import Reports from './pages/admin/Reports'
import Settings from './pages/admin/Settings'
import ClientLayout from './pages/client/ClientLayout'
import BookPage from './pages/client/BookPage'
import MyAppointments from './pages/client/MyAppointments'
import ProfilePage from './pages/client/ProfilePage'

// El panel lo comparten admin y cajero; dentro, cada uno ve lo suyo.
export const esPersonal = (user) => user?.role === 'admin' || user?.role === 'cashier'
export const inicioDe = (user) => (esPersonal(user) ? '/admin' : '/client')

const PrivateRoute = ({ children, roles }) => {
  const { user, token } = useAuthStore()
  if (!token || !user) return <Navigate to="/login" replace />
  if (roles && !roles.includes(user.role)) return <Navigate to={inicioDe(user)} replace />
  return children
}

const GuestRoute = ({ children }) => {
  const { user } = useAuthStore()
  if (user) return <Navigate to={inicioDe(user)} replace />
  return children
}

export default function App() {
  const { init, loading } = useAuthStore()
  useEffect(() => { init() }, [])

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
        <p className="text-sm text-gray-500 font-sans">Cargando...</p>
      </div>
    </div>
  )

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<GuestRoute><LoginPage /></GuestRoute>} />
      <Route path="/register" element={<GuestRoute><RegisterPage /></GuestRoute>} />
      <Route path="/verify-2fa" element={<GuestRoute><Verify2FAPage /></GuestRoute>} />

      <Route path="/admin" element={<PrivateRoute roles={['admin', 'cashier']}><AdminLayout /></PrivateRoute>}>
        <Route index element={<Navigate to="/admin/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="services" element={<PrivateRoute roles={['admin']}><Services /></PrivateRoute>} />
        <Route path="schedule" element={<PrivateRoute roles={['admin']}><Schedule /></PrivateRoute>} />
        <Route path="appointments" element={<Appointments />} />
        <Route path="cash" element={<Caja />} />
        <Route path="promotions" element={<PrivateRoute roles={['admin']}><Promotions /></PrivateRoute>} />
        <Route path="clients" element={<Clients />} />
        <Route path="reports" element={<PrivateRoute roles={['admin']}><Reports /></PrivateRoute>} />
        <Route path="settings" element={<PrivateRoute roles={['admin']}><Settings /></PrivateRoute>} />
      </Route>

      <Route path="/client" element={<PrivateRoute roles={['client']}><ClientLayout /></PrivateRoute>}>
        <Route index element={<Navigate to="/client/book" replace />} />
        <Route path="book" element={<BookPage />} />
        <Route path="appointments" element={<MyAppointments />} />
        <Route path="profile" element={<ProfilePage />} />
      </Route>

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}