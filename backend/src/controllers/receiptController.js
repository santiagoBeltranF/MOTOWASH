import { query, queryOne, transaction, queryWith, queryOneWith } from '../config/db.js'
import { parsePaginacion, sqlLimitOffset, meta } from '../utils/pagination.js'
import { aCentavos, aDecimal, sumar } from '../utils/dinero.js'
import { turnoUtilizable } from './cashController.js'
import logger from '../utils/logger.js'

/**
 * Cobro y recibo de venta.
 *
 * El pago es siempre completo: la suma de los métodos tiene que dar el total
 * exacto o el cobro se rechaza. No hay saldos pendientes ni abonos.
 *
 * Todo el dinero se opera en centavos enteros. La comparación «suman lo mismo»
 * con decimales de coma flotante es precisamente donde aparecen los descuadres
 * de un peso que luego nadie encuentra.
 */

// Consecutivo global y continuo. Se bloquea la fila del contador dentro de la
// misma transacción que inserta el recibo: si algo falla y la transacción se
// deshace, el número vuelve a quedar libre y no se abre un hueco.
const siguienteConsecutivo = async (conn) => {
  await queryWith(conn, 'SELECT last_number FROM receipt_sequence WHERE id=1 FOR UPDATE')
  await queryWith(conn, 'UPDATE receipt_sequence SET last_number = last_number + 1 WHERE id=1')
  const fila = await queryOneWith(conn, 'SELECT last_number FROM receipt_sequence WHERE id=1')
  return fila.last_number
}

export const cobrarCita = async (req, res, next) => {
  try {
    const { appointment_id, discount_amount, discount_reason, payments } = req.body

    const resultado = await transaction(async (conn) => {
      // 1. Turno: sin caja abierta y al día no se cobra.
      const { turno, error: errorTurno } = await turnoUtilizable(
        (sql, p) => queryOneWith(conn, sql, p)
      )
      if (errorTurno) return { error: errorTurno }

      // 2. La cita, con todo lo que hay que congelar.
      const cita = await queryOneWith(
        conn,
        `SELECT a.*, u.name AS client_name, s.name AS service_name,
                c.name AS category_name
           FROM appointments a
           JOIN users u ON u.id = a.client_id
           JOIN services s ON s.id = a.service_id
           LEFT JOIN motorcycle_categories c ON c.id = a.category_id
          WHERE a.id = ? FOR UPDATE`,
        [appointment_id]
      )
      if (!cita) return { error: { status: 404, message: 'Cita no encontrada' } }
      if (cita.status === 'cancelled') return { error: { status: 400, message: 'No se puede cobrar una cita cancelada' } }
      if (cita.paid_receipt_id) return { error: { status: 409, message: 'Esa cita ya fue cobrada', code: 'YA_COBRADA' } }

      // 3. Importes. El precio sale de la cita, que ya lo fijó al agendar.
      const subtotal = aCentavos(cita.final_price)
      const descuento = aCentavos(discount_amount || 0)

      if (descuento < 0) return { error: { status: 400, message: 'El descuento no puede ser negativo' } }
      if (descuento > 0 && !discount_reason?.trim()) {
        return { error: { status: 400, message: 'Un descuento necesita motivo' } }
      }
      if (descuento > subtotal) {
        return { error: { status: 400, message: 'El descuento no puede superar el valor del servicio' } }
      }

      const total = subtotal - descuento

      // 4. El desglose tiene que cuadrar EXACTO con el total.
      const lineasPago = (payments || []).map(p => ({ method: p.method, centavos: aCentavos(p.amount) }))
      if (lineasPago.some(p => p.centavos < 0)) {
        return { error: { status: 400, message: 'Los importes del pago no pueden ser negativos' } }
      }
      const sumaPagos = sumar(...lineasPago.map(p => p.centavos))
      if (sumaPagos !== total) {
        return {
          error: {
            status: 400,
            code: 'PAGO_NO_CUADRA',
            message: `El pago suma ${aDecimal(sumaPagos)} y el total es ${aDecimal(total)}. Tiene que coincidir exactamente.`,
            suma: aDecimal(sumaPagos),
            total: aDecimal(total)
          }
        }
      }

      // 5. Recibo.
      const numero = await siguienteConsecutivo(conn)
      const insert = await queryWith(
        conn,
        `INSERT INTO receipts
           (receipt_number, shift_id, appointment_id, client_id, client_name, plate,
            subtotal_amount, discount_amount, discount_reason, total_amount,
            status, charged_by, issued_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,'issued',?,NOW())`,
        [numero, turno.id, cita.id, cita.client_id, cita.client_name, cita.plate,
         aDecimal(subtotal), aDecimal(descuento), descuento > 0 ? discount_reason.trim() : null,
         aDecimal(total), req.user.id]
      )
      const receiptId = insert.insertId

      // 6. Línea con el precio CONGELADO. No se consulta service_prices al
      //    reimprimir ni al hacer el reporte: si mañana cambia la tarifa, el
      //    historial contable no puede reescribirse hacia atrás. Por lo mismo
      //    se copian los nombres.
      await queryWith(
        conn,
        `INSERT INTO receipt_lines
           (receipt_id, service_id, service_name, category_id, category_name, quantity, unit_amount, line_amount)
         VALUES (?,?,?,?,?,1,?,?)`,
        [receiptId, cita.service_id, cita.service_name, cita.category_id, cita.category_name,
         aDecimal(subtotal), aDecimal(subtotal)]
      )

      // 7. Desglose del pago. En mixto quedan las dos partes, que es lo que
      //    permite al arqueo saber cuánto entró en efectivo.
      for (const p of lineasPago) {
        if (p.centavos === 0) continue
        await queryWith(
          conn,
          'INSERT INTO receipt_payments (receipt_id, method, amount) VALUES (?,?,?)',
          [receiptId, p.method, aDecimal(p.centavos)]
        )
      }

      // 8. La cita queda pagada. Se guarda el recibo, no una bandera.
      await queryWith(
        conn,
        "UPDATE appointments SET paid_receipt_id=?, status='completed' WHERE id=?",
        [receiptId, cita.id]
      )

      return { receiptId, numero, total }
    })

    if (resultado.error) {
      const { status, ...cuerpo } = resultado.error
      return res.status(status).json(cuerpo)
    }

    logger.info(`Recibo ${resultado.numero} emitido por usuario ${req.user.id} (cita ${appointment_id})`)
    res.status(201).json({
      receiptId: resultado.receiptId,
      receiptNumber: resultado.numero,
      message: `Cobro registrado. Recibo N.º ${resultado.numero}`
    })
  } catch (err) { next(err) }
}

