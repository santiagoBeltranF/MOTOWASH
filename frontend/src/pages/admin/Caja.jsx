import { useEffect, useState } from 'react'
import { Wallet, LockOpen, Lock, AlertTriangle, Receipt } from 'lucide-react'
import api from '../../utils/api'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

const pesos = (n) => `$${Math.round(Number(n || 0)).toLocaleString('es-CO')}`

const fecha = (v, conHora = false) => {
  if (!v) return '—'
  try { return format(new Date(v), conHora ? "d MMM yyyy, HH:mm" : "d MMM yyyy", { locale: es }) }
  catch { return '—' }
}

export default function Caja () {
  const [turno, setTurno] = useState(null)
  const [turnos, setTurnos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [base, setBase] = useState('')
  const [conteo, setConteo] = useState('')
  const [notas, setNotas] = useState('')
  const [guardando, setGuardando] = useState(false)

  const cargar = async () => {
    setCargando(true)
    try {
      const [actual, historial] = await Promise.all([
        api.get('/cash/current'),
        api.get('/cash/shifts')
      ])
      setTurno(actual.data.shift)
      setTurnos(historial.data.shifts || [])
    } catch { toast.error('Error cargando la caja') }
    finally { setCargando(false) }
  }
  useEffect(() => { cargar() }, [])

  const abrir = async () => {
    setGuardando(true)
    try {
      const r = await api.post('/cash/open', { opening_amount: Number(base || 0), notes: notas })
      toast.success(r.data.message)
      setBase(''); setNotas('')
      await cargar()
    } catch (err) { toast.error(err.response?.data?.message || 'Error abriendo la caja') }
    finally { setGuardando(false) }
  }

  const cerrar = async () => {
    if (conteo === '') { toast.error('Escribe el conteo real de la caja'); return }
    setGuardando(true)
    try {
      const r = await api.post('/cash/close', { counted_amount: Number(conteo), notes: notas })
      toast.success(r.data.message)
      setConteo(''); setNotas('')
      await cargar()
    } catch (err) { toast.error(err.response?.data?.message || 'Error cerrando la caja') }
    finally { setGuardando(false) }
  }

  // La diferencia se anticipa mientras se escribe, para que quien cierra vea
  // el descuadre antes de confirmarlo y no después.
  const diferenciaPrevista = turno && conteo !== ''
    ? Math.round(Number(conteo)) - Math.round(Number(turno.efectivo_esperado || 0))
    : null

  if (cargando) {
    return <div className="flex justify-center items-center h-48">
      <div className="w-8 h-8 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
    </div>
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-gray-900">Caja</h1>
        <p className="text-gray-500 text-sm mt-1">Apertura, cierre y arqueo del turno</p>
      </div>

      {turno?.vencido && (
        <div className="card bg-amber-50 border-amber-200 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800">
            <p className="font-semibold">Turno vencido</p>
            <p className="text-xs text-amber-700 mt-0.5">
              Este turno es del {fecha(turno.operation_date)} y sigue abierto. No se puede cobrar
              hasta cerrarlo con el conteo real. El cierre quedará registrado como tardío.
            </p>
          </div>
        </div>
      )}

      {!turno ? (
        <div className="card space-y-4">
          <div className="flex items-center gap-2">
            <LockOpen className="w-4 h-4 text-brand-600" />
            <h3 className="font-display font-semibold text-gray-900">Abrir caja</h3>
          </div>
          <p className="text-sm text-gray-500">Sin un turno abierto no se puede cobrar.</p>
          <div>
            <label className="label" htmlFor="caja-base">Base inicial en efectivo</label>
            <input id="caja-base" type="number" min="0" step="1000" className="input"
              value={base} onChange={e => setBase(e.target.value)} placeholder="0" />
          </div>
          <div>
            <label className="label" htmlFor="caja-notas-apertura">Notas</label>
            <input id="caja-notas-apertura" className="input" value={notas} onChange={e => setNotas(e.target.value)} />
          </div>
          <button onClick={abrir} disabled={guardando || base === ''} className="btn-primary w-full">
            <LockOpen className="w-4 h-4" /> {guardando ? 'Abriendo…' : 'Abrir caja'}
          </button>
        </div>
      ) : (
        <div className="card space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wallet className="w-4 h-4 text-brand-600" />
              <h3 className="font-display font-semibold text-gray-900">Turno abierto</h3>
            </div>
            <span className="text-xs text-gray-400">
              Abierto {fecha(turno.opened_at, true)} · {turno.opened_by_name}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="p-3 bg-gray-50 rounded-xl">
              <p className="text-xs text-gray-500">Base inicial</p>
              <p className="font-display font-bold text-gray-900">{pesos(turno.opening_amount)}</p>
            </div>
            <div className="p-3 bg-gray-50 rounded-xl">
              <p className="text-xs text-gray-500">Cobrado en efectivo</p>
              <p className="font-display font-bold text-gray-900">{pesos(turno.efectivo_cobrado)}</p>
            </div>
            <div className="p-3 bg-brand-50 rounded-xl">
              <p className="text-xs text-brand-700">Debería haber</p>
              <p className="font-display font-bold text-brand-700">{pesos(turno.efectivo_esperado)}</p>
            </div>
          </div>
          <p className="text-xs text-gray-400">
            El arqueo es solo sobre efectivo: las transferencias no pasan por el cajón.
          </p>

          <div className="pt-3 border-t border-gray-100 space-y-3">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-gray-500" />
              <h4 className="font-medium text-gray-800 text-sm">Cerrar con conteo real</h4>
            </div>
            <div>
              <label className="label" htmlFor="caja-conteo">Efectivo contado</label>
              <input id="caja-conteo" type="number" min="0" step="1000" className="input"
                value={conteo} onChange={e => setConteo(e.target.value)} placeholder="0" />
            </div>
            {diferenciaPrevista !== null && (
              <div className={`p-2.5 rounded-xl text-sm ${
                diferenciaPrevista === 0 ? 'bg-emerald-50 text-emerald-800'
                  : 'bg-amber-50 text-amber-800 border border-amber-200'
              }`}>
                {diferenciaPrevista === 0
                  ? 'La caja cuadra exactamente.'
                  : diferenciaPrevista > 0
                    ? `Sobran ${pesos(diferenciaPrevista)} respecto a lo esperado.`
                    : `Faltan ${pesos(-diferenciaPrevista)} respecto a lo esperado.`}
              </div>
            )}
            <div>
              <label className="label" htmlFor="caja-notas-cierre">Notas del cierre</label>
              <input id="caja-notas-cierre" className="input" value={notas} onChange={e => setNotas(e.target.value)} />
            </div>
            <button onClick={cerrar} disabled={guardando} className="btn-primary w-full">
              <Lock className="w-4 h-4" /> {guardando ? 'Cerrando…' : 'Cerrar caja'}
            </button>
          </div>
        </div>
      )}

      {/* Historial */}
      <div className="card p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
          <Receipt className="w-4 h-4 text-gray-500" />
          <h3 className="font-display font-semibold text-gray-900">Turnos anteriores</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="table-th">Día</th>
                <th className="table-th">Abrió</th>
                <th className="table-th">Cerró</th>
                <th className="table-th">Recibos</th>
                <th className="table-th">Esperado</th>
                <th className="table-th">Contado</th>
                <th className="table-th">Diferencia</th>
              </tr>
            </thead>
            <tbody>
              {turnos.map(t => (
                <tr key={t.id} className="table-tr">
                  <td className="table-td">
                    {fecha(t.operation_date)}
                    {t.was_late_close ? <span className="badge-yellow ml-2">Cierre tardío</span> : null}
                    {t.vencido ? <span className="badge-red ml-2">Vencido</span> : null}
                  </td>
                  <td className="table-td text-gray-500">{t.opened_by_name}</td>
                  <td className="table-td text-gray-500">{t.closed_by_name || '—'}</td>
                  <td className="table-td">{t.recibos}</td>
                  <td className="table-td">{t.expected_amount ? pesos(t.expected_amount) : '—'}</td>
                  <td className="table-td">{t.counted_amount ? pesos(t.counted_amount) : '—'}</td>
                  <td className={`table-td font-medium ${
                    t.difference_amount == null ? 'text-gray-400'
                      : Number(t.difference_amount) === 0 ? 'text-emerald-600' : 'text-amber-600'
                  }`}>
                    {t.difference_amount == null ? '—' : pesos(t.difference_amount)}
                  </td>
                </tr>
              ))}
              {!turnos.length && (
                <tr><td colSpan={7} className="table-td text-center text-gray-400 py-10">Todavía no hay turnos</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
