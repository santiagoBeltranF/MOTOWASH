import { query, queryOne } from '../config/db.js'
import { parsePaginacion, sqlLimitOffset, meta } from '../utils/pagination.js'

export const getDashboardStats = async (req, res, next) => {
  try {
    const [totalClients, totalAppointments, monthAppointments, revenue, monthRevenue, recentAppointments, topServices, clientsPerMonth] = await Promise.all([
      queryOne("SELECT COUNT(*) as total FROM users WHERE role='client' AND is_active=TRUE"),
      queryOne("SELECT COUNT(*) as total FROM appointments WHERE status != 'cancelled'"),
      // Corrección: Ahora cuenta las citas del mes actual en lugar de solo las de hoy
      queryOne("SELECT COUNT(*) as total FROM appointments WHERE MONTH(appointment_date) = MONTH(NOW()) AND YEAR(appointment_date) = YEAR(NOW()) AND status != 'cancelled'"),
      queryOne("SELECT SUM(final_price) as total FROM appointments WHERE status='completed'"),
      queryOne("SELECT SUM(final_price) as total FROM appointments WHERE status='completed' AND MONTH(appointment_date)=MONTH(NOW()) AND YEAR(appointment_date)=YEAR(NOW())"),
      query(`SELECT a.id, u.name as client, s.name as service, a.appointment_date, a.start_time, a.status, a.final_price
             FROM appointments a JOIN users u ON a.client_id=u.id JOIN services s ON a.service_id=s.id
             ORDER BY a.created_at DESC LIMIT 10`),
      query(`SELECT s.name, COUNT(*) as total, SUM(a.final_price) as revenue
             FROM appointments a JOIN services s ON a.service_id=s.id
             WHERE a.status='completed' GROUP BY s.id, s.name ORDER BY total DESC LIMIT 5`),
      query(`SELECT MONTH(created_at) as month, YEAR(created_at) as year, COUNT(*) as total
             FROM users WHERE role='client' GROUP BY YEAR(created_at), MONTH(created_at)
             ORDER BY year DESC, month DESC LIMIT 12`)
    ])

    res.json({
      stats: {
        totalClients: totalClients.total,
        totalAppointments: totalAppointments.total,
        todayAppointments: monthAppointments.total, // Mantenemos el nombre para compatibilidad con el frontend actual
        monthAppointments: monthAppointments.total, // Clave corregida opcional
        totalRevenue: revenue.total || 0,
        monthRevenue: monthRevenue.total || 0
      },
      recentAppointments,
      topServices,
      clientsPerMonth
    })
  } catch (err) { next(err) }
}

export const getRevenueReport = async (req, res, next) => {
  try {
    const { from, to, group_by = 'day' } = req.query
    let groupExpr = 'DATE(appointment_date)'
    let labelExpr = 'DATE(appointment_date)'
    if (group_by === 'week') { groupExpr = 'YEARWEEK(appointment_date)'; labelExpr = 'MIN(appointment_date)' }
    if (group_by === 'month') { groupExpr = 'DATE_FORMAT(appointment_date,"%Y-%m")'; labelExpr = 'DATE_FORMAT(appointment_date,"%Y-%m")' }

    let sql = `SELECT ${labelExpr} as period, COUNT(*) as appointments, SUM(final_price) as revenue, AVG(final_price) as avg_ticket
               FROM appointments WHERE status='completed'`
    const params = []
    if (from) { sql += ' AND appointment_date >= ?'; params.push(from) }
    if (to) { sql += ' AND appointment_date <= ?'; params.push(to) }
    sql += ` GROUP BY ${groupExpr} ORDER BY period ASC`

    const data = await query(sql, params)
    res.json({ data })
  } catch (err) { next(err) }
}

export const getClientsReport = async (req, res, next) => {
  try {
    const { search } = req.query
    const paginacion = parsePaginacion(req.query)
    const { page, limit } = paginacion

    let sql = `SELECT u.id, u.name, u.email, u.phone, u.created_at,
               COUNT(a.id) as total_appointments,
               SUM(CASE WHEN a.status='completed' THEN 1 ELSE 0 END) as completed,
               SUM(CASE WHEN a.status='cancelled' THEN 1 ELSE 0 END) as cancelled,
               SUM(CASE WHEN a.status='completed' THEN a.final_price ELSE 0 END) as total_spent,
               MAX(a.appointment_date) as last_appointment
               FROM users u LEFT JOIN appointments a ON u.id=a.client_id
               WHERE u.role='client' AND u.is_active=TRUE`
    const params = []
    if (search) { sql += ' AND (u.name LIKE ? OR u.email LIKE ?)'; params.push(`%${search}%`, `%${search}%`) }
    sql += ' GROUP BY u.id ORDER BY u.created_at DESC' + sqlLimitOffset(paginacion)

    const [clients, total] = await Promise.all([
      query(sql, params),
      queryOne(`SELECT COUNT(*) as total FROM users WHERE role='client' AND is_active=TRUE${search ? ' AND (name LIKE ? OR email LIKE ?)' : ''}`,
        search ? [`%${search}%`, `%${search}%`] : [])
    ])

    // Se conservan `total`, `page` y `limit` sueltos por compatibilidad y se
    // anade `totalPages`, que es lo que necesitan los controles de paginacion.
    res.json({ clients, ...meta(paginacion, total.total) })
  } catch (err) { next(err) }
}

export const getAppointmentsReport = async (req, res, next) => {
  try {
    const { from, to, status, service_id } = req.query
    const paginacion = parsePaginacion(req.query)

    let desde = ` FROM appointments a JOIN users u ON a.client_id=u.id JOIN services s ON a.service_id=s.id WHERE 1=1`
    const params = []
    if (from) { desde += ' AND a.appointment_date >= ?'; params.push(from) }
    if (to) { desde += ' AND a.appointment_date <= ?'; params.push(to) }
    if (status) { desde += ' AND a.status = ?'; params.push(status) }
    if (service_id) { desde += ' AND a.service_id = ?'; params.push(service_id) }

    const sql = `SELECT a.id, u.name as client, u.email, s.name as service,
               a.appointment_date, a.start_time, a.end_time, a.status,
               a.final_price, a.discount_applied, a.notes, a.created_at` + desde +
               ' ORDER BY a.appointment_date DESC, a.start_time DESC' + sqlLimitOffset(paginacion)

    const [appointments, total] = await Promise.all([
      query(sql, params),
      queryOne('SELECT COUNT(*) as n' + desde, params)
    ])
    res.json({ appointments, ...meta(paginacion, total.n) })
  } catch (err) { next(err) }
}