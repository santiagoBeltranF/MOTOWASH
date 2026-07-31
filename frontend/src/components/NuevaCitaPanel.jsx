import { useEffect, useState } from 'react'
import { Search, UserPlus, X, AlertTriangle } from 'lucide-react'
import api from '../utils/api'
import toast from 'react-hot-toast'

/**
 * Agendar desde el mostrador: cliente registrado o invitado, incluso para el
 * momento actual.
 *
 * El sobrecupo NO es automático. Si la franja está llena el backend responde
 * 409 con `CUPO_LLENO` y los conteos; aquí se muestra el aviso «esta franja ya
 * tiene N de N» y solo se reintenta si quien atiende lo confirma. Nadie debe
 * sobrecupar sin darse cuenta.
 */
export default function NuevaCitaPanel ({ abierto, onCerrar, onCreada }) {
  const [servicios, setServicios] = useState([])
  const [categorias, setCategorias] = useState([])
  const [busqueda, setBusqueda] = useState('')
  const [resultados, setResultados] = useState([])
  const [cliente, setCliente] = useState(null)
  const [creandoInvitado, setCreandoInvitado] = useState(false)
  const [invitado, setInvitado] = useState({ name: '', phone: '', document_id: '' })
  const [form, setForm] = useState({ service_id: '', category_id: '', appointment_date: '', start_time: '', plate: '', notes: '' })
  const [guardando, setGuardando] = useState(false)
  const [confirmarSobrecupo, setConfirmarSobrecupo] = useState(null)

  useEffect(() => {
    if (!abierto) return
    api.get('/services').then(r => setServicios((r.data.services || []).filter(s => s.is_active))).catch(() => {})
    api.get('/categories').then(r => setCategorias(r.data.categories || [])).catch(() => {})
    const ahora = new Date()
    setForm(f => ({
      ...f,
      appointment_date: `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${String(ahora.getDate()).padStart(2, '0')}`,
      start_time: `${String(ahora.getHours()).padStart(2, '0')}:00`
    }))
  }, [abierto])

  useEffect(() => {
    if (!abierto || busqueda.trim().length < 2) { setResultados([]); return }
    const t = setTimeout(() => {
      api.get(`/clients/search?q=${encodeURIComponent(busqueda)}`)
        .then(r => setResultados(r.data.clients || [])).catch(() => {})
    }, 300)
    return () => clearTimeout(t)
  }, [busqueda, abierto])

  const reiniciar = () => {
    setCliente(null); setBusqueda(''); setResultados([]); setCreandoInvitado(false)
    setInvitado({ name: '', phone: '', document_id: '' })
    setForm(f => ({ ...f, service_id: '', category_id: '', plate: '', notes: '' }))
    setConfirmarSobrecupo(null)
  }

  const cerrar = () => { reiniciar(); onCerrar() }

  const guardarInvitado = async () => {
    if (!invitado.name.trim()) { toast.error('El nombre del invitado es obligatorio'); return }
    try {
      const r = await api.post('/clients/guest', invitado)
      setCliente(r.data.client)
      setCreandoInvitado(false)
      toast.success('Invitado registrado')
    } catch (err) { toast.error(err.response?.data?.message || 'Error registrando al invitado') }
  }

  const crear = async (permitirSobrecupo = false) => {
    if (!cliente) { toast.error('Elige un cliente o registra un invitado'); return }
    setGuardando(true)
    try {
      const r = await api.post('/appointments/panel', {
        ...form,
        client_id: cliente.id,
        category_id: form.category_id || undefined,
        allow_overbook: permitirSobrecupo
      })
      toast.success(r.data.message)
      setConfirmarSobrecupo(null)
      reiniciar()
      onCreada()
      onCerrar()
    } catch (err) {
      const d = err.response?.data
      if (d?.code === 'CUPO_LLENO') {
        // Aquí no se reintenta solo: se pregunta.
        setConfirmarSobrecupo({ ocupadas: d.ocupadas, maximo: d.maximo })
      } else {
        toast.error(d?.message || 'Error creando la cita')
      }
    } finally { setGuardando(false) }
  }

  if (!abierto) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 my-8">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-display font-semibold text-lg">Nueva cita</h3>
          <button onClick={cerrar} aria-label="Cerrar" className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Cliente */}
        {!cliente ? (
          <div className="space-y-3 mb-4">
            {!creandoInvitado ? (
              <>
                <div>
                  <label className="label" htmlFor="panel-buscar">Cliente</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input id="panel-buscar" className="input pl-10" placeholder="Nombre, teléfono, documento o placa"
                      value={busqueda} onChange={e => setBusqueda(e.target.value)} />
                  </div>
                </div>
                {resultados.length > 0 && (
                  <div className="border border-gray-100 rounded-xl divide-y max-h-48 overflow-y-auto">
                    {resultados.map(c => (
                      <button key={c.id} onClick={() => setCliente(c)}
                        className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm">
                        <span className="font-medium">{c.name}</span>
                        {c.is_guest ? <span className="badge-yellow ml-2">Invitado</span> : null}
                        <span className="text-gray-400 ml-2">{c.phone || c.email || ''}</span>
                        {c.ultima_placa ? <span className="text-gray-400 ml-2">· {c.ultima_placa}</span> : null}
                      </button>
                    ))}
                  </div>
                )}
                <button onClick={() => setCreandoInvitado(true)} className="btn-secondary w-full">
                  <UserPlus className="w-4 h-4" /> Registrar invitado
                </button>
              </>
            ) : (
              <div className="space-y-3 p-3 bg-gray-50 rounded-xl">
                <div>
                  <label className="label" htmlFor="inv-nombre">Nombre</label>
                  <input id="inv-nombre" className="input" value={invitado.name}
                    onChange={e => setInvitado(p => ({ ...p, name: e.target.value }))} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label" htmlFor="inv-tel">Teléfono</label>
                    <input id="inv-tel" className="input" value={invitado.phone}
                      onChange={e => setInvitado(p => ({ ...p, phone: e.target.value }))} />
                  </div>
                  <div>
                    <label className="label" htmlFor="inv-doc">Documento</label>
                    <input id="inv-doc" className="input" value={invitado.document_id}
                      onChange={e => setInvitado(p => ({ ...p, document_id: e.target.value }))} />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setCreandoInvitado(false)} className="btn-secondary flex-1">Cancelar</button>
                  <button onClick={guardarInvitado} className="btn-primary flex-1">Guardar invitado</button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-between mb-4 p-3 bg-brand-50 rounded-xl">
            <div className="text-sm">
              <span className="font-medium">{cliente.name}</span>
              {cliente.is_guest ? <span className="badge-yellow ml-2">Invitado</span> : null}
              <div className="text-gray-500 text-xs">{cliente.phone || cliente.email || 'Sin contacto'}</div>
            </div>
            <button onClick={() => setCliente(null)} className="text-xs text-brand-700 hover:underline">Cambiar</button>
          </div>
        )}

        {/* Datos de la cita */}
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="panel-servicio">Servicio</label>
              <select id="panel-servicio" className="input" value={form.service_id}
                onChange={e => setForm(p => ({ ...p, service_id: e.target.value }))}>
                <option value="">Elige…</option>
                {servicios.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="panel-categoria">Tipo de moto</label>
              <select id="panel-categoria" className="input" value={form.category_id}
                onChange={e => setForm(p => ({ ...p, category_id: e.target.value }))}>
                <option value="">Precio base</option>
                {categorias.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="label" htmlFor="panel-placa">Placa</label>
            <input id="panel-placa" className="input uppercase" placeholder="ABC12D" value={form.plate}
              onChange={e => setForm(p => ({ ...p, plate: e.target.value }))} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="panel-fecha">Fecha</label>
              <input id="panel-fecha" type="date" className="input" value={form.appointment_date}
                onChange={e => setForm(p => ({ ...p, appointment_date: e.target.value }))} />
            </div>
            <div>
              <label className="label" htmlFor="panel-hora">Hora</label>
              <input id="panel-hora" type="time" className="input" value={form.start_time}
                onChange={e => setForm(p => ({ ...p, start_time: e.target.value }))} />
            </div>
          </div>

          <div>
            <label className="label" htmlFor="panel-notas">Notas</label>
            <textarea id="panel-notas" className="input" rows={2} value={form.notes}
              onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />
          </div>
        </div>

        {/* Confirmación de sobrecupo */}
        {confirmarSobrecupo && (
          <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-xl">
            <div className="flex gap-2 text-amber-800">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <div className="text-sm">
                <p className="font-semibold">
                  Esta franja ya tiene {confirmarSobrecupo.ocupadas} de {confirmarSobrecupo.maximo}
                </p>
                <p className="text-xs text-amber-700 mt-0.5">
                  Si continúas, la cita se creará en sobrecupo y quedará marcada como tal.
                </p>
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <button onClick={() => setConfirmarSobrecupo(null)} className="btn-secondary flex-1">No, cancelar</button>
              <button onClick={() => crear(true)} disabled={guardando}
                className="btn-primary flex-1 bg-amber-600 hover:bg-amber-700">
                Sí, crear en sobrecupo
              </button>
            </div>
          </div>
        )}

        {!confirmarSobrecupo && (
          <div className="flex gap-3 pt-5">
            <button onClick={cerrar} className="btn-secondary flex-1">Cancelar</button>
            <button onClick={() => crear(false)} disabled={guardando} className="btn-primary flex-1">
              {guardando ? 'Creando…' : 'Crear cita'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
