import { query, queryOne, transaction, queryWith, queryOneWith } from '../config/db.js'
import { sendAppointmentConfirmation, sendAppointmentCancellation } from '../services/emailService.js'
import { parsePaginacion, sqlLimitOffset, meta } from '../utils/pagination.js'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

// Función auxiliar robusta con métodos UTC para evitar desfases de zona horaria
const getAptDateTimeObj = (appointmentDate, startTime) => {
  let dateStr;
  if (appointmentDate instanceof Date) {
    // Usar métodos UTC para evitar que la zona horaria reste un día
    const year = appointmentDate.getUTCFullYear();
    const month = String(appointmentDate.getUTCMonth() + 1).padStart(2, '0');
    const day = String(appointmentDate.getUTCDate()).padStart(2, '0');
    dateStr = `${year}-${month}-${day}`;
  } else if (typeof appointmentDate === 'string') {
    dateStr = appointmentDate.includes('T') ? appointmentDate.split('T')[0] : appointmentDate;
  } else {
    dateStr = String(appointmentDate);
  }
  return new Date(`${dateStr}T${startTime}`);
}

// Función auxiliar para verificar si una cita está en el futuro
const isFutureAppointment = (appointmentDate, startTime) => {
  const aptDateTime = getAptDateTimeObj(appointmentDate, startTime);
  if (isNaN(aptDateTime.getTime())) return false;
  return aptDateTime > new Date();
}

// Función auxiliar para verificar si falta menos de 30 minutos para la cita
const isWithin30Minutes = (appointmentDate, startTime) => {
  const aptDateTime = getAptDateTimeObj(appointmentDate, startTime);
  if (isNaN(aptDateTime.getTime())) return false;
  const limitTime = new Date(aptDateTime.getTime() - 30 * 60 * 1000); // 30 minutos antes
  return new Date() > limitTime;
}

// Convierte "HH:MM" a minutos desde medianoche. Devuelve null si no encaja.
const aMinutos = (hora) => {
  if (typeof hora !== 'string') return null
  const m = hora.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/)
  if (!m) return null
  const h = Number(m[1]), min = Number(m[2])
  if (h > 23 || min > 59) return null
  return h * 60 + min
}

const aHoraTexto = (minutos) =>
  `${String(Math.floor(minutos / 60)).padStart(2, '0')}:${String(minutos % 60).padStart(2, '0')}`

// Valida contra el horario del negocio. Devuelve un mensaje de error o null si
// la franja es valida.
//
// Antes esto no se comprobaba en el servidor: se confiaba en que el frontend
// solo ofreciera slots validos, asi que una peticion hecha a mano podia agendar
// a las 03:00 de un domingo o en una fecha pasada (hallazgo I6).
const validarFranjaNegocio = async (appointment_date, start_time, duracionMinutos) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(appointment_date || '')) {
    return 'Fecha con formato inválido. Se espera AAAA-MM-DD.'
  }
  const inicioMin = aMinutos(start_time)
  if (inicioMin === null) return 'Hora con formato inválido. Se espera HH:MM.'

  const inicio = new Date(`${appointment_date}T${aHoraTexto(inicioMin)}:00`)
  if (isNaN(inicio.getTime())) return 'Fecha u hora inválida'
  if (inicio <= new Date()) return 'No puedes agendar en una fecha u hora que ya pasó'

  const horario = await queryOne('SELECT * FROM schedule_config WHERE day_of_week=?', [inicio.getDay()])
  if (!horario || !horario.is_open) return 'El negocio no abre ese día'

  const aperturaMin = aMinutos(horario.open_time)
  const cierreMin = aMinutos(horario.close_time)
  if (aperturaMin === null || cierreMin === null) return 'Horario del negocio mal configurado'

  if (inicioMin < aperturaMin) {
    return `El negocio abre a las ${aHoraTexto(aperturaMin)} ese día`
  }
  // La cita tiene que caber entera antes de cerrar, no solo empezar antes.
  if (inicioMin + duracionMinutos > cierreMin) {
    return `Ese servicio dura ${duracionMinutos} minutos y no alcanza a terminar antes del cierre (${aHoraTexto(cierreMin)})`
  }
  return null
}

