import { useEffect, useState } from 'react'
import { Search, UserCheck, UserX, Users } from 'lucide-react'
import api from '../../utils/api'
import Paginacion from '../../components/Paginacion'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

export default function Clients() {
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [pagina, setPagina] = useState(1)
  const [meta, setMeta] = useState({ total: 0, totalPages: 1, limit: 20 })

  const load = async () => {
    setLoading(true)
    try {
      const res = await api.get(`/clients?search=${encodeURIComponent(search)}&page=${pagina}`)
      setClients(res.data.clients ?? [])
      setMeta({ total: res.data.total ?? 0, totalPages: res.data.totalPages ?? 1, limit: res.data.limit ?? 20 })
    } catch { toast.error('Error cargando clientes') }
    finally { setLoading(false) }
  }

  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t) }, [search, pagina])
  // Al buscar se vuelve a la primera pagina.
  useEffect(() => { setPagina(1) }, [search])

  const toggle = async (id) => {
    try { await api.patch(`/clients/${id}/toggle`); toast.success('Estado actualizado'); load() }
    catch { toast.error('Error') }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-gray-900">Clientes</h1>
        <p className="text-gray-500 text-sm mt-1">Clientes registrados en el sistema</p>
      </div>

      <div className="card">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input className="input pl-10" placeholder="Buscar por nombre o correo..." value={search} onChange={e => setSearch(e.target.value)} />
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
                  <th className="table-th">Teléfono</th>
                  <th className="table-th">Registrado</th>
                  <th className="table-th">Estado</th>
                  <th className="table-th">Acción</th>
                </tr>
              </thead>
              <tbody>
                {clients.map(c => (
                  <tr key={c.id} className="table-tr">
                    <td className="table-td">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-brand-100 rounded-full flex items-center justify-center shrink-0">
                          <span className="text-xs font-bold text-brand-700">{c.name?.[0]?.toUpperCase()}</span>
                        </div>
                        <div>
                          <div className="font-medium text-gray-900">{c.name}</div>
                          <div className="text-xs text-gray-400">{c.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="table-td text-gray-500">{c.phone || '—'}</td>
                    <td className="table-td text-gray-500">{c.created_at ? format(new Date(c.created_at), "d MMM yyyy", { locale: es }) : '—'}</td>
                    <td className="table-td">
                      <span className={c.is_active ? 'badge-green' : 'badge-red'}>
                        {c.is_active ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="table-td">
                      <button onClick={() => toggle(c.id)}
                        className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${c.is_active ? 'text-red-500 hover:bg-red-50' : 'text-emerald-600 hover:bg-emerald-50'}`}>
                        {c.is_active ? <><UserX className="w-3.5 h-3.5" /> Desactivar</> : <><UserCheck className="w-3.5 h-3.5" /> Activar</>}
                      </button>
                    </td>
                  </tr>
                ))}
                {!clients.length && (
                  <tr><td colSpan={5} className="text-center py-12 text-gray-400">
                    <Users className="w-8 h-8 mx-auto mb-2 text-gray-200" />
                    No se encontraron clientes
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        {!loading && (
          <Paginacion page={pagina} totalPages={meta.totalPages} total={meta.total} limit={meta.limit}
            onChange={setPagina} etiqueta="clientes" />
        )}
      </div>
    </div>
  )
}
