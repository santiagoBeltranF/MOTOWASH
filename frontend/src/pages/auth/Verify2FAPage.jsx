import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bike, ShieldCheck, ArrowLeft } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuthStore } from '../../store/authStore'

export default function Verify2FAPage() {
  const [code, setCode] = useState(['', '', '', '', '', ''])
  const [loading, setLoading] = useState(false)
  const inputs = useRef([])
  const { verify2FA } = useAuthStore()
  const navigate = useNavigate()

  const handleChange = (i, val) => {
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
      await verify2FA(fullCode || code.join(''))
      toast.success('¡Bienvenido!')
      navigate('/admin')
    } catch (err) {
      toast.error(err.response?.data?.message || 'Código incorrecto')
      setCode(['', '', '', '', '', ''])
      inputs.current[0]?.focus()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 via-white to-blue-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-brand-600 rounded-2xl shadow-lg shadow-brand-200 mb-4">
            <Bike className="w-9 h-9 text-white" />
          </div>
          <h1 className="font-display text-2xl font-bold text-gray-900">MotoWash</h1>
        </div>

        <div className="bg-white rounded-2xl shadow-xl shadow-gray-100 border border-gray-100 p-8">
          <div className="flex items-center justify-center w-12 h-12 bg-brand-50 rounded-xl mx-auto mb-4">
            <ShieldCheck className="w-6 h-6 text-brand-600" />
          </div>
          <h2 className="font-display text-xl font-semibold text-gray-900 text-center mb-2">Verificación en dos pasos</h2>
          <p className="text-gray-500 text-sm text-center mb-8">Ingresa el código de 6 dígitos que enviamos a tu correo</p>

          <div className="flex gap-2 justify-center mb-8">
            {code.map((d, i) => (
              <input key={i}
                ref={el => inputs.current[i] = el}
                type="text" inputMode="numeric" maxLength={1}
                value={d}
                onChange={e => handleChange(i, e.target.value)}
                onKeyDown={e => handleKeyDown(i, e)}
                className="w-12 h-14 text-center text-xl font-display font-semibold border-2 border-gray-200 rounded-xl focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 transition-all"
              />
            ))}
          </div>

          <button onClick={() => handleVerify()} disabled={loading || code.some(d => !d)}
            className="btn-primary w-full py-3 text-base">
            {loading ? 'Verificando...' : 'Verificar código'}
          </button>

          <button onClick={() => navigate('/login')}
            className="btn-ghost w-full justify-center mt-3 text-gray-500">
            <ArrowLeft className="w-4 h-4" /> Volver al inicio
          </button>
        </div>
      </div>
    </div>
  )
}