export const getAvailableSlots = async (req, res, next) => {
  try {
    const { date, service_id } = req.query
    if (!date || !service_id) return res.status(400).json({ message: 'Fecha y servicio requeridos' })

    // Sin este chequeo, un `date` con basura produce un Invalid Date y
    // getDay() devuelve NaN, que acababa entrando en la consulta SQL.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ message: 'Fecha con formato inválido. Se espera AAAA-MM-DD.' })
    }
    const dateObj = new Date(date + 'T00:00:00')
    if (isNaN(dateObj.getTime())) {
      return res.status(400).json({ message: 'Fecha inválida' })
    }
    const dayOfWeek = dateObj.getDay()

    const schedule = await queryOne('SELECT * FROM schedule_config WHERE day_of_week=?', [dayOfWeek])
    if (!schedule?.is_open) return res.json({ slots: [], message: 'Día no laborable' })

    const service = await queryOne('SELECT duration_minutes FROM services WHERE id=?', [service_id])
    if (!service) return res.status(404).json({ message: 'Servicio no encontrado' })

    const settings = await query('SELECT key_name, value FROM settings WHERE key_name IN (?,?)',
      ['max_appointments_per_slot', 'appointment_interval_minutes'])
    const settingsMap = Object.fromEntries(settings.map(s => [s.key_name, parseInt(s.value)]))
    const maxPerSlot = settingsMap.max_appointments_per_slot || 1
    const intervalMin = settingsMap.appointment_interval_minutes || service.duration_minutes

    // LÍNEAS RESTAURADAS: Cálculos de minutos de apertura y cierre
    const [openH, openM] = schedule.open_time.split(':').map(Number)
    const [closeH, closeM] = schedule.close_time.split(':').map(Number)
    const openMinutes = openH * 60 + openM
    const closeMinutes = closeH * 60 + closeM

    // Consulta de ocupación optimizada
    const existingAppts = await query(
      "SELECT TIME_FORMAT(start_time, '%H:%i') as start_time, COUNT(*) as cnt FROM appointments WHERE appointment_date = ? AND status != 'cancelled' GROUP BY start_time",
      [date]
    )
    
    const takenTimes = {}
    existingAppts.forEach(a => { takenTimes[a.start_time] = a.cnt })

    const slots = []
    const now = new Date()
    const isToday = date === now.toISOString().split('T')[0]

    for (let m = openMinutes; m + service.duration_minutes <= closeMinutes; m += intervalMin) {
      const h = String(Math.floor(m / 60)).padStart(2, '0')
      const min = String(m % 60).padStart(2, '0')
      const timeStr = `${h}:${min}`

      // Si es hoy, ocultar horarios que ya pasaron (con 30 min de margen)
      if (isToday) {
        const slotMinutes = m
        const nowMinutes = now.getHours() * 60 + now.getMinutes() + 30
        if (slotMinutes <= nowMinutes) continue
      }

      const count = takenTimes[timeStr] || 0
      slots.push({ time: timeStr, available: count < maxPerSlot, taken: count, max: maxPerSlot })
    }
    res.json({ slots, schedule: { open: schedule.open_time, close: schedule.close_time } })
  } catch (err) { next(err) }
}

export const createAppointment = async (req, res, next) => {
  try {
    const { service_id, appointment_date, start_time, notes } = req.body
    const clientId = req.user.id

    const service = await queryOne('SELECT * FROM services WHERE id=? AND is_active=TRUE', [service_id])
    if (!service) return res.status(404).json({ message: 'Servicio no disponible' })

    // Validacion de horario de negocio antes de tomar ningun bloqueo: si la
    // franja no es valida no hace falta molestar a la transaccion.
    const errorFranja = await validarFranjaNegocio(appointment_date, start_time, service.duration_minutes)
    if (errorFranja) return res.status(400).json({ message: errorFranja })

    // Calcular hora fin
    const [h, m] = start_time.split(':').map(Number)
    const endMin = h * 60 + m + service.duration_minutes
    const end_time = `${String(Math.floor(endMin / 60)).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`

    const resultado = await transaction(async (conn) => {
      // CERROJO. Todo lo que decide si hay cupo va detras de este SELECT ...
      // FOR UPDATE sobre una fila que existe siempre.
      //
      // Antes esto era consultar-decidir-insertar sin bloqueo: dos peticiones
      // simultaneas leian el mismo conteo y ambas insertaban, superando
      // max_appointments_per_slot (hallazgo C5).
      //
      // Se bloquea la fila de configuracion, no el rango de citas, y es a
      // proposito: un `SELECT ... FOR UPDATE` sobre el rango (fecha, hora)
      // tomaria gap locks, que son compatibles entre si, y las dos
      // transacciones acabarian en INTERBLOQUEO al intentar insertar. Bloquear
      // una fila real da exclusion mutua limpia.
      //
      // El precio es que las reservas se serializan globalmente, no por franja.
      // Para este negocio es irrelevante: la transaccion son cuatro consultas
      // cortas. Si algun dia el volumen lo pide, la evolucion natural es una
      // tabla de franjas con una fila por (fecha, hora) y bloquear esa.
      const cfg = await queryOneWith(
        conn,
        "SELECT value FROM settings WHERE key_name='max_appointments_per_slot' FOR UPDATE"
      )
      const maxPerSlot = parseInt(cfg?.value || '1')

      // Cita pendiente activa: tambien dentro del cerrojo, para que dos
      // peticiones del mismo cliente no puedan colarse a la vez.
      const pendingAppts = await queryWith(
        conn,
        "SELECT appointment_date, start_time FROM appointments WHERE client_id = ? AND status = 'pending'",
        [clientId]
      )
      for (const apt of pendingAppts) {
        if (isFutureAppointment(apt.appointment_date, apt.start_time)) {
          return { error: { status: 400, message: 'No puedes agendar una nueva cita mientras tengas otra pendiente activa' } }
        }
      }

      const taken = await queryOneWith(
        conn,
        'SELECT COUNT(*) as cnt FROM appointments WHERE appointment_date=? AND start_time=? AND status!=?',
        [appointment_date, start_time, 'cancelled']
      )
      if (taken.cnt >= maxPerSlot) return { error: { status: 409, message: 'Horario no disponible' } }

      // Calcular precio con promoción activa. Se usa NOW() de MySQL en vez de
      // pasar un Date de JS, para que la comparacion se haga en la misma zona en
      // la que estan guardadas las ventanas de promocion (hora de pared local).
      const promo = await queryOneWith(
        conn,
        'SELECT * FROM promotions WHERE is_active=TRUE AND NOW() BETWEEN starts_at AND ends_at LIMIT 1'
      )
      let finalPrice = service.price
      let discountApplied = 0
      if (promo) {
        const applies = promo.applies_to === 'all' ||
          await queryOneWith(conn, 'SELECT 1 FROM promotion_services WHERE promotion_id=? AND service_id=?', [promo.id, service_id])
        if (applies) {
          discountApplied = promo.discount_percent
          finalPrice = parseFloat((service.price * (1 - discountApplied / 100)).toFixed(2))
        }
      }

      // Inserción explícita de 'pending' para evitar que se cree confirmada por defecto
      const insert = await queryWith(
        conn,
        'INSERT INTO appointments (client_id, service_id, appointment_date, start_time, end_time, notes, final_price, discount_applied, status) VALUES (?,?,?,?,?,?,?,?,?)',
        [clientId, service_id, appointment_date, start_time, end_time, notes || null, finalPrice, discountApplied, 'pending']
      )
      return { appointmentId: insert.insertId, finalPrice, discountApplied }
    })

    if (resultado.error) {
      return res.status(resultado.error.status).json({ message: resultado.error.message })
    }

    // El correo va fuera de la transaccion: mantener abierto el cerrojo durante
    // una conexion SMTP bloquearia las reservas de todos los demas.
    const client = await queryOne('SELECT name, email FROM users WHERE id=?', [clientId])
    const dateFormatted = format(getAptDateTimeObj(appointment_date, start_time), "d 'de' MMMM 'de' yyyy", { locale: es })
    await sendAppointmentConfirmation(client.email, client.name, {
      service: service.name,
      date: dateFormatted,
      time: start_time,
      price: `$${resultado.finalPrice.toLocaleString('es-CO')} COP${resultado.discountApplied ? ` (${resultado.discountApplied}% descuento)` : ''}`
    })

    res.status(201).json({ message: 'Cita agendada exitosamente', appointmentId: resultado.appointmentId })
  } catch (err) { next(err) }
}

export const getAppointments = async (req, res, next) => {
  try {
    const isAdmin = req.user.role === 'admin'
    const { status, date } = req.query
    const paginacion = parsePaginacion(req.query)

    // El FROM y el WHERE se arman una sola vez para poder reutilizarlos en el
    // COUNT: si se duplicaran, el total y la pagina podrian dejar de coincidir.
    let desde = ` FROM appointments a
               JOIN users u ON a.client_id=u.id JOIN services s ON a.service_id=s.id WHERE 1=1`
    const params = []

    if (!isAdmin) {
      desde += ' AND a.client_id=?'
      params.push(req.user.id)
      // Ocultar citas canceladas para los clientes en su lista
      desde += " AND a.status != 'cancelled'"
    }
    if (status) { desde += ' AND a.status=?'; params.push(status) }
    if (date) { desde += ' AND a.appointment_date=?'; params.push(date) }

    const sql = `SELECT a.*, u.name as client_name, u.email as client_email, u.phone as client_phone,
               s.name as service_name` + desde +
               ' ORDER BY a.appointment_date DESC, a.start_time DESC, a.id DESC' + sqlLimitOffset(paginacion)

    const [appointments, total] = await Promise.all([
      query(sql, params),
      queryOne('SELECT COUNT(*) as n' + desde, params)
    ])
    res.json({ appointments, ...meta(paginacion, total.n) })
  } catch (err) { next(err) }
}

export const cancelAppointment = async (req, res, next) => {
  try {
    const { id } = req.params
    const apt = await queryOne(
      'SELECT a.*, u.name, u.email, s.name as service_name FROM appointments a JOIN users u ON a.client_id=u.id JOIN services s ON a.service_id=s.id WHERE a.id=?',
      [id]
    )
    if (!apt) return res.status(404).json({ message: 'Cita no encontrada' })
    if (req.user.role !== 'admin' && apt.client_id !== req.user.id) {
      return res.status(403).json({ message: 'No tienes permiso para cancelar esta cita' })
    }
    if (apt.status === 'cancelled') return res.status(400).json({ message: 'La cita ya está cancelada' })

    // Validar límite de 30 minutos para cancelación de clientes
    if (req.user.role !== 'admin' && isWithin30Minutes(apt.appointment_date, apt.start_time)) {
      return res.status(400).json({ message: 'No puedes cancelar con menos de 30 minutos de anticipación' })
    }

    await query('UPDATE appointments SET status=? WHERE id=?', ['cancelled', id])
    
    // Obtener la fecha formateada de manera segura
    const dateFormatted = format(getAptDateTimeObj(apt.appointment_date, apt.start_time), "d 'de' MMMM", { locale: es })
    await sendAppointmentCancellation(apt.email, apt.name, { service: apt.service_name, date: dateFormatted, time: apt.start_time })
    
    res.json({ message: 'Cita cancelada exitosamente' })
  } catch (err) { next(err) }
}

export const updateAppointmentStatus = async (req, res, next) => {
  try {
    const { id } = req.params
    const { status } = req.body
    if (!['pending', 'confirmed', 'completed', 'cancelled'].includes(status)) {
      return res.status(400).json({ message: 'Estado no válido' })
    }

    const apt = await queryOne('SELECT * FROM appointments WHERE id=?', [id])
    if (!apt) return res.status(404).json({ message: 'Cita no encontrada' })

    // Validar que no se marque como completada (lavado realizado) antes de que empiece la cita
    if (status === 'completed') {
      const aptDateTime = getAptDateTimeObj(apt.appointment_date, apt.start_time)
      if (new Date() < aptDateTime) {
        // Formatear la fecha y hora de la cita de manera amigable para el mensaje
        const dateFormatted = format(aptDateTime, "d 'de' MMMM", { locale: es })
        const timeFormatted = apt.start_time.substring(0, 5)
        
        return res.status(400).json({ 
          message: `No puedes marcar esta cita como realizada porque aún no ha llegado su fecha y hora programadas (inicia el ${dateFormatted} a las ${timeFormatted})` 
        })
      }
    }

    await query('UPDATE appointments SET status=? WHERE id=?', [status, id])
    res.json({ message: 'Estado actualizado' })
  } catch (err) { next(err) }
}

