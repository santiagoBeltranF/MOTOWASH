import { useEffect, useState } from 'react'
import { Users, Calendar, DollarSign, Clock, TrendingUp, ArrowUpRight } from 'lucide-react'
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

    return format(dateObj, 'd MMM', { locale: es });
  } catch (error) {
    return 'Error';
  }
};

export default function Dashboard() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/reports/dashboard').then(r => setData(r.data)).catch(() => toast.error('Error cargando dashboard')).finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin" /></div>
  if (!data) return null

  const stats = [
    { label: 'Clientes registrados', value: data.stats.totalClients, icon: Users, color: 'text-brand-600', bg: 'bg-brand-50' },
    { label: 'Citas este mes', value: data.stats.todayAppointments, icon: Calendar, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { label: 'Total citas', value: data.stats.totalAppointments, icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50' },
    { label: 'Ingresos totales', value: `$${Number(data.stats.totalRevenue || 0).toLocaleString('es-CO')}`, icon: DollarSign, color: 'text-purple-600', bg: 'bg-purple-50' },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 text-sm mt-1">{format(new Date(), "EEEE d 'de' MMMM 'de' yyyy", { locale: es })}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s, i) => (
          <div key={i} className="stat-card">
            <div className="flex items-center justify-between mb-3">
              <div className={`w-9 h-9 ${s.bg} rounded-xl flex items-center justify-center`}>
                <s.icon className={`w-5 h-5 ${s.color}`} />
              </div>
              <ArrowUpRight className="w-4 h-4 text-gray-300" />
            </div>
            <p className="text-2xl font-display font-bold text-gray-900">{s.value}</p>
            <p className="text-xs text-gray-500 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Recent appointments */}
        <div className="lg:col-span-2 card">
          <div className="flex items-center justify-between mb-5">
            <h3 className="font-display font-semibold text-gray-900">Citas recientes</h3>
            <a href="/admin/appointments" className="text-xs text-brand-600 hover:text-brand-700 font-medium">Ver todas →</a>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr className="border-b border-gray-100">
                <th className="table-th">Cliente</th>
                <th className="table-th">Servicio</th>
                <th className="table-th">Fecha</th>
                <th className="table-th">Estado</th>
                <th className="table-th">Precio</th>
              </tr></thead>
              <tbody>
                {data.recentAppointments.map(a => (
                  <tr key={a.id} className="table-tr">
                    <td className="table-td font-medium">{a.client}</td>
                    <td className="table-td text-gray-500">{a.service}</td>
                    <td className="table-td text-gray-500">
                      {formatAppointmentDate(a.appointment_date)} {a.start_time?.slice(0,5)}
                    </td>
                    <td className="table-td"><span className={statusBadge[a.status]}>{statusLabel[a.status]}</span></td>
                    <td className="table-td font-medium text-brand-700">${Number(a.final_price || 0).toLocaleString('es-CO')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Top services */}
        <div className="card">
          <h3 className="font-display font-semibold text-gray-900 mb-5">Servicios más solicitados</h3>
          <div className="space-y-3">
            {data.topServices.map((s, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="w-6 h-6 bg-brand-50 text-brand-700 rounded-full text-xs font-bold flex items-center justify-center">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{s.name}</p>
                  <p className="text-xs text-gray-400">{s.total} citas</p>
                </div>
                <span className="text-xs font-medium text-emerald-600">${Number(s.revenue || 0).toLocaleString('es-CO')}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}