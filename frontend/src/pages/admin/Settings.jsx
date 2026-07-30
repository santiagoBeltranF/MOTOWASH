import { useEffect, useState } from 'react'
import { Settings as SettingsIcon, Save } from 'lucide-react'
import api from '../../utils/api'
import toast from 'react-hot-toast'

export default function Settings() {
  const [settings, setSettings] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.get('/settings').then(r => {
      const flat = {}
      Object.entries(r.data.settings).forEach(([k, v]) => { flat[k] = v.value })
      setSettings(flat)
    }).catch(() => toast.error('Error')).finally(() => setLoading(false))
  }, [])

  const save = async () => {
    setSaving(true)
    try {
      await api.put('/settings', { settings })
      toast.success('Configuración guardada')
    } catch { toast.error('Error guardando') }
    finally { setSaving(false) }
  }

  const set = (k, v) => setSettings(p => ({ ...p, [k]: v }))

  if (loading) return <div className="flex justify-center items-center h-48"><div className="w-8 h-8 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin" /></div>

  const sections = [
    {
      title: 'Información del negocio',
      fields: [
        { key: 'business_name', label: 'Nombre del negocio', type: 'text' },
        { key: 'business_phone', label: 'Teléfono', type: 'text' },
        { key: 'business_address', label: 'Dirección', type: 'text' },
      ]
    },
    {
      title: 'Configuración de citas',
      fields: [
        { key: 'appointment_interval_minutes', label: 'Intervalo entre citas (minutos)', type: 'number' },
        { key: 'max_appointments_per_slot', label: 'Citas simultáneas por horario', type: 'number' },
      ]
    },
    {
      title: 'Moneda',
      fields: [
        { key: 'currency', label: 'Código de moneda (Ej: COP, USD)', type: 'text' },
        { key: 'currency_symbol', label: 'Símbolo ($, €...)', type: 'text' },
      ]
    }
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-gray-900">Configuración</h1>
          <p className="text-gray-500 text-sm mt-1">Ajustes generales del sistema</p>
        </div>
        <button onClick={save} disabled={saving} className="btn-primary">
          <Save className="w-4 h-4" /> {saving ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </div>

      <div className="space-y-6">
        {sections.map(section => (
          <div key={section.title} className="card">
            <h3 className="font-display font-semibold text-gray-900 mb-5 flex items-center gap-2">
              <SettingsIcon className="w-4 h-4 text-brand-500" /> {section.title}
            </h3>
            <div className="grid sm:grid-cols-2 gap-4">
              {section.fields.map(f => (
                <div key={f.key}>
                  <label className="label">{f.label}</label>
                  <input type={f.type} className="input" value={settings[f.key] || ''}
                    onChange={e => set(f.key, e.target.value)} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
