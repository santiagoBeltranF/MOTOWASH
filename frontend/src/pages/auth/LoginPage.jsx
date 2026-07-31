import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bike, Mail, Lock, Eye, EyeOff, ArrowRight } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuthStore } from '../../store/authStore'

export default function LoginPage() {
  const [form, setForm] = useState({ email: '', password: '' })
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const { login } = useAuthStore()
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const result = await login(form.email, form.password)
      if (result.requires2FA) {
        toast.success('Código enviado a tu correo')
        navigate('/verify-2fa')
      } else {
        // Cada rol a su panel. Antes iba siempre a /admin y era la guarda de
        // ruta la que rebotaba a los clientes, con un parpadeo por el camino.
        navigate(result.user?.role === 'admin' ? '/admin' : '/client', { replace: true })
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error al iniciar sesión')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 via-white to-blue-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-brand-600 rounded-2xl shadow-lg shadow-brand-200 mb-4">
            <Bike className="w-9 h-9 text-white" />
          </div>
          <h1 className="font-display text-2xl font-bold text-gray-900">MotoWash</h1>
          <p className="text-gray-500 text-sm mt-1">Sistema de Agendamiento Profesional</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-xl shadow-gray-100 border border-gray-100 p-8">
          <h2 className="font-display text-xl font-semibold text-gray-900 mb-6">Iniciar sesión</h2>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="label" htmlFor="login-email">Correo electrónico</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input id="login-email"
                  type="email" required autoComplete="email"
                  className="input pl-10"
                  placeholder="correo@ejemplo.com"
                  value={form.email}
                  onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                />
              </div>
            </div>

            <div>
              <label className="label" htmlFor="login-password">Contraseña</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input id="login-password"
                  type={showPass ? 'text' : 'password'} required autoComplete="current-password"
                  className="input pl-10 pr-10"
                  placeholder="••••••••"
                  value={form.password}
                  onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                />
                <button type="button" onClick={() => setShowPass(p => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button type="submit" disabled={loading}
              className="btn-primary w-full py-3 text-base mt-2">
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Iniciando sesión...
                </span>
              ) : (
                <span className="flex items-center gap-2">Continuar <ArrowRight className="w-4 h-4" /></span>
              )}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-gray-100">
            <p className="text-center text-sm text-gray-500">
              ¿No tienes cuenta?{' '}
              <a href="/register" className="text-brand-600 font-medium hover:text-brand-700">Regístrate</a>
            </p>
          </div>

          <div className="mt-4 p-3 bg-brand-50 rounded-lg border border-brand-100">
            <p className="text-xs text-brand-700 text-center font-medium">
              🔐 Recibirás un código de verificación en tu correo
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
