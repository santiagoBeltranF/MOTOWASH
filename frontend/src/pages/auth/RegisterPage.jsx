import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bike, Mail, Lock, User, Phone, Eye, EyeOff, ArrowLeft, ShieldCheck } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../utils/api'

export default function RegisterPage() {
  const [step, setStep] = useState(1)
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '', phone: '' })
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [tempToken, setTempToken] = useState(null)
  const [code, setCode] = useState(['', '', '', '', '', ''])
  const inputs = useRef([])
  const navigate = useNavigate()

  const handleRegister = async (e) => {
    e.preventDefault()
    if (form.password !== form.confirm) { toast.error('Las contraseñas no coinciden'); return }
    if (form.password.length < 8) { toast.error('La contraseña debe tener al menos 8 caracteres'); return }
    setLoading(true)
    try {
      const res = await api.post('/auth/register', {
        name: form.name, email: form.email, password: form.password, phone: form.phone
      })
      setTempToken(res.data.tempToken)
      toast.success('¡Código enviado a tu correo!')
      setStep(2)
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error al registrarse')
    } finally { setLoading(false) }
  }

  const handleCodeChange = (i, val) => {
    if (!/^\d?$/.test(val)) return
    const newCode = [...code]
    newCode[i] = val
    setCode(newCode)
    if (val && i < 5) inputs.current[i + 1]?.focus()
    if (newCode.every(d => d !== '') && newCode.join('').length === 6) {
      handleVerify(newCode.join(''))
    }
  }

  const handleKeyDown = (i, e) => {
    if (e.key === 'Backspace' && !code[i] && i > 0) inputs.current[i - 1]?.focus()
  }

  const handleVerify = async (fullCode) => {
    setLoading(true)
    try {
      await api.post('/auth/verify-register', { tempToken, code: fullCode || code.join('') })
      toast.success('¡Cuenta creada! Ya puedes iniciar sesión')
      navigate('/login')
    } catch (err) {
      toast.error(err.response?.data?.message || 'Código incorrecto')
      setCode(['', '', '', '', '', ''])
      inputs.current[0]?.focus()
    } finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 via-white to-blue-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-brand-600 rounded-2xl shadow-lg shadow-brand-200 mb-4">
            <Bike className="w-9 h-9 text-white" />
          </div>
          <h1 className="font-display text-2xl font-bold text-gray-900">MotoWash</h1>
          <p className="text-gray-500 text-sm mt-1">{step === 1 ? 'Crea tu cuenta gratis' : 'Verifica tu correo'}</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl shadow-gray-100 border border-gray-100 p-8">
          {step === 1 ? (
            <>
              <h2 className="font-display text-xl font-semibold text-gray-900 mb-6">Crear cuenta</h2>
              <form onSubmit={handleRegister} className="space-y-4">
                <div>
                  <label className="label">Nombre completo</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input type="text" required className="input pl-10" placeholder="Tu nombre completo"
                      value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
                  </div>
                </div>
                <div>
                  <label className="label">Correo electrónico</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input type="email" required className="input pl-10" placeholder="correo@ejemplo.com"
                      value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
                  </div>
                </div>
                <div>
                  <label className="label">Teléfono (opcional)</label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input type="tel" className="input pl-10" placeholder="+57 300 000 0000"
                      value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} />
                  </div>
                </div>
                <div>
                  <label className="label">Contraseña</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input type={showPass ? 'text' : 'password'} required className="input pl-10 pr-10"
                      placeholder="Mínimo 8 caracteres" value={form.password}
                      onChange={e => setForm(p => ({ ...p, password: e.target.value }))} />
                    <button type="button" onClick={() => setShowPass(p => !p)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="label">Confirmar contraseña</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input type={showPass ? 'text' : 'password'} required className="input pl-10"
                      placeholder="Repite tu contraseña" value={form.confirm}
                      onChange={e => setForm(p => ({ ...p, confirm: e.target.value }))} />
                  </div>
                </div>
                <button type="submit" disabled={loading} className="btn-primary w-full py-3 text-base mt-2">
                  {loading ? 'Enviando código...' : 'Crear cuenta'}
                </button>
              </form>
              <div className="mt-6 pt-6 border-t border-gray-100">
                <button onClick={() => navigate('/login')}
                  className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mx-auto">
                  <ArrowLeft className="w-4 h-4" /> Ya tengo cuenta
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-center w-12 h-12 bg-brand-50 rounded-xl mx-auto mb-4">
                <ShieldCheck className="w-6 h-6 text-brand-600" />
              </div>
              <h2 className="font-display text-xl font-semibold text-gray-900 text-center mb-2">Verifica tu correo</h2>
              <p className="text-gray-500 text-sm text-center mb-2">Ingresa el código de 6 dígitos que enviamos a</p>
              <p className="text-brand-600 font-medium text-sm text-center mb-8">{form.email}</p>

              <div className="flex gap-2 justify-center mb-8">
                {code.map((d, i) => (
                  <input key={i} ref={el => inputs.current[i] = el}
                    type="text" inputMode="numeric" maxLength={1} value={d}
                    onChange={e => handleCodeChange(i, e.target.value)}
                    onKeyDown={e => handleKeyDown(i, e)}
                    className="w-12 h-14 text-center text-xl font-display font-semibold border-2 border-gray-200 rounded-xl focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 transition-all" />
                ))}
              </div>

              <button onClick={() => handleVerify()} disabled={loading || code.some(d => !d)}
                className="btn-primary w-full py-3 text-base">
                {loading ? 'Verificando...' : 'Verificar y crear cuenta'}
              </button>

              <button onClick={() => { setStep(1); setCode(['','','','','','']) }}
                className="btn-ghost w-full justify-center mt-3 text-gray-500">
                <ArrowLeft className="w-4 h-4" /> Volver
              </button>

              <p className="text-xs text-center text-gray-400 mt-4">
                El código expira en 15 minutos
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}