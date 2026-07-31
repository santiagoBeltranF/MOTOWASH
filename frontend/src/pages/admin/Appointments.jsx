import { useEffect, useState } from 'react'
import { Calendar, Search, CheckCircle, XCircle, Clock } from 'lucide-react'
import api from '../../utils/api'
import Paginacion from '../../components/Paginacion'
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

    return format(dateObj, "d MMM yyyy", { locale: es });
  } catch (error) {
    return 'Error';
  }
};

export default function Appointments() {
  const [appointments, setAppointments] = useState([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ status: '', date: '' })
  const [pagina, setPagina] = useState(1)
  const [meta, setMeta] = useState({ total: 0, totalPages: 1, limit: 20 })

  const load = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filters.status) params.set('status', filters.status)
      if (filters.date) params.set('date', filters.date)
      params.set('page', pagina)
      const res = await api.get(`/appointments?${params}`)
      setAppointments(res.data.appointments ?? [])
      setMeta({ total: res.data.total ?? 0, totalPages: res.data.totalPages ?? 1, limit: res.data.limit ?? 20 })
    } catch { toast.error('Error cargando citas') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [filters, pagina])
  // Cambiar de filtro devuelve a la primera pagina: quedarse en la 7 de un
  // listado que ahora tiene 2 mostraria una tabla vacia sin explicacion.
  useEffect(() => { setPagina(1) }, [filters.status, filters.date])

  // Captura el mensaje dinámico de error del servidor para mostrarlo en pantalla
  const updateStatus = async (id, status) => {
    try {
      await api.patch(`/appointments/${id}/status`, { status })
      toast.success('Estado actualizado')
      load()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error actualizando')
    }
  }

  const cancel = async (id) => {
    if (!confirm('¿Cancelar esta cita?')) return
    try { await api.patch(`/appointments/${id}/cancel`); toast.success('Cita cancelada'); load() }
    catch (err) { toast.error(err.response?.data?.message || 'Error') }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-gray-900">Citas</h1>
        <p className="text-gray-500 text-sm mt-1">Gestión de todas las citas agendadas</p>
      </div>

      <div className="card">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="label" htmlFor="citas-estado">Estado</label>
            <select id="citas-estado" className="input" value={filters.status} onChange={e => setFilters(p => ({ ...p, status: e.target.value }))}>
              <option value="">Todos</option>
              <option value="confirmed">Confirmada</option>
              <option value="completed">Completada</option>
              <option value="cancelled">Cancelada</option>
              <option value="pending">Pendiente</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="citas-fecha">Fecha</label>
            <input id="citas-fecha" type="date" className="input" value={filters.date} onChange={e => setFilters(p => ({ ...p, date: e.target.value }))} />
          </div>
        </div>
      </div>

      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="flex justify-center items-center h-48"><div className="w-8 h-8 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="table-th">Cliente</th>
                  <th className="table-th">Servicio</th>
                  <th className="table-th">Fecha y hora</th>
                  <th className="table-th">Estado</th>
                  <th className="table-th">Precio</th>
                  <th className="table-th">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {appointments.map(a => (
                  <tr key={a.id} className="table-tr">
                    <td className="table-td">
                      <div className="font-medium">{a.client_name}</div>
                      <div className="text-xs text-gray-400">{a.client_phone}</div>
                    </td>
                    <td className="table-td">{a.service_name}</td>
                    <td className="table-td">
                      <div className="font-medium">{formatAppointmentDate(a.appointment_date)}</div>
                      <div className="text-xs text-gray-400">{a.start_time?.slice(0,5)} - {a.end_time?.slice(0,5)}</div>
                    </td>
                    <td className="table-td"><span className={statusBadge[a.status]}>{statusLabel[a.status]}</span></td>
                    <td className="table-td font-semibold text-brand-700">${Number(a.final_price || 0).toLocaleString('es-CO')}</td>
                    <td className="table-td">
                      <div className="flex gap-1">
                        {/* Botón para marcar como completada (pasa directamente a 'completed' con etiqueta verde) */}
                        {(a.status === 'pending' || a.status === 'confirmed') && (
                          <button onClick={() => updateStatus(a.id, 'completed')} title="Marcar como realizada"
                            className="p-1.5 hover:bg-emerald-50 text-gray-400 hover:text-emerald-600 rounded-lg transition-colors">
                            <CheckCircle className="w-4 h-4" />
                          </button>
                        )}
                        {/* Botón para cancelar (disponible para pendientes y confirmadas) */}
                        {a.status !== 'cancelled' && a.status !== 'completed' && (
                          <button onClick={() => cancel(a.id)} title="Cancelar"
                            className="p-1.5 hover:bg-red-50 text-gray-400 hover:text-red-500 rounded-lg transition-colors">
                            <XCircle className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {!appointments.length && (
                  <tr><td colSpan={6} className="table-td text-center text-gray-400 py-12">No hay citas para mostrar</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        {!loading && (
          <Paginacion page={pagina} totalPages={meta.totalPages} total={meta.total} limit={meta.limit}
            onChange={setPagina} etiqueta="citas" />
        )}
      </div>
    </div>
  )
}