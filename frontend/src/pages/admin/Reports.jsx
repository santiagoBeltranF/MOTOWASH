import { useEffect, useState } from 'react'
import { BarChart3, Download, Filter, Users, Calendar, DollarSign } from 'lucide-react'
import api from '../../utils/api'
import Paginacion from '../../components/Paginacion'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

const tabs = ['Ingresos', 'Citas', 'Clientes']
const statusBadge = { pending: 'badge-yellow', confirmed: 'badge-blue', completed: 'badge-green', cancelled: 'badge-red' }
const statusLabel = { pending: 'Pendiente', confirmed: 'Confirmada', completed: 'Completada', cancelled: 'Cancelada' }

// Función para formatear fechas de forma segura (soporta fechas simples e ISO completas)
const formatSafeDate = (dateVal, isFullTimestamp = false) => {
  if (!dateVal) return '-';

  try {
    let dateObj;
    if (isFullTimestamp) {
      // Para timestamps completos (como cread_at)
      dateObj = new Date(dateVal);
    } else {
      // Para fechas de citas (evita desfases de zonas horarias)
      const dateStr = typeof dateVal === 'string' && dateVal.includes('T')
        ? dateVal.split('T')[0]
        : dateVal;
      dateObj = new Date(dateStr + 'T00:00:00');
    }

    if (isNaN(dateObj.getTime())) {
      return 'Fecha inválida';
    }

    return format(dateObj, 'd MMM yyyy', { locale: es });
  } catch (error) {
    return 'Error';
  }
};

export default function Reports() {
  const [tab, setTab] = useState(0)
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState([])
  const [filters, setFilters] = useState({ from: '', to: '', status: '', search: '' })
  const [pagina, setPagina] = useState(1)
  const [meta, setMeta] = useState({ total: 0, totalPages: 1, limit: 20 })
  const [services, setServices] = useState([])

  useEffect(() => {
    api.get('/services').then(r => setServices(r.data.services)).catch(() => {})
  }, [])

  useEffect(() => { fetchData() }, [tab, filters, pagina])
  // Cambiar de pestana o de filtro vuelve a la primera pagina.
  useEffect(() => { setPagina(1) }, [tab, filters])

  const fetchData = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filters.from) params.set('from', filters.from)
      if (filters.to) params.set('to', filters.to)
      if (filters.status) params.set('status', filters.status)
      if (filters.search) params.set('search', filters.search)
      params.set('page', pagina)

      const endpoints = ['/reports/revenue', '/reports/appointments', '/reports/clients']
      const res = await api.get(`${endpoints[tab]}?${params}`)
      setData(res.data.data || res.data.appointments || res.data.clients || [])
      // La pestana de Ingresos viene agregada por periodo, no paginada: ahi no
      // hay controles que mostrar.
      setMeta({ total: res.data.total ?? 0, totalPages: res.data.totalPages ?? 1, limit: res.data.limit ?? 20 })
    } catch { toast.error('Error cargando reporte') }
    finally { setLoading(false) }
  }

  const exportCSV = () => {
    if (!data.length) return
    const keys = Object.keys(data[0])
    const csv = [keys.join(','), ...data.map(r => keys.map(k => `"${r[k] ?? ''}"`).join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `reporte-${tabs[tab].toLowerCase()}-${Date.now()}.csv`
    a.click(); URL.revokeObjectURL(url)
    toast.success('Reporte exportado')
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-gray-900">Reportes</h1>
          <p className="text-gray-500 text-sm mt-1">Análisis y estadísticas del negocio</p>
        </div>
        <button onClick={exportCSV} className="btn-secondary">
          <Download className="w-4 h-4" /> Exportar CSV
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {tabs.map((t, i) => (
          <button key={t} onClick={() => setTab(i)}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${tab === i ? 'bg-white text-brand-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {t}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4 text-sm font-medium text-gray-600">
          <Filter className="w-4 h-4" /> Filtros
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="label" htmlFor="rep-desde">Desde</label>
            <input id="rep-desde" type="date" className="input" value={filters.from} onChange={e => setFilters(p => ({ ...p, from: e.target.value }))} />
          </div>
          <div>
            <label className="label" htmlFor="rep-hasta">Hasta</label>
            <input id="rep-hasta" type="date" className="input" value={filters.to} onChange={e => setFilters(p => ({ ...p, to: e.target.value }))} />
          </div>
          {tab === 1 && (
            <div>
              <label className="label" htmlFor="rep-estado">Estado</label>
              <select id="rep-estado" className="input" value={filters.status} onChange={e => setFilters(p => ({ ...p, status: e.target.value }))}>
                <option value="">Todos</option>
                <option value="confirmed">Confirmada</option>
                <option value="completed">Completada</option>
                <option value="cancelled">Cancelada</option>
                <option value="pending">Pendiente</option>
              </select>
            </div>
          )}
          {tab === 2 && (
            <div>
              <label className="label" htmlFor="rep-buscar">Buscar cliente</label>
              <input id="rep-buscar" type="text" className="input" placeholder="Nombre o correo..." value={filters.search}
                onChange={e => setFilters(p => ({ ...p, search: e.target.value }))} />
            </div>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="w-8 h-8 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            {tab === 0 && (
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr><th className="table-th">Período</th><th className="table-th">Citas</th><th className="table-th">Ingresos</th><th className="table-th">Ticket promedio</th></tr>
                </thead>
                <tbody>
                  {data.map((r, i) => (
                    <tr key={i} className="table-tr">
                      <td className="table-td font-medium">{r.period}</td>
                      <td className="table-td">{r.appointments}</td>
                      <td className="table-td font-semibold text-brand-700">${Number(r.revenue || 0).toLocaleString('es-CO')}</td>
                      <td className="table-td text-gray-500">${Number(r.avg_ticket || 0).toLocaleString('es-CO')}</td>
                    </tr>
                  ))}
                  {!data.length && <tr><td colSpan={4} className="table-td text-center text-gray-400 py-12">No hay datos para el período seleccionado</td></tr>}
                </tbody>
              </table>
            )}

            {tab === 1 && (
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr><th className="table-th">Cliente</th><th className="table-th">Servicio</th><th className="table-th">Fecha</th><th className="table-th">Hora</th><th className="table-th">Estado</th><th className="table-th">Precio</th><th className="table-th">Descuento</th></tr>
                </thead>
                <tbody>
                  {data.map((r, i) => (
                    <tr key={i} className="table-tr">
                      <td className="table-td"><div className="font-medium">{r.client}</div><div className="text-xs text-gray-400">{r.email}</div></td>
                      <td className="table-td">{r.service}</td>
                      <td className="table-td">{formatSafeDate(r.appointment_date)}</td>
                      <td className="table-td">{r.start_time?.slice(0,5)}</td>
                      <td className="table-td"><span className={statusBadge[r.status]}>{statusLabel[r.status]}</span></td>
                      <td className="table-td font-semibold text-brand-700">${Number(r.final_price || 0).toLocaleString('es-CO')}</td>
                      <td className="table-td">{r.discount_applied > 0 ? <span className="badge-green">{r.discount_applied}%</span> : '-'}</td>
                    </tr>
                  ))}
                  {!data.length && <tr><td colSpan={7} className="table-td text-center text-gray-400 py-12">No hay citas para mostrar</td></tr>}
                </tbody>
              </table>
            )}

            {tab === 2 && (
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr><th className="table-th">Cliente</th><th className="table-th">Teléfono</th><th className="table-th">Registrado</th><th className="table-th">Total citas</th><th className="table-th">Completadas</th><th className="table-th">Canceladas</th><th className="table-th">Total gastado</th><th className="table-th">Última cita</th></tr>
                </thead>
                <tbody>
                  {data.map((r, i) => (
                    <tr key={i} className="table-tr">
                      <td className="table-td"><div className="font-medium">{r.name}</div><div className="text-xs text-gray-400">{r.email}</div></td>
                      <td className="table-td text-gray-500">{r.phone || '-'}</td>
                      <td className="table-td text-gray-500">{formatSafeDate(r.created_at, true)}</td>
                      <td className="table-td font-medium">{r.total_appointments}</td>
                      <td className="table-td"><span className="badge-green">{r.completed}</span></td>
                      <td className="table-td"><span className="badge-red">{r.cancelled}</span></td>
                      <td className="table-td font-semibold text-brand-700">${Number(r.total_spent || 0).toLocaleString('es-CO')}</td>
                      <td className="table-td text-gray-500">{formatSafeDate(r.last_appointment)}</td>
                    </tr>
                  ))}
                  {!data.length && <tr><td colSpan={8} className="table-td text-center text-gray-400 py-12">No hay clientes para mostrar</td></tr>}
                </tbody>
              </table>
            )}
          </div>
        )}
        {!loading && tab !== 0 && (
          <Paginacion page={pagina} totalPages={meta.totalPages} total={meta.total} limit={meta.limit}
            onChange={setPagina} etiqueta={tab === 1 ? 'citas' : 'clientes'} />
        )}
      </div>
    </div>
  )
}