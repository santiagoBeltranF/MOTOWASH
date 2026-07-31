import { query, queryOne } from '../config/db.js'
import { parsePaginacion, sqlLimitOffset, meta } from '../utils/pagination.js'

export const getSchedule = async (req, res, next) => {
  try {
    const schedule = await query('SELECT * FROM schedule_config ORDER BY day_of_week')
    res.json({ schedule })
  } catch (err) { next(err) }
}

export const updateSchedule = async (req, res, next) => {
  try {
    const { schedule } = req.body
    for (const day of schedule) {
      await query(
        'UPDATE schedule_config SET is_open=?, open_time=?, close_time=? WHERE day_of_week=?',
        [day.is_open, day.open_time, day.close_time, day.day_of_week]
      )
    }
    res.json({ message: 'Horario actualizado exitosamente' })
  } catch (err) { next(err) }
}

export const getSettings = async (req, res, next) => {
  try {
    const rows = await query('SELECT * FROM settings')
    const settings = Object.fromEntries(rows.map(r => [r.key_name, { value: r.value, label: r.label }]))
    res.json({ settings })
  } catch (err) { next(err) }
}

export const updateSettings = async (req, res, next) => {
  try {
    const { settings } = req.body
    for (const [key, value] of Object.entries(settings)) {
      await query('UPDATE settings SET value=? WHERE key_name=?', [value, key])
    }
    res.json({ message: 'Configuración guardada' })
  } catch (err) { next(err) }
}

export const getClients = async (req, res, next) => {
  try {
    const { search } = req.query
    const paginacion = parsePaginacion(req.query)
    let desde = " FROM users WHERE role='client'"
    const params = []
    if (search) { desde += ' AND (name LIKE ? OR email LIKE ?)'; params.push(`%${search}%`, `%${search}%`) }

    const sql = 'SELECT id, name, email, phone, is_active, created_at' + desde +
                ' ORDER BY created_at DESC' + sqlLimitOffset(paginacion)

    const [clients, total] = await Promise.all([
      query(sql, params),
      queryOne('SELECT COUNT(*) as n' + desde, params)
    ])
    res.json({ clients, ...meta(paginacion, total.n) })
  } catch (err) { next(err) }
}

export const toggleClientStatus = async (req, res, next) => {
  try {
    const { id } = req.params
    const client = await queryOne("SELECT is_active FROM users WHERE id=? AND role='client'", [id])
    if (!client) return res.status(404).json({ message: 'Cliente no encontrado' })
    await query('UPDATE users SET is_active=? WHERE id=?', [!client.is_active, id])
    res.json({ message: `Cliente ${client.is_active ? 'desactivado' : 'activado'}` })
  } catch (err) { next(err) }
}
