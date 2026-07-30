import { query, queryOne } from '../config/db.js'
import { sendPromotionEmail } from '../services/emailService.js'
import logger from '../utils/logger.js'

export const getPromotions = async (req, res, next) => {
  try {
    const promotions = await query('SELECT * FROM promotions ORDER BY created_at DESC')
    res.json({ promotions })
  } catch (err) { next(err) }
}

export const getActivePromotion = async (req, res, next) => {
  try {
    const promo = await queryOne('SELECT * FROM promotions WHERE is_active=TRUE AND NOW() BETWEEN starts_at AND ends_at LIMIT 1')
    res.json({ promotion: promo || null })
  } catch (err) { next(err) }
}

export const createPromotion = async (req, res, next) => {
  try {
    const { title, description, discount_percent, starts_at, ends_at, applies_to, service_ids, send_email } = req.body

    const result = await query(
      'INSERT INTO promotions (title, description, discount_percent, starts_at, ends_at, applies_to, created_by) VALUES (?,?,?,?,?,?,?)',
      [title, description, discount_percent, starts_at, ends_at, applies_to || 'all', req.user.id]
    )
    const promoId = result.insertId

    // Registro seguro uno a uno compatible con consultas preparadas en MariaDB
    if (applies_to === 'specific' && service_ids?.length) {
      for (const sid of service_ids) {
        await query(
          'INSERT INTO promotion_services (promotion_id, service_id) VALUES (?,?)',
          [promoId, sid]
        )
      }
    }

    if (send_email) {
      const clients = await query("SELECT name, email FROM users WHERE role='client' AND is_active=TRUE")
      const { sent, failed } = await sendPromotionEmail(clients, {
        title, description, discount: discount_percent,
        ends_at: new Date(ends_at).toLocaleDateString('es-CO')
      })
      await query('UPDATE promotions SET email_sent=TRUE WHERE id=?', [promoId])
      logger.info(`Promotion emails: ${sent} sent, ${failed} failed`)
    }

    const promo = await queryOne('SELECT * FROM promotions WHERE id=?', [promoId])
    res.status(201).json({ promotion: promo, message: 'Promoción creada exitosamente' })
  } catch (err) { next(err) }
}

export const updatePromotion = async (req, res, next) => {
  try {
    const { id } = req.params
    const { title, description, discount_percent, starts_at, ends_at, is_active } = req.body
    await query(
      'UPDATE promotions SET title=?, description=?, discount_percent=?, starts_at=?, ends_at=?, is_active=? WHERE id=?',
      [title, description, discount_percent, starts_at, ends_at, is_active, id]
    )
    res.json({ message: 'Promoción actualizada' })
  } catch (err) { next(err) }
}

export const deletePromotion = async (req, res, next) => {
  try {
    await query('DELETE FROM promotions WHERE id=?', [req.params.id])
    res.json({ message: 'Promoción eliminada' })
  } catch (err) { next(err) }
}
