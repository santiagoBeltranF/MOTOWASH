import { useEffect, useState } from 'react'
import { Plus, Tag, Trash2, Send, Clock } from 'lucide-react'
import api from '../../utils/api'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

// Definimos el estado inicial limpio del formulario fuera del componente
const initialFormState = {
  title: '',
  description: '',
  discount_percent: 10,
  starts_at: '',
  ends_at: '',
  applies_to: 'all',
  service_ids: [],
  send_email: true
}

export default function Promotions() {
  const [promotions, setPromotions] = useState([])
  const [services, setServices] = useState([])
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState(initialFormState)

  const load = () => {
    api.get('/promotions').then(r => setPromotions(r.data.promotions)).catch(() => toast.error('Error'))
    api.get('/services').then(r => setServices(r.data.services)).catch(() => {})
  }
  useEffect(() => { load() }, [])

  // Función para abrir el modal y garantizar que el formulario comience vacío
  const openCreate = () => {
    setForm(initialFormState)
    setModal(true)
  }

  const save = async (e) => {
    e.preventDefault()
    try {
      await api.post('/promotions', form)
      toast.success('Promoción creada' + (form.send_email ? ' y correos enviados' : ''))
      setForm(initialFormState) // <-- Restablecemos el formulario tras guardarlo con éxito
      setModal(false)
      load()
    } catch (err) { toast.error(err.response?.data?.message || 'Error') }
  }

  const remove = async (id) => {
    if (!confirm('¿Eliminar esta promoción?')) return
    try { await api.delete(`/promotions/${id}`); toast.success('Eliminada'); load() }
    catch { toast.error('Error eliminando') }
  }

  const isActive = (p) => new Date() >= new Date(p.starts_at) && new Date() <= new Date(p.ends_at) && p.is_active

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-gray-900">Promociones</h1>
          <p className="text-gray-500 text-sm mt-1">Crea descuentos con notificación automática por correo</p>
        </div>
        <button onClick={openCreate} className="btn-primary"><Plus className="w-4 h-4" /> Nueva promoción</button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {promotions.map(p => (
          <div key={p.id} className={`card border-2 transition-all ${isActive(p) ? 'border-emerald-200 bg-emerald-50/30' : 'border-gray-100'}`}>
            <div className="flex items-start justify-between mb-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isActive(p) ? 'bg-emerald-100' : 'bg-gray-100'}`}>
                <Tag className={`w-5 h-5 ${isActive(p) ? 'text-emerald-600' : 'text-gray-400'}`} />
              </div>
              <div className="flex items-center gap-2">
                {isActive(p) && <span className="badge-green">Activa</span>}
                <button onClick={() => remove(p.id)} className="p-1.5 hover:bg-red-50 text-gray-400 hover:text-red-500 rounded-lg transition-colors">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <h3 className="font-semibold text-gray-900">{p.title}</h3>
            <p className="text-sm text-gray-500 mt-1 mb-3">{p.description}</p>
            <div className="flex items-center justify-between mb-3">
              <span className="text-3xl font-display font-bold text-brand-700">{p.discount_percent}%</span>
              <span className="badge-gray">{p.applies_to === 'all' ? 'Todos los servicios' : 'Servicios específicos'}</span>
            </div>
            <div className="text-xs text-gray-400 space-y-1">
              <div className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" />
                {format(new Date(p.starts_at), "d MMM HH:mm", { locale: es })} — {format(new Date(p.ends_at), "d MMM HH:mm", { locale: es })}
              </div>
              {p.email_sent && <div className="flex items-center gap-1.5 text-brand-500"><Send className="w-3.5 h-3.5" /> Correos enviados</div>}
            </div>
          </div>
        ))}
        {!promotions.length && (
          <div className="col-span-3 text-center py-16 text-gray-400">
            <Tag className="w-10 h-10 mx-auto mb-3 text-gray-200" />
            <p>No hay promociones creadas</p>
          </div>
        )}
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="font-display font-semibold text-lg mb-5">Nueva promoción</h3>
            <form onSubmit={save} className="space-y-4">
              <div><label className="label">Título</label><input className="input" required value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="Ej: Descuento de fin de semana" /></div>
              <div><label className="label">Descripción</label><textarea className="input" rows={2} value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} /></div>
              <div><label className="label">Descuento (%)</label>
                <input type="number" className="input" required min="1" max="100" value={form.discount_percent}
                  onChange={e => setForm(p => ({ ...p, discount_percent: parseFloat(e.target.value) }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Inicio</label><input type="datetime-local" className="input" required value={form.starts_at} onChange={e => setForm(p => ({ ...p, starts_at: e.target.value }))} /></div>
                <div><label className="label">Fin</label><input type="datetime-local" className="input" required value={form.ends_at} onChange={e => setForm(p => ({ ...p, ends_at: e.target.value }))} /></div>
              </div>
              <div>
                <label className="label">Aplica a</label>
                <select className="input" value={form.applies_to} onChange={e => setForm(p => ({ ...p, applies_to: e.target.value }))}>
                  <option value="all">Todos los servicios</option>
                  <option value="specific">Servicios específicos</option>
                </select>
              </div>
              {form.applies_to === 'specific' && (
                <div>
                  <label className="label">Selecciona servicios</label>
                  <div className="space-y-2 border border-gray-200 rounded-lg p-3">
                    {services.map(s => (
                      <label key={s.id} className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={form.service_ids.includes(s.id)}
                          onChange={e => setForm(p => ({ ...p, service_ids: e.target.checked ? [...p.service_ids, s.id] : p.service_ids.filter(id => id !== s.id) }))}
                          className="w-4 h-4 text-brand-600" />
                        <span className="text-sm text-gray-700">{s.name} — ${Number(s.price).toLocaleString('es-CO')}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
              <label className="flex items-center gap-2 cursor-pointer p-3 bg-brand-50 rounded-xl border border-brand-100">
                <input type="checkbox" checked={form.send_email} onChange={e => setForm(p => ({ ...p, send_email: e.target.checked }))} className="w-4 h-4 text-brand-600" />
                <div>
                  <p className="text-sm font-medium text-brand-800">Enviar correo a todos los clientes</p>
                  <p className="text-xs text-brand-500">Se notificará la promoción por email automáticamente</p>
                </div>
              </label>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setModal(false)} className="btn-secondary flex-1">Cancelar</button>
                <button type="submit" className="btn-primary flex-1">Crear promoción</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}