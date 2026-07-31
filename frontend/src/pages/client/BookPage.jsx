import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Clock, Tag, CheckCircle } from 'lucide-react'
import api from '../../utils/api'
import toast from 'react-hot-toast'
import { format, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isSameDay, isBefore, startOfDay } from 'date-fns'
import { es } from 'date-fns/locale'

const DAYS = ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá']

export default function BookPage() {
  const [step, setStep] = useState(1)
  const [services, setServices] = useState([])
  const [selectedService, setSelectedService] = useState(null)
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState(null)
  const [slots, setSlots] = useState([])
  const [selectedSlot, setSelectedSlot] = useState(null)
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [booking, setBooking] = useState(false)
  const [promo, setPromo] = useState(null)

  // Estados para controlar la cita pendiente activa y el proceso de reagendamiento
  const [activePending, setActivePending] = useState(null)
  const [checkingPending, setCheckingPending] = useState(true)
  const [isRescheduling, setIsRescheduling] = useState(false)

  const location = useLocation()

  const reiniciarAsistente = () => {
    setStep(1)
    setSelectedService(null)
    setSelectedDate(null)
    setSelectedSlot(null)
    setNotes('')
    setIsRescheduling(false)
  }

  const loadActivePending = () => {
    setCheckingPending(true)
    api.get('/appointments/active-pending')
      .then(r => {
        setActivePending(r.data.activePending)
      })
      .catch(() => {})
      .finally(() => setCheckingPending(false))
  }

  useEffect(() => {
    // Los servicios se piden una sola vez; el estado de la cita pendiente lo
    // refresca el efecto de abajo, que corre tambien en el montaje. Tenerlo en
    // los dos sitios disparaba dos veces la misma peticion en cada entrada.
    //
    // Se normaliza a lista antes de guardar. axios devuelve el cuerpo sin
    // parsear —como texto— cuando no consigue interpretarlo, y en ese caso
    // `r.data.services` es undefined: sin esta guarda, el `services.map` de mas
    // abajo tumbaba la pantalla entera en lugar de mostrar un aviso.
    api.get('/services')
      .then(r => {
        const lista = Array.isArray(r.data?.services) ? r.data.services : null
        if (!lista) {
          toast.error('No se pudieron cargar los servicios. Vuelve a intentarlo.')
          return
        }
        setServices(lista)
        setPromo(r.data.activePromotion ?? null)
      })
      .catch(() => toast.error('Error cargando servicios'))
  }, [])

  // Pulsar "Agendar" en el menu estando ya en esta ruta no remonta el
  // componente, asi que el asistente se quedaba clavado en la pantalla de
  // "¡Cita confirmada!" y el menu parecia no responder. React Router genera una
  // clave de navegacion nueva en cada pulsacion: se usa para reiniciar.
  useEffect(() => {
    reiniciarAsistente()
    loadActivePending()
  }, [location.key])

  useEffect(() => {
    if (!selectedDate || !selectedService) return
    setLoading(true)
    setSelectedSlot(null)
    api.get(`/appointments/slots?date=${format(selectedDate, 'yyyy-MM-dd')}&service_id=${selectedService.id}`)
      .then(r => setSlots(r.data.slots))
      .catch(() => toast.error('Error cargando horarios'))
      .finally(() => setLoading(false))
  }, [selectedDate, selectedService])

  const monthDays = eachDayOfInterval({ start: startOfMonth(currentMonth), end: endOfMonth(currentMonth) })
  const firstDayOfWeek = getDay(startOfMonth(currentMonth))

  const getPrice = (s) => {
    if (!s) return 0
    if (s.discounted_price) return s.discounted_price
    return s.price
  }

  // Lógica para cancelar la cita pendiente activa
  const handleCancelActive = async () => {
    if (!confirm('¿Seguro que deseas cancelar tu cita actual?')) return
    try {
      await api.patch(`/appointments/${activePending.id}/cancel`)
      toast.success('Cita cancelada exitosamente')
      setActivePending(null)
      setStep(1)
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error al cancelar cita')
    }
  }

  const confirmBooking = async () => {
    setBooking(true)
    try {
      if (isRescheduling) {
        // Petición PATCH para reagendar la cita existente
        await api.patch(`/appointments/${activePending.id}/reschedule`, {
          appointment_date: format(selectedDate, 'yyyy-MM-dd'),
          start_time: selectedSlot
        })
        toast.success('Cita reagendada exitosamente')
      } else {
        // Petición POST para crear una cita nueva
        await api.post('/appointments', {
          service_id: selectedService.id,
          appointment_date: format(selectedDate, 'yyyy-MM-dd'),
          start_time: selectedSlot,
          notes
        })
        toast.success('¡Cita agendada! Revisa tu correo')
      }
      setStep(4)
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error guardando cita')
    } finally { setBooking(false) }
  }

  // Pantalla de carga mientras se consulta si el usuario tiene citas pendientes
  if (checkingPending) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="w-8 h-8 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
      </div>
    )
  }

  // Pantalla de confirmación final exitosa (Paso 4)
  if (step === 4) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
      <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mb-4">
        <CheckCircle className="w-10 h-10 text-emerald-600" />
      </div>
      <h2 className="font-display text-2xl font-bold text-gray-900 mb-2">
        {isRescheduling ? '¡Cita reagendada!' : '¡Cita confirmada!'}
      </h2>
      <p className="text-gray-500 mb-2">{selectedService?.name}</p>
      <p className="text-gray-500 mb-1">{format(selectedDate, "EEEE d 'de' MMMM", { locale: es })}</p>
      <p className="text-gray-500 mb-6">a las {selectedSlot}</p>
      <p className="text-sm text-brand-600 mb-8">Te enviamos los detalles de tu cita al correo electrónico</p>
      <button onClick={() => {
        reiniciarAsistente()
        loadActivePending() // Recargar estado por si quiere agendar otra
      }}
        className="btn-primary">Volver al inicio</button>
    </div>
  )

  // VISTA DE ALERTA: Si el cliente ya tiene una cita pendiente y NO está en proceso de reagendarla
  if (activePending && !isRescheduling) {
    const dateStr = typeof activePending.appointment_date === 'string' && activePending.appointment_date.includes('T')
      ? activePending.appointment_date.split('T')[0]
      : activePending.appointment_date;
    const dateObj = new Date(dateStr + 'T00:00:00');
    const formattedDate = format(dateObj, "EEEE d 'de' MMMM", { locale: es });

    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-gray-900 mb-2">Tu agenda</h1>
          <p className="text-gray-500 text-sm">Ya tienes una cita pendiente activa. No puedes agendar otra cita hasta que esta sea confirmada, completada o cancelada por el administrador.</p>
        </div>

        <div className="card space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-amber-800 flex items-center gap-3">
            <Clock className="w-5 h-5 shrink-0" />
            <div>
              <p className="font-semibold text-sm">Cita Pendiente de Confirmación</p>
              <p className="text-xs text-amber-700">El administrador validará tu reserva en unos momentos.</p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex justify-between text-sm"><span className="text-gray-500 font-medium">Servicio</span><span className="font-semibold text-gray-800">{activePending.service_name}</span></div>
            <div className="flex justify-between text-sm"><span className="text-gray-500 font-medium">Fecha</span><span className="font-semibold text-gray-800 capitalize">{formattedDate}</span></div>
            <div className="flex justify-between text-sm"><span className="text-gray-500 font-medium">Horario</span><span className="font-semibold text-gray-800">{activePending.start_time?.slice(0, 5)}</span></div>
            <div className="flex justify-between text-sm pt-2 border-t border-gray-100">
              <span className="text-gray-500 font-medium">Valor total</span>
              <span className="font-display font-bold text-brand-700 text-lg">${Number(activePending.final_price || 0).toLocaleString('es-CO')} COP</span>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button onClick={handleCancelActive} className="btn-secondary flex-1 border-red-200 text-red-600 hover:bg-red-50">
              Cancelar cita
            </button>
            <button onClick={() => {
              setIsRescheduling(true)
              setSelectedService({ id: activePending.service_id, name: activePending.service_name, duration_minutes: activePending.duration_minutes })
              setStep(2) // Ir directamente a la selección de fecha
            }} className="btn-primary flex-1">
              Reagendar cita
            </button>
          </div>
        </div>
      </div>
    )
  }

  // FLUJO DE PASOS NORMAL (Solo accesible si no hay citas pendientes, o si se está reagendando)
  return (
    <div className="space-y-6">
      {/* Progress bar */}
      <div>
        <h1 className="font-display text-2xl font-bold text-gray-900 mb-4">
          {isRescheduling ? 'Reagendar mi cita' : 'Agendar cita'}
        </h1>
        <div className="flex items-center gap-2">
          {['Servicio', 'Fecha', 'Horario', 'Confirmar'].map((s, i) => (
            <div key={s} className="flex items-center gap-2 flex-1">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${step > i + 1 ? 'bg-brand-600 text-white' : step === i + 1 ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-400'}`}>
                {step > i + 1 ? '✓' : i + 1}
              </div>
              <span className={`text-xs hidden sm:block ${step === i + 1 ? 'text-brand-700 font-medium' : 'text-gray-400'}`}>{s}</span>
              {i < 3 && <div className={`flex-1 h-0.5 ${step > i + 1 ? 'bg-brand-300' : 'bg-gray-100'}`} />}
            </div>
          ))}
        </div>
      </div>

      {/* Promo banner */}
      {promo && !isRescheduling && (
        <div className="bg-gradient-to-r from-emerald-500 to-teal-500 rounded-xl p-4 text-white flex items-center gap-3">
          <Tag className="w-5 h-5 shrink-0" />
          <div>
            <p className="font-semibold text-sm">{promo.title} — {promo.discount_percent}% OFF</p>
            <p className="text-xs text-emerald-100">Válido hasta {format(new Date(promo.ends_at), "d MMM HH:mm", { locale: es })}</p>
          </div>
        </div>
      )}

      {/* Step 1: Services */}
      {step === 1 && (
        <div className="space-y-3">
          <h2 className="font-semibold text-gray-700">Selecciona el servicio</h2>
          {services.map(s => (
            <button key={s.id} onClick={() => { setSelectedService(s); setStep(2) }}
              className={`w-full text-left p-4 rounded-xl border-2 transition-all ${selectedService?.id === s.id ? 'border-brand-500 bg-brand-50' : 'border-gray-100 bg-white hover:border-brand-200'}`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-gray-900">{s.name}</p>
                  <p className="text-sm text-gray-500 mt-0.5">{s.description}</p>
                  <p className="text-xs text-gray-400 mt-1 flex items-center gap-1"><Clock className="w-3 h-3" /> {s.duration_minutes} minutos</p>
                </div>
                <div className="text-right ml-4">
                  {s.discounted_price ? (
                    <>
                      <p className="text-xs text-gray-400 line-through">${Number(s.price).toLocaleString('es-CO')}</p>
                      <p className="text-lg font-display font-bold text-emerald-600">${Number(s.discounted_price).toLocaleString('es-CO')}</p>
                    </>
                  ) : (
                    <p className="text-lg font-display font-bold text-brand-700">${Number(s.price).toLocaleString('es-CO')}</p>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Step 2: Calendar */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <button onClick={() => { if (isRescheduling) { setIsRescheduling(false); setStep(1) } else { setStep(1) } }} className="btn-ghost p-2"><ChevronLeft className="w-4 h-4" /></button>
            <h2 className="font-semibold text-gray-700">Selecciona la fecha</h2>
          </div>
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <button onClick={() => setCurrentMonth(m => subMonths(m, 1))} className="p-2 hover:bg-gray-100 rounded-lg transition-colors"><ChevronLeft className="w-4 h-4 text-gray-500" /></button>
              <span className="font-display font-semibold text-gray-900 capitalize">{format(currentMonth, 'MMMM yyyy', { locale: es })}</span>
              <button onClick={() => setCurrentMonth(m => addMonths(m, 1))} className="p-2 hover:bg-gray-100 rounded-lg transition-colors"><ChevronRight className="w-4 h-4 text-gray-500" /></button>
            </div>
            <div className="grid grid-cols-7 gap-1 mb-2">
              {DAYS.map(d => <div key={d} className="text-center text-xs font-semibold text-gray-400 py-1">{d}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {Array(firstDayOfWeek).fill(null).map((_, i) => <div key={`e${i}`} />)}
              {monthDays.map(day => {
                const isPast = isBefore(day, startOfDay(new Date()))
                const isSelected = selectedDate && isSameDay(day, selectedDate)
                return (
                  <button key={day.toString()} disabled={isPast}
                    onClick={() => { setSelectedDate(day); setStep(3) }}
                    className={`aspect-square rounded-xl text-sm font-medium transition-all ${isSelected ? 'bg-brand-600 text-white shadow-md' : isPast ? 'text-gray-200 cursor-not-allowed' : 'hover:bg-brand-50 hover:text-brand-700 text-gray-700'}`}>
                    {format(day, 'd')}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Step 3: Time slots */}
      {step === 3 && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <button onClick={() => setStep(2)} className="btn-ghost p-2"><ChevronLeft className="w-4 h-4" /></button>
            <div>
              <h2 className="font-semibold text-gray-700">Selecciona el horario</h2>
              <p className="text-xs text-gray-400 capitalize">{format(selectedDate, "EEEE d 'de' MMMM", { locale: es })}</p>
            </div>
          </div>
          {loading ? (
            <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin" /></div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {slots.map(s => (
                <button key={s.time} disabled={!s.available}
                  onClick={() => { setSelectedSlot(s.time); setStep(3.5) }}
                  className={`py-3 px-2 rounded-xl text-sm font-medium border-2 transition-all flex flex-col items-center gap-0.5 ${
                    !s.available
                      ? 'border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed'
                      : selectedSlot === s.time
                        ? 'border-brand-500 bg-brand-50 text-brand-700'
                        : 'border-brand-100 bg-brand-50/10 text-brand-700 hover:bg-brand-50/30 hover:border-brand-300'
                  }`}>
                  <span>{s.time}</span>
                  {!s.available && <span className="text-xs text-gray-400 font-normal">Ocupado</span>}
                </button>
              ))}
              {!slots.length && <p className="col-span-3 text-center text-gray-400 py-8">No hay horarios disponibles para este día</p>}
            </div>
          )}
        </div>
      )}

      {/* Step 3.5 -> 4: Confirm */}
      {step === 3.5 && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <button onClick={() => setStep(3)} className="btn-ghost p-2"><ChevronLeft className="w-4 h-4" /></button>
            <h2 className="font-semibold text-gray-700">Confirmar cita</h2>
          </div>
          <div className="card space-y-3">
            <div className="flex justify-between text-sm"><span className="text-gray-500">Servicio</span><span className="font-medium">{selectedService?.name}</span></div>
            <div className="flex justify-between text-sm"><span className="text-gray-500">Fecha</span><span className="font-medium capitalize">{format(selectedDate, "EEEE d 'de' MMMM", { locale: es })}</span></div>
            <div className="flex justify-between text-sm"><span className="text-gray-500">Horario</span><span className="font-medium">{selectedSlot}</span></div>
            <div className="flex justify-between text-sm"><span className="text-gray-500">Duración</span><span className="font-medium">{selectedService?.duration_minutes} min</span></div>
            
            <div className="border-t border-gray-100 pt-3 flex justify-between">
              <span className="font-semibold text-gray-800">Total</span>
              <span className="font-display font-bold text-brand-700 text-lg">
                ${Number(isRescheduling ? activePending.final_price : getPrice(selectedService)).toLocaleString('es-CO')} COP
              </span>
            </div>
          </div>
          
          {!isRescheduling && (
            <div>
              <label className="label" htmlFor="cita-notas">Notas adicionales (opcional)</label>
              <textarea id="cita-notas" className="input" rows={3} placeholder="Ej: Color de la moto, alguna indicación especial..." value={notes} onChange={e => setNotes(e.target.value)} />
            </div>
          )}
          
          <button onClick={confirmBooking} disabled={booking} className="btn-primary w-full py-3 text-base">
            {booking ? 'Procesando...' : isRescheduling ? 'Confirmar nuevo horario' : 'Confirmar cita'}
          </button>
          <p className="text-xs text-center text-gray-400">Recibirás una confirmación en tu correo electrónico</p>
        </div>
      )}
    </div>
  )
}