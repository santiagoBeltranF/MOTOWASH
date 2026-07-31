import bcrypt from 'bcryptjs'
import { query, queryOne } from '../config/db.js'
import { parsePaginacion, sqlLimitOffset, meta } from '../utils/pagination.js'
import { normalizarPlaca } from './appointmentController.js'
import logger from '../utils/logger.js'

/**
 * Clientes invitados: quien llega al mostrador sin cuenta.
 *
 * Se crean como usuarios reales con is_guest = TRUE y sin credenciales. Esa es
 * la decision de fondo: si fueran campos sueltos en la cita, el historial, la
 * busqueda por placa y los reportes tendrian que tratarlos como un caso aparte
 * en todas partes. Siendo usuarios, todo lo existente funciona igual.
 */

export const createGuest = async (req, res, next) => {
  try {
    const { name, phone, email, document_id } = req.body

    // Si dio correo y ya existe, no se crea un duplicado: se avisa de quien es.
    // Sin esto acabariamos con dos fichas de la misma persona y el historial
    // partido entre las dos.
    if (email) {
      const existente = await queryOne('SELECT id, name, is_guest FROM users WHERE email=?', [email])
      if (existente) {
        return res.status(409).json({
          message: existente.is_guest
            ? `Ya existe un invitado con ese correo (${existente.name})`
            : `Ese correo ya pertenece a una cuenta registrada (${existente.name})`,
          code: 'CORREO_EN_USO',
          clientId: existente.id
        })
      }
    }

    const result = await query(
      `INSERT INTO users (name, email, password, phone, document_id, role, is_guest, is_active, email_verified, two_fa_enabled)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [name.trim(), email || null, null, phone?.trim() || null, document_id?.trim() || null,
       'client', true, true, false, false]
    )
    const invitado = await queryOne(
      'SELECT id, name, email, phone, document_id, is_guest FROM users WHERE id=?', [result.insertId]
    )
    logger.info(`Invitado creado: ${invitado.name} (id ${invitado.id}) por usuario ${req.user.id}`)
    res.status(201).json({ client: invitado, message: 'Invitado registrado' })
  } catch (err) { next(err) }
}

/**
 * Convierte un invitado en cuenta normal.
 *
 * Es un UPDATE sobre la misma fila: el id no cambia, asi que sus citas, placas
 * y cobros siguen colgando de el. Esa es toda la razon por la que un invitado
 * es un usuario y no un puñado de campos en la cita.
 */
export const convertGuest = async (req, res, next) => {
  try {
    const { id } = req.params
    const { email, password } = req.body

    const invitado = await queryOne('SELECT id, name, is_guest FROM users WHERE id=?', [id])
    if (!invitado) return res.status(404).json({ message: 'Cliente no encontrado' })
    if (!invitado.is_guest) return res.status(400).json({ message: 'Ese cliente ya tiene una cuenta' })

    const ocupado = await queryOne('SELECT id FROM users WHERE email=? AND id<>?', [email, id])
    if (ocupado) return res.status(409).json({ message: 'Ese correo ya está en uso por otra cuenta' })

    const hash = await bcrypt.hash(password, 12)
    await query(
      'UPDATE users SET email=?, password=?, is_guest=FALSE, email_verified=TRUE, two_fa_enabled=TRUE WHERE id=?',
      [email, hash, id]
    )
    logger.info(`Invitado ${id} convertido en cuenta por usuario ${req.user.id}`)

    const cliente = await queryOne('SELECT id, name, email, phone, is_guest FROM users WHERE id=?', [id])
    res.json({ client: cliente, message: 'Invitado convertido en cuenta. Conserva todo su historial.' })
  } catch (err) { next(err) }
}

/**
 * Busqueda de clientes para el mostrador: por nombre, telefono, documento o
 * placa de una de sus motos. La placa es como pregunta la gente de verdad.
 */
export const searchClients = async (req, res, next) => {
  try {
    const { q } = req.query
    const paginacion = parsePaginacion(req.query)

    let desde = " FROM users u WHERE u.role='client' AND u.is_active=TRUE"
    const params = []

    if (q) {
      const placa = normalizarPlaca(q)
      desde += ` AND (u.name LIKE ? OR u.phone LIKE ? OR u.document_id LIKE ? OR u.email LIKE ?
                 OR EXISTS (SELECT 1 FROM appointments a WHERE a.client_id=u.id AND a.plate LIKE ?))`
      params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `${placa}%`)
    }

    const sql = `SELECT u.id, u.name, u.email, u.phone, u.document_id, u.is_guest,
                 (SELECT a.plate FROM appointments a WHERE a.client_id=u.id AND a.plate IS NOT NULL
                  ORDER BY a.id DESC LIMIT 1) AS ultima_placa` + desde +
                ' ORDER BY u.name ASC' + sqlLimitOffset(paginacion)

    const [clients, total] = await Promise.all([
      query(sql, params),
      queryOne('SELECT COUNT(*) as n' + desde, params)
    ])
    res.json({ clients, ...meta(paginacion, total.n) })
  } catch (err) { next(err) }
}
