import { useEffect, useState } from 'react'
import { Clock, Save } from 'lucide-react'
import api from '../../utils/api'
import toast from 'react-hot-toast'

const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

export default function Schedule() {
  const [schedule, setSchedule] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.get('/schedule').then(r => setSchedule(r.data.schedule)).catch(() => toast.error('Error')).finally(() => setLoading(false))
  }, [])

  const update = (idx, field, value) => {
    setSchedule(prev => prev.map((d, i) => i === idx ? { ...d, [field]: value } : d))
  }

  const save = async () => {
    setSaving(true)
    try {
      await api.put('/schedule', { schedule })
      toast.success('Horario actualizado')
    } catch { toast.error('Error guardando') }
    finally { setSaving(false) }
  }

  if (loading) return <div className="flex justify-center h-48 items-center"><div className="w-8 h-8 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin" /></div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-gray-900">Horarios</h1>
          <p className="text-gray-500 text-sm mt-1">Configura los días y horarios de atención</p>
        </div>
        <button onClick={save} disabled={saving} className="btn-primary">
          <Save className="w-4 h-4" /> {saving ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </div>

      <div className="card">
        <div className="space-y-1">
          {schedule.map((day, i) => (
            <div key={day.day_of_week} className={`flex items-center gap-4 p-4 rounded-xl transition-colors ${day.is_open ? 'hover:bg-gray-50' : 'opacity-50'}`}>
              <label className="flex items-center gap-3 w-36 cursor-pointer">
                <div className="relative">
                  <input type="checkbox" checked={day.is_open} onChange={e => update(i, 'is_open', e.target.checked)} className="sr-only" />
                  <div className={`w-10 h-6 rounded-full transition-colors ${day.is_open ? 'bg-brand-600' : 'bg-gray-200'}`}>
                    <div className={`w-4 h-4 bg-white rounded-full m-1 transition-transform shadow-sm ${day.is_open ? 'translate-x-4' : ''}`} />
                  </div>
                </div>
                <span className="text-sm font-medium text-gray-800">{DAYS[day.day_of_week]}</span>
              </label>
              {day.is_open ? (
                <div className="flex items-center gap-3 flex-1">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-gray-400" />
                    <input type="time" className="input w-32 text-sm" value={day.open_time?.slice(0,5)}
                      onChange={e => update(i, 'open_time', e.target.value)} />
                  </div>
                  <span className="text-gray-400 text-sm">a</span>
                  <input type="time" className="input w-32 text-sm" value={day.close_time?.slice(0,5)}
                    onChange={e => update(i, 'close_time', e.target.value)} />
                </div>
              ) : (
                <span className="text-sm text-gray-400 italic">Cerrado</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
