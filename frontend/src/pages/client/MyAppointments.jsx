import { useEffect, useState } from 'react'
import { Calendar, Clock, XCircle } from 'lucide-react'
import api from '../../utils/api'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

const statusBadge = { pending: 'badge-yellow', confirmed: 'badge-blue', completed: 'badge-green', cancelled: 'badge-red' }
const statusLabel = { pending: 'Pendiente', confirmed: 'Confirmada', completed: 'Completada', cancelled: 'Cancelada' }

// Función para formatear la fecha de manera segura y evitar errores con zonas horarias
const formatAppointmentDate = (dateVal) => {
  if (!dateVal) return 'Sin fecha';

  try {
    // Si viene como un string ISO (contiene 'T'), extraemos solo la parte 'YYYY-MM-DD'
    const dateStr = typeof dateVal === 'string' && dateVal.includes('T')
      ? dateVal.split('T')[0]
      : dateVal;

    // Creamos la fecha local a medianoche para evitar desfases de zona horaria
    const dateObj = new Date(dateStr + 'T00:00:00');

    // Si la fecha sigue siendo inválida, retornamos un texto de respaldo
    if (isNaN(dateObj.getTime())) {
      return 'Fecha inválida';
    }

    return format(dateObj, "d 'de' MMMM yyyy", { locale: es });
  } catch (error) {
    return 'Error en fecha';
  }
};

export default function MyAppointments() {
  const [appointments, setAppointments] = useState([])
  const [loading, setLoading] = useState(true)

  const load = () => {
    setLoading(true)
    api.get('/appointments').then(r => setAppointments(r.data.appointments)).catch(() => toast.error('Error')).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const cancel = async (id) => {
    if (!confirm('¿Cancelar esta cita?')) return
    try { await api.patch(`/appointments/${id}/cancel`); toast.success('Cita cancelada'); load() }
    catch (err) { toast.error(err.response?.data?.message || 'Error') }
  }

  if (loading) return <div className="flex justify-center items-center h-48"><div className="w-8 h-8 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin" /></div>

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-bold text-gray-900">Mis citas</h1>
      {!appointments.length ? (
        <div className="text-center py-16 text-gray-400">
          <Calendar className="w-12 h-12 mx-auto mb-3 text-gray-200" />
          <p className="font-medium">No tienes citas aún</p>
          <p className="text-sm mt-1">Agenda tu primera cita en la sección "Agendar"</p>
        </div>
      ) : (
        <div className="space-y-3">
          {appointments.map(a => (
            <div key={a.id} className="card">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-gray-900">{a.service_name}</h3>
                  <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      {formatAppointmentDate(a.appointment_date)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      {a.start_time?.slice(0,5)}
                    </span>
                  </div>
                </div>
                <span className={statusBadge[a.status]}>{statusLabel[a.status]}</span>
              </div>
              <div className="flex items-center justify-between pt-3 border-t border-gray-50">
                <div>
                  <span className="font-display font-bold text-brand-700 text-lg">${Number(a.final_price || 0).toLocaleString('es-CO')}</span>
                  {a.discount_applied > 0 && <span className="ml-2 badge-green">{a.discount_applied}% desc.</span>}
                </div>
                {(a.status === 'confirmed' || a.status === 'pending') && (
                  <button onClick={() => cancel(a.id)}
                    className="flex items-center gap-1.5 text-xs text-red-500 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors font-medium">
                    <XCircle className="w-3.5 h-3.5" /> Cancelar
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}