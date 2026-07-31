import { useEffect, useState } from 'react'
import { Save, Bike, ToggleLeft, ToggleRight } from 'lucide-react'
import api from '../utils/api'
import toast from 'react-hot-toast'

/**
 * Precio por servicio y tipo de moto.
 *
 * Muestra las categorías activas como columnas editables y las inactivas
 * atenuadas, con su interruptor: activar una categoría es cambiar una bandera,
 * no migrar, porque sus precios ya están sembrados desde el principio.
 */
export default function MatrizPrecios () {
  const [categorias, setCategorias] = useState([])
  const [matriz, setMatriz] = useState([])
  const [editados, setEditados] = useState({})   // "servicio:categoria" -> precio
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)

  const cargar = async () => {
    setCargando(true)
    try {
      const r = await api.get('/service-prices')
      setCategorias(r.data.categories || [])
      setMatriz(r.data.matriz || [])
      setEditados({})
    } catch { toast.error('Error cargando los precios') }
    finally { setCargando(false) }
  }
  useEffect(() => { cargar() }, [])

  const clave = (s, c) => `${s}:${c}`
  const valorDe = (fila, precio) =>
    editados[clave(fila.service_id, precio.category_id)] ?? String(precio.price ?? '')

  const cambiar = (serviceId, categoryId, valor) =>
    setEditados(p => ({ ...p, [clave(serviceId, categoryId)]: valor }))

  const guardar = async () => {
    const prices = Object.entries(editados)
      .map(([k, v]) => {
        const [service_id, category_id] = k.split(':').map(Number)
        return { service_id, category_id, price: v }
      })
      .filter(p => p.price !== '' && !Number.isNaN(Number(p.price)))

    if (!prices.length) { toast.error('No has cambiado ningún precio'); return }

    setGuardando(true)
    try {
      await api.put('/service-prices', { prices })
      toast.success('Precios actualizados')
      await cargar()
    } catch (err) { toast.error(err.response?.data?.message || 'Error guardando los precios') }
    finally { setGuardando(false) }
  }

  const alternarCategoria = async (cat) => {
    try {
      await api.put(`/categories/${cat.id}`, {
        name: cat.name,
        description: cat.description ?? '',
        is_active: !cat.is_active
      })
      toast.success(cat.is_active ? `${cat.name} desactivada` : `${cat.name} activada`)
      await cargar()
    } catch (err) { toast.error(err.response?.data?.message || 'Error cambiando la categoría') }
  }

  const hayCambios = Object.keys(editados).length > 0

  if (cargando) {
    return <div className="flex justify-center items-center h-40">
      <div className="w-8 h-8 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
    </div>
  }

  return (
    <div className="card p-0 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <Bike className="w-4 h-4 text-brand-600" />
          <h3 className="font-display font-semibold text-gray-900">Precios por tipo de moto</h3>
        </div>
        <button onClick={guardar} disabled={!hayCambios || guardando} className="btn-primary">
          <Save className="w-4 h-4" /> {guardando ? 'Guardando…' : 'Guardar precios'}
        </button>
      </div>

      <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap gap-2">
        {categorias.map(c => (
          <button key={c.id} onClick={() => alternarCategoria(c)}
            aria-label={`${c.is_active ? 'Desactivar' : 'Activar'} ${c.name}`}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border transition-colors ${
              c.is_active
                ? 'border-brand-200 bg-brand-50 text-brand-700'
                : 'border-gray-200 bg-gray-50 text-gray-400'
            }`}>
            {c.is_active ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
            {c.name}
          </button>
        ))}
        <p className="w-full text-xs text-gray-400 mt-1">
          Las categorías inactivas conservan sus precios: activarlas no pierde nada.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="table-th">Servicio</th>
              {categorias.map(c => (
                <th key={c.id} className={`table-th ${c.is_active ? '' : 'text-gray-300'}`}>
                  {c.name}{c.is_active ? '' : ' (inactiva)'}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matriz.map(fila => (
              <tr key={fila.service_id} className="table-tr">
                <td className="table-td font-medium">
                  {fila.service_name}
                  {!fila.is_active ? <span className="badge-red ml-2">Inactivo</span> : null}
                </td>
                {fila.precios.map(p => (
                  <td key={p.category_id} className="table-td">
                    <input
                      type="number" min="0" step="500"
                      aria-label={`Precio de ${fila.service_name} para ${p.category_name}`}
                      className={`input py-1.5 w-28 ${p.category_active ? '' : 'bg-gray-50 text-gray-400'}`}
                      value={valorDe(fila, p)}
                      onChange={e => cambiar(fila.service_id, p.category_id, e.target.value)}
                    />
                  </td>
                ))}
              </tr>
            ))}
            {!matriz.length && (
              <tr><td colSpan={categorias.length + 1} className="table-td text-center text-gray-400 py-10">
                No hay servicios todavía
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