/**
 * Anular un cobro. Nunca se borra: se marca, se guarda el motivo y quién lo
 * hizo, y la cita vuelve a quedar disponible para cobrarse.
 */
export const anularRecibo = async (req, res, next) => {
  try {
    const { id } = req.params
    const { reason } = req.body

    const resultado = await transaction(async (conn) => {
      const recibo = await queryOneWith(conn, 'SELECT * FROM receipts WHERE id=? FOR UPDATE', [id])
      if (!recibo) return { error: { status: 404, message: 'Recibo no encontrado' } }
      if (recibo.status === 'voided') return { error: { status: 400, message: 'Ese recibo ya está anulado' } }

      await queryWith(
        conn,
        "UPDATE receipts SET status='voided', voided_by=?, voided_at=NOW(), void_reason=? WHERE id=?",
        [req.user.id, reason.trim(), id]
      )
      if (recibo.appointment_id) {
        await queryWith(
          conn,
          "UPDATE appointments SET paid_receipt_id=NULL, status='confirmed' WHERE id=? AND paid_receipt_id=?",
          [recibo.appointment_id, id]
        )
      }
      return { numero: recibo.receipt_number }
    })

    if (resultado.error) return res.status(resultado.error.status).json({ message: resultado.error.message })

    logger.warn(`Recibo ${resultado.numero} anulado por usuario ${req.user.id}: ${reason}`)
    res.json({ message: `Recibo N.º ${resultado.numero} anulado` })
  } catch (err) { next(err) }
}

export const listarRecibos = async (req, res, next) => {
  try {
    const { from, to, status, plate, shift_id } = req.query
    const paginacion = parsePaginacion(req.query)

    let desde = ` FROM receipts r
                  JOIN users u ON u.id = r.charged_by
                  LEFT JOIN cash_shifts c ON c.id = r.shift_id
                 WHERE 1=1`
    const params = []
    if (from) { desde += ' AND DATE(r.issued_at) >= ?'; params.push(from) }
    if (to) { desde += ' AND DATE(r.issued_at) <= ?'; params.push(to) }
    if (status) { desde += ' AND r.status = ?'; params.push(status) }
    if (shift_id) { desde += ' AND r.shift_id = ?'; params.push(shift_id) }
    if (plate) { desde += ' AND r.plate LIKE ?'; params.push(`${String(plate).toUpperCase().replace(/[^A-Z0-9]/g, '')}%`) }

    const sql = `SELECT r.*, u.name AS charged_by_name, c.operation_date` + desde +
                ' ORDER BY r.receipt_number DESC' + sqlLimitOffset(paginacion)

    const [receipts, total] = await Promise.all([
      query(sql, params),
      queryOne('SELECT COUNT(*) AS n' + desde, params)
    ])
    res.json({ receipts, ...meta(paginacion, total.n) })
  } catch (err) { next(err) }
}

export const verRecibo = async (req, res, next) => {
  try {
    const { id } = req.params
    const recibo = await queryOne(
      `SELECT r.*, u.name AS charged_by_name, vu.name AS voided_by_name, c.operation_date
         FROM receipts r
         JOIN users u ON u.id = r.charged_by
         LEFT JOIN users vu ON vu.id = r.voided_by
         LEFT JOIN cash_shifts c ON c.id = r.shift_id
        WHERE r.id = ?`,
      [id]
    )
    if (!recibo) return res.status(404).json({ message: 'Recibo no encontrado' })

    const [lines, payments, negocio] = await Promise.all([
      query('SELECT * FROM receipt_lines WHERE receipt_id=?', [id]),
      query('SELECT method, amount FROM receipt_payments WHERE receipt_id=?', [id]),
      query("SELECT key_name, value FROM settings WHERE key_name LIKE 'business_%'")
    ])

    res.json({
      receipt: recibo,
      lines,
      payments,
      business: Object.fromEntries(negocio.map(s => [s.key_name, s.value]))
    })
  } catch (err) { next(err) }
}