// Obtener cita pendiente activa del usuario
export const getActivePendingAppointment = async (req, res, next) => {
  try {
    const clientId = req.user.id
    const pendingAppts = await query(
      "SELECT a.*, s.name as service_name, s.duration_minutes FROM appointments a JOIN services s ON a.service_id=s.id WHERE a.client_id=? AND a.status='pending'",
      [clientId]
    )

    let activePending = null
    for (const apt of pendingAppts) {
      if (isFutureAppointment(apt.appointment_date, apt.start_time)) {
        activePending = apt
        break
      }
    }

    res.json({ activePending })
  } catch (err) { next(err) }
}

// Reagendar cita activa
export const rescheduleAppointment = async (req, res, next) => {
  try {
    const { id } = req.params
    const { appointment_date, start_time } = req.body
    const clientId = req.user.id

    const apt = await queryOne('SELECT * FROM appointments WHERE id=?', [id])
    if (!apt) return res.status(404).json({ message: 'Cita no encontrada' })
    
    if (req.user.role !== 'admin' && apt.client_id !== clientId) {
      return res.status(403).json({ message: 'No tienes permiso para modificar esta cita' })
    }

    if (apt.status === 'cancelled' || apt.status === 'completed') {
      return res.status(400).json({ message: 'No puedes reagendar una cita finalizada o cancelada' })
    }

    // Validar límite de 30 minutos en la cita original
    if (req.user.role !== 'admin' && isWithin30Minutes(apt.appointment_date, apt.start_time)) {
      return res.status(400).json({ message: 'No puedes reagendar con menos de 30 minutos de anticipación' })
    }

    const service = await queryOne('SELECT duration_minutes FROM services WHERE id=?', [apt.service_id])
    if (!service) return res.status(404).json({ message: 'Servicio no encontrado' })

    // El nuevo horario tambien tiene que caer en dia laborable, dentro del
    // horario de apertura y en el futuro. Antes solo se comprobaba el cupo, asi
    // que se podia reagendar a las 03:00 de un domingo (hallazgo I6).
    const errorFranja = await validarFranjaNegocio(appointment_date, start_time, service.duration_minutes)
    if (errorFranja) return res.status(400).json({ message: errorFranja })

    // Calcular hora fin para el nuevo horario
    const [h, m] = start_time.split(':').map(Number)
    const endMin = h * 60 + m + service.duration_minutes
    const end_time = `${String(Math.floor(endMin / 60)).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`

    // Mismo cerrojo que en createAppointment: comprobar cupo y escribir dentro
    // de la misma transaccion, si no dos reagendados simultaneos al mismo hueco
    // pasarian los dos la comprobacion.
    const resultado = await transaction(async (conn) => {
      const cfg = await queryOneWith(
        conn,
        "SELECT value FROM settings WHERE key_name='max_appointments_per_slot' FOR UPDATE"
      )
      const maxPerSlot = parseInt(cfg?.value || '1')

      const taken = await queryOneWith(
        conn,
        'SELECT COUNT(*) as cnt FROM appointments WHERE appointment_date=? AND start_time=? AND id!=? AND status!=?',
        [appointment_date, start_time, id, 'cancelled']
      )
      if (taken.cnt >= maxPerSlot) {
        return { error: { status: 409, message: 'El nuevo horario no está disponible' } }
      }

      await queryWith(
        conn,
        'UPDATE appointments SET appointment_date=?, start_time=?, end_time=? WHERE id=?',
        [appointment_date, start_time, end_time, id]
      )
      return {}
    })

    if (resultado.error) {
      return res.status(resultado.error.status).json({ message: resultado.error.message })
    }

    res.json({ message: 'Cita reagendada exitosamente' })
  } catch (err) { next(err) }
}