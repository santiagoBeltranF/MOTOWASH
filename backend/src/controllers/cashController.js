import { query, queryOne, transaction, queryWith, queryOneWith } from '../config/db.js'
import { aCentavos, aDecimal, sumar } from '../utils/dinero.js'
import logger from '../utils/logger.js'

/**
 * Turno de caja.
 *
 * Reglas de fondo:
 *  - Solo puede haber un turno abierto a la vez. Lo garantiza un índice único
 *    sobre una columna generada en la tabla, no solo este código.
 *  - Un turno pertenece a UN día de operación y no se arrastra ni se cierra
 *    solo. Si queda abierto de un día anterior queda VENCIDO y bloquea el
 *    cobro hasta que alguien lo cierre con conteo real.
 *  - El arqueo es sobre EFECTIVO. Una transferencia no pasa por el cajón, así
 *    que no entra en lo que se cuenta al cerrar.
 */

const hoyISO = () => aISO(new Date())

// mysql2 devuelve las columnas DATE como objetos Date, y `String(fecha)` da
// «Mon Jul 30 2026 ...», no «2026-07-30». Comparar los diez primeros
// caracteres de eso no detecta nunca un turno vencido: hay que normalizar.
const aISO = (valor) => {
  if (!valor) return ''
  const d = valor instanceof Date ? valor : new Date(String(valor).slice(0, 10) + 'T00:00:00')
  if (isNaN(d.getTime())) return String(valor).slice(0, 10)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// «Vencido» se deriva, no se guarda: un turno abierto de un día anterior lo
// está por definición. Guardarlo como bandera obligaría a un proceso que la
// pusiera al día y podría quedar desfasada.
const estaVencido = (turno) =>
  turno && turno.status === 'open' && aISO(turno.operation_date) < hoyISO()

// Efectivo cobrado en el turno, descontando lo anulado. Es lo que debería
// haber en el cajón por encima de la base inicial.
const efectivoDelTurno = async (ejecutar, shiftId) => {
  const fila = await ejecutar(
    `SELECT COALESCE(SUM(p.amount), 0) AS total
       FROM receipt_payments p
       JOIN receipts r ON r.id = p.receipt_id
      WHERE r.shift_id = ? AND r.status = 'issued' AND p.method = 'cash'`,
    [shiftId]
  )
  return aCentavos(fila?.total ?? 0)
}

const conDatosDerivados = async (turno) => {
  if (!turno) return null
  const efectivo = await efectivoDelTurno((sql, p) => queryOne(sql, p), turno.id)
  const base = aCentavos(turno.opening_amount)
  return {
    ...turno,
    vencido: estaVencido(turno),
    efectivo_cobrado: aDecimal(efectivo),
    efectivo_esperado: aDecimal(base + efectivo)
  }
}

export const getTurnoActual = async (req, res, next) => {
  try {
    const turno = await queryOne(
      `SELECT c.*, u.name AS opened_by_name
         FROM cash_shifts c JOIN users u ON u.id = c.opened_by
        WHERE c.status = 'open' LIMIT 1`
    )
    res.json({ shift: await conDatosDerivados(turno) })
  } catch (err) { next(err) }
}

export const abrirTurno = async (req, res, next) => {
  try {
    const { opening_amount, notes } = req.body

    const resultado = await transaction(async (conn) => {
      const abierto = await queryOneWith(conn, "SELECT id, operation_date FROM cash_shifts WHERE status='open' LIMIT 1 FOR UPDATE")
      if (abierto) {
        const vencido = aISO(abierto.operation_date) < hoyISO()
        return {
          error: {
            status: 409,
            message: vencido
              ? 'Hay un turno de un día anterior sin cerrar. Ciérralo con el conteo real antes de abrir uno nuevo.'
              : 'Ya hay un turno de caja abierto',
            code: vencido ? 'TURNO_VENCIDO' : 'TURNO_ABIERTO'
          }
        }
      }

      const centavos = aCentavos(opening_amount)
      if (centavos < 0) return { error: { status: 400, message: 'La base inicial no puede ser negativa' } }

      const insert = await queryWith(
        conn,
        `INSERT INTO cash_shifts (operation_date, opened_by, opened_at, opening_amount, status, closing_notes)
         VALUES (?,?,NOW(),?,'open',?)`,
        [hoyISO(), req.user.id, aDecimal(centavos), notes?.trim() || null]
      )
      return { id: insert.insertId }
    })

    if (resultado.error) {
      const { status, message, code } = resultado.error
      return res.status(status).json({ message, code })
    }

    logger.info(`Turno de caja ${resultado.id} abierto por usuario ${req.user.id}`)
    const turno = await queryOne('SELECT * FROM cash_shifts WHERE id=?', [resultado.id])
    res.status(201).json({ shift: await conDatosDerivados(turno), message: 'Turno abierto' })
  } catch (err) { next(err) }
}

export const cerrarTurno = async (req, res, next) => {
  try {
    const { counted_amount, notes } = req.body

    const resultado = await transaction(async (conn) => {
      const turno = await queryOneWith(conn, "SELECT * FROM cash_shifts WHERE status='open' LIMIT 1 FOR UPDATE")
      if (!turno) return { error: { status: 409, message: 'No hay ningún turno abierto' } }

      const contado = aCentavos(counted_amount)
      if (contado < 0) return { error: { status: 400, message: 'El conteo no puede ser negativo' } }

      const efectivo = await efectivoDelTurno((sql, p) => queryOneWith(conn, sql, p), turno.id)
      const esperado = aCentavos(turno.opening_amount) + efectivo
      // Positiva = sobra dinero en caja; negativa = falta.
      const diferencia = contado - esperado

      // El cierre es tardío si ocurre en un día posterior al de operación. Se
      // guarda como tal para que el reporte pueda distinguirlo, junto con las
      // dos marcas de tiempo reales.
      const tardio = aISO(turno.operation_date) < hoyISO()

      await queryWith(
        conn,
        `UPDATE cash_shifts
            SET status='closed', closed_by=?, closed_at=NOW(), was_late_close=?,
                counted_amount=?, expected_amount=?, difference_amount=?, closing_notes=?
          WHERE id=?`,
        [req.user.id, tardio, aDecimal(contado), aDecimal(esperado), aDecimal(diferencia),
         notes?.trim() || null, turno.id]
      )
      return { id: turno.id, esperado, contado, diferencia, tardio }
    })

    if (resultado.error) return res.status(resultado.error.status).json({ message: resultado.error.message })

    logger.info(`Turno ${resultado.id} cerrado por usuario ${req.user.id}; diferencia ${aDecimal(resultado.diferencia)}`)
    const turno = await queryOne('SELECT * FROM cash_shifts WHERE id=?', [resultado.id])
    res.json({
      shift: turno,
      message: resultado.diferencia === 0
        ? 'Turno cerrado. La caja cuadra exactamente.'
        : `Turno cerrado con una diferencia de ${aDecimal(resultado.diferencia)}`
    })
  } catch (err) { next(err) }
}

export const listarTurnos = async (req, res, next) => {
  try {
    const { from, to } = req.query
    let sql = `SELECT c.*, ua.name AS opened_by_name, uc.name AS closed_by_name,
                 (SELECT COUNT(*) FROM receipts r WHERE r.shift_id=c.id AND r.status='issued') AS recibos
               FROM cash_shifts c
               JOIN users ua ON ua.id=c.opened_by
               LEFT JOIN users uc ON uc.id=c.closed_by
              WHERE 1=1`
    const params = []
    if (from) { sql += ' AND c.operation_date >= ?'; params.push(from) }
    if (to) { sql += ' AND c.operation_date <= ?'; params.push(to) }
    sql += ' ORDER BY c.operation_date DESC, c.id DESC LIMIT 100'

    const turnos = await query(sql, params)
    res.json({ shifts: turnos.map(t => ({ ...t, vencido: estaVencido(t) })) })
  } catch (err) { next(err) }
}

// Exportado para que el cobro pueda exigir turno abierto y no vencido sin
// duplicar la regla.
export const turnoUtilizable = async (ejecutar) => {
  const turno = await ejecutar("SELECT * FROM cash_shifts WHERE status='open' LIMIT 1 FOR UPDATE")
  if (!turno) {
    return { error: { status: 409, message: 'No hay un turno de caja abierto. Abre la caja antes de cobrar.', code: 'SIN_TURNO' } }
  }
  if (estaVencido(turno)) {
    return {
      error: {
        status: 409,
        message: 'El turno abierto es de un día anterior. Ciérralo con el conteo real antes de seguir cobrando.',
        code: 'TURNO_VENCIDO'
      }
    }
  }
  return { turno }
}

export { estaVencido, hoyISO, aISO, efectivoDelTurno, sumar }
