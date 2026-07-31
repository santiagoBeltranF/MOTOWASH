import { useEffect, useState } from 'react'
import { X, Banknote, Landmark, AlertTriangle } from 'lucide-react'
import api from '../utils/api'
import toast from 'react-hot-toast'

const pesos = (n) => `$${Math.round(Number(n || 0)).toLocaleString('es-CO')}`

/**
 * Cobro de una cita.
 *
 * El pago es completo: la suma de los métodos tiene que dar el total exacto.
 * En mixto se piden los dos importes y la diferencia se muestra en vivo, para
 * que el descuadre se vea antes de intentar guardar y no como un error después.
 */
export default function CobroModal ({ cita, onCerrar, onCobrado }) {
  const [metodo, setMetodo] = useState('cash')
  const [efectivo, setEfectivo] = useState('')
  const [transferencia, setTransferencia] = useState('')
  const [descuento, setDescuento] = useState('')
  const [motivo, setMotivo] = useState('')
  const [guardando, setGuardando] = useState(false)

  const subtotal = Math.round(Number(cita?.final_price || 0))
  const desc = Math.max(0, Math.round(Number(descuento || 0)))
  const total = Math.max(0, subtotal - desc)

  useEffect(() => {
    // Al elegir método simple se rellena el total, que es el caso habitual.
    if (metodo === 'cash') { setEfectivo(String(total)); setTransferencia('') }
    else if (metodo === 'transfer') { setTransferencia(String(total)); setEfectivo('') }
    else { setEfectivo(''); setTransferencia('') }
  }, [metodo, total])

  if (!cita) return null

  const sumaPagos = Math.round(Number(efectivo || 0)) + Math.round(Number(transferencia || 0))
  const restante = total - sumaPagos
  const cuadra = restante === 0

  const cobrar = async () => {
    if (desc > 0 && !motivo.trim()) { toast.error('Un descuento necesita motivo'); return }
    setGuardando(true)
    try {
      const payments = []
      if (Number(efectivo || 0) > 0) payments.push({ method: 'cash', amount: Number(efectivo) })
      if (Number(transferencia || 0) > 0) payments.push({ method: 'transfer', amount: Number(transferencia) })

      const r = await api.post('/receipts', {
        appointment_id: cita.id,
        discount_amount: desc || undefined,
        discount_reason: desc > 0 ? motivo.trim() : undefined,
        payments
      })
      toast.success(r.data.message)
      onCobrado(r.data.receiptId)
      onCerrar()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error registrando el cobro')
    } finally { setGuardando(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 my-8">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display font-semibold text-lg">Cobrar cita</h3>
          <button onClick={onCerrar} aria-label="Cerrar" className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="bg-gray-50 rounded-xl p-3 mb-4 text-sm space-y-1">
          <div className="flex justify-between"><span className="text-gray-500">Cliente</span><span className="font-medium">{cita.client_name}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Servicio</span><span className="font-medium">{cita.service_name}</span></div>
          {cita.plate ? <div className="flex justify-between"><span className="text-gray-500">Placa</span><span className="font-mono">{cita.plate}</span></div> : null}
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="cobro-descuento">Descuento</label>
              <input id="cobro-descuento" type="number" min="0" step="500" className="input"
                value={descuento} onChange={e => setDescuento(e.target.value)} placeholder="0" />
            </div>
            <div>
              <label className="label" htmlFor="cobro-motivo">Motivo del descuento</label>
              <input id="cobro-motivo" className="input" value={motivo}
                onChange={e => setMotivo(e.target.value)} disabled={desc === 0}
                placeholder={desc === 0 ? '—' : 'Obligatorio'} />
            </div>
          </div>

          <div className="rounded-xl border border-gray-100 p-3 space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-gray-500">Servicio</span><span>{pesos(subtotal)}</span></div>
            {desc > 0 && <div className="flex justify-between text-emerald-700"><span>Descuento</span><span>−{pesos(desc)}</span></div>}
            <div className="flex justify-between pt-1 border-t border-gray-100 font-semibold">
              <span>Total a cobrar</span>
              <span className="font-display text-brand-700 text-lg">{pesos(total)}</span>
            </div>
          </div>

          <div>
            <label className="label">Método de pago</label>
            <div className="grid grid-cols-3 gap-2">
              {[['cash', 'Efectivo', Banknote], ['transfer', 'Transferencia', Landmark], ['mixed', 'Mixto', null]].map(([v, etiqueta, Icono]) => (
                <button key={v} onClick={() => setMetodo(v)}
                  className={`py-2 px-2 rounded-xl text-sm font-medium border-2 transition-all flex items-center justify-center gap-1.5 ${
                    metodo === v ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-gray-100 text-gray-500 hover:border-brand-200'
                  }`}>
                  {Icono ? <Icono className="w-4 h-4" /> : null}{etiqueta}
                </button>
              ))}
            </div>
          </div>

          {metodo === 'mixed' ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label" htmlFor="cobro-efectivo">Efectivo</label>
                <input id="cobro-efectivo" type="number" min="0" className="input"
                  value={efectivo} onChange={e => setEfectivo(e.target.value)} />
              </div>
              <div>
                <label className="label" htmlFor="cobro-transferencia">Transferencia</label>
                <input id="cobro-transferencia" type="number" min="0" className="input"
                  value={transferencia} onChange={e => setTransferencia(e.target.value)} />
              </div>
            </div>
          ) : null}

          {/* El descuadre se ve en vivo, antes de intentar guardar */}
          {!cuadra && (
            <div className="flex items-center gap-2 p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-sm">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>
                {restante > 0
                  ? `Faltan ${pesos(restante)} por cubrir`
                  : `Sobran ${pesos(-restante)}: el pago no puede exceder el total`}
              </span>
            </div>
          )}
        </div>

        <div className="flex gap-3 pt-5">
          <button onClick={onCerrar} className="btn-secondary flex-1">Cancelar</button>
          <button onClick={cobrar} disabled={guardando || !cuadra || total <= 0} className="btn-primary flex-1">
            {guardando ? 'Cobrando…' : `Cobrar ${pesos(total)}`}
          </button>
        </div>
      </div>
    </div>
  )
}
