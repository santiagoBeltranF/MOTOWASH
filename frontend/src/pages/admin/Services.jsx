// Services.jsx
import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, Wrench, ToggleLeft, ToggleRight } from 'lucide-react'
import api from '../../utils/api'
import toast from 'react-hot-toast'
import MatrizPrecios from '../../components/MatrizPrecios'

export function Services() {
  const [services, setServices] = useState([])
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState({ name: '', description: '', price: '', duration_minutes: 60, is_active: true })

  const load = () => api.get('/services').then(r => setServices(r.data.services)).catch(() => toast.error('Error cargando servicios'))
  useEffect(() => { load() }, [])

  const openCreate = () => { setForm({ name: '', description: '', price: '', duration_minutes: 60, is_active: true }); setModal('create') }
  const openEdit = (s) => { setForm({ ...s }); setModal('edit') }

  const save = async (e) => {
    e.preventDefault()
    try {
      if (modal === 'create') await api.post('/services', form)
      else await api.put(`/services/${form.id}`, form)
      toast.success(modal === 'create' ? 'Servicio creado' : 'Servicio actualizado')
      setModal(null); load()
    } catch (err) { toast.error(err.response?.data?.message || 'Error guardando') }
  }

  const remove = async (id) => {
    if (!confirm('¿Eliminar este servicio?')) return
    try { await api.delete(`/services/${id}`); toast.success('Servicio eliminado'); load() }
    catch (err) { toast.error(err.response?.data?.message || 'Error eliminando') }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-gray-900">Servicios</h1>
          <p className="text-gray-500 text-sm mt-1">Gestiona los servicios y sus precios por tipo de moto</p>
        </div>
        <button onClick={openCreate} className="btn-primary"><Plus className="w-4 h-4" /> Nuevo servicio</button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {services.map(s => (
          <div key={s.id} className={`card transition-all ${!s.is_active ? 'opacity-60' : ''}`}>
            <div className="flex items-start justify-between mb-3">
              <div className="w-10 h-10 bg-brand-50 rounded-xl flex items-center justify-center">
                <Wrench className="w-5 h-5 text-brand-600" />
              </div>
              <div className="flex gap-1">
                <button onClick={() => openEdit(s)} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600 transition-colors"><Pencil className="w-3.5 h-3.5" /></button>
                <button onClick={() => remove(s.id)} className="p-1.5 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-500 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </div>
            <h3 className="font-semibold text-gray-900">{s.name}</h3>
            <p className="text-sm text-gray-500 mt-1 mb-3">{s.description}</p>
            <div className="flex items-center justify-between">
              <span className="text-lg font-display font-bold text-brand-700">${Number(s.price).toLocaleString('es-CO')}</span>
              <span className="text-xs text-gray-400">{s.duration_minutes} min</span>
            </div>
            {s.discounted_price && (
              <div className="mt-2 p-2 bg-emerald-50 rounded-lg">
                <span className="text-xs text-emerald-700 font-medium">Precio con promo: ${Number(s.discounted_price).toLocaleString('es-CO')}</span>
              </div>
            )}
          </div>
        ))}
      </div>

      <MatrizPrecios />

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h3 className="font-display font-semibold text-lg mb-5">{modal === 'create' ? 'Nuevo servicio' : 'Editar servicio'}</h3>
            <form onSubmit={save} className="space-y-4">
              <div><label className="label" htmlFor="servicio-nombre">Nombre</label><input id="servicio-nombre" className="input" required value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} /></div>
              <div><label className="label" htmlFor="servicio-descripcion">Descripción</label><textarea id="servicio-descripcion" className="input" rows={2} value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label" htmlFor="servicio-precio">Precio (COP)</label><input id="servicio-precio" type="number" className="input" required min="0" value={form.price} onChange={e => setForm(p => ({ ...p, price: e.target.value }))} /></div>
                <div><label className="label" htmlFor="servicio-duracion">Duración (min)</label><input id="servicio-duracion" type="number" className="input" required min="15" step="15" value={form.duration_minutes} onChange={e => setForm(p => ({ ...p, duration_minutes: parseInt(e.target.value) }))} /></div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.is_active} onChange={e => setForm(p => ({ ...p, is_active: e.target.checked }))} className="w-4 h-4 text-brand-600" />
                <span className="text-sm text-gray-700">Servicio activo</span>
              </label>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setModal(null)} className="btn-secondary flex-1">Cancelar</button>
                <button type="submit" className="btn-primary flex-1">Guardar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default Services
