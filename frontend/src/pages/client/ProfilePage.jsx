import { useState } from 'react'
import { User, Mail, Phone, Lock, Save } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import api from '../../utils/api'
import toast from 'react-hot-toast'

export default function ProfilePage() {
  const { user } = useAuthStore()
  const [form, setForm] = useState({ name: user?.name || '', phone: user?.phone || '' })
  const [passForm, setPassForm] = useState({ current: '', new: '', confirm: '' })
  const [saving, setSaving] = useState(false)

  const saveProfile = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await api.put('/auth/profile', form)
      toast.success('Perfil actualizado')
    } catch (err) { toast.error(err.response?.data?.message || 'Error') }
    finally { setSaving(false) }
  }

  const savePassword = async (e) => {
    e.preventDefault()
    if (passForm.new !== passForm.confirm) { toast.error('Las contraseñas no coinciden'); return }
    try {
      await api.put('/auth/password', { currentPassword: passForm.current, newPassword: passForm.new })
      toast.success('Contraseña actualizada')
      setPassForm({ current: '', new: '', confirm: '' })
    } catch (err) { toast.error(err.response?.data?.message || 'Error') }
  }

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-bold text-gray-900">Mi perfil</h1>

      {/* Avatar */}
      <div className="card flex items-center gap-4">
        <div className="w-14 h-14 bg-brand-100 rounded-full flex items-center justify-center">
          <span className="text-xl font-display font-bold text-brand-700">{user?.name?.[0]?.toUpperCase()}</span>
        </div>
        <div>
          <p className="font-semibold text-gray-900">{user?.name}</p>
          <p className="text-sm text-gray-500">{user?.email}</p>
          <span className="badge-blue mt-1">Cliente</span>
        </div>
      </div>

      {/* Edit profile */}
      <div className="card">
        <h3 className="font-display font-semibold text-gray-900 mb-4">Información personal</h3>
        <form onSubmit={saveProfile} className="space-y-4">
          <div>
            <label className="label">Nombre completo</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input className="input pl-10" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="label">Correo electrónico</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input className="input pl-10 bg-gray-50" value={user?.email} disabled />
            </div>
          </div>
          <div>
            <label className="label">Teléfono</label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input className="input pl-10" placeholder="+57 300 000 0000" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} />
            </div>
          </div>
          <button type="submit" disabled={saving} className="btn-primary">
            <Save className="w-4 h-4" /> {saving ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </form>
      </div>

      {/* Change password */}
      <div className="card">
        <h3 className="font-display font-semibold text-gray-900 mb-4">Cambiar contraseña</h3>
        <form onSubmit={savePassword} className="space-y-4">
          {[['current', 'Contraseña actual'], ['new', 'Nueva contraseña'], ['confirm', 'Confirmar nueva contraseña']].map(([k, label]) => (
            <div key={k}>
              <label className="label">{label}</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input type="password" className="input pl-10" required minLength={8} value={passForm[k]}
                  onChange={e => setPassForm(p => ({ ...p, [k]: e.target.value }))} />
              </div>
            </div>
          ))}
          <button type="submit" className="btn-primary">
            <Lock className="w-4 h-4" /> Actualizar contraseña
          </button>
        </form>
      </div>
    </div>
  )
}
