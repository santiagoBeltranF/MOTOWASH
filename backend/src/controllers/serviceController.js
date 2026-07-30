import { query, queryOne } from '../config/db.js'

export const getServices = async (req, res, next) => {
  try {
    const isAdmin = req.user?.role === 'admin'
    const sql = isAdmin
      ? 'SELECT * FROM services ORDER BY name'
      : 'SELECT * FROM services WHERE is_active=TRUE ORDER BY name'
    const services = await query(sql)

    // Hora actual del servidor Node.js para evitar desfases de zona horaria
    const serverTime = new Date()

    const promo = await queryOne(
      'SELECT * FROM promotions WHERE is_active=TRUE AND ? BETWEEN starts_at AND ends_at LIMIT 1',
      [serverTime]
    )
    
    if (promo) {
      // 1. Normalizar el texto de applies_to para evitar problemas de mayúsculas o espacios
      const isAllServices = String(promo.applies_to).toLowerCase().trim() === 'all'

      const promoServices = isAllServices
        ? null
        : await query('SELECT service_id FROM promotion_services WHERE promotion_id=?', [promo.id])

      // 2. Forzar a que todos los IDs de la promoción sean tratados como números
      const promoIds = promoServices?.map(p => Number(p.service_id))

      services.forEach(s => {
        // 3. Comparación segura convirtiendo s.id a número (evita error de texto vs número)
        const applies = isAllServices || (promoIds && promoIds.includes(Number(s.id)))
        
        if (applies) {
          s.original_price = s.price
          s.discounted_price = parseFloat((s.price * (1 - promo.discount_percent / 100)).toFixed(2))
          s.active_promotion = { title: promo.title, discount: promo.discount_percent, ends_at: promo.ends_at }
        }
      })
    }
    res.json({ services, activePromotion: promo || null })
  } catch (err) { next(err) }
}

export const createService = async (req, res, next) => {
  try {
    const { name, description, price, duration_minutes } = req.body
    const result = await query(
      'INSERT INTO services (name, description, price, duration_minutes) VALUES (?,?,?,?)',
      [name, description, price, duration_minutes]
    )
    const service = await queryOne('SELECT * FROM services WHERE id=?', [result.insertId])
    res.status(201).json({ service })
  } catch (err) { next(err) }
}

export const updateService = async (req, res, next) => {
  try {
    const { id } = req.params
    const { name, description, price, duration_minutes, is_active } = req.body
    await query(
      'UPDATE services SET name=?, description=?, price=?, duration_minutes=?, is_active=? WHERE id=?',
      [name, description, price, duration_minutes, is_active, id]
    )
    const service = await queryOne('SELECT * FROM services WHERE id=?', [id])
    if (!service) return res.status(404).json({ message: 'Servicio no encontrado' })
    res.json({ service })
  } catch (err) { next(err) }
}

export const deleteService = async (req, res, next) => {
  try {
    const { id } = req.params
    const inUse = await queryOne('SELECT id FROM appointments WHERE service_id=? LIMIT 1', [id])
    if (inUse) {
      await query('UPDATE services SET is_active=FALSE WHERE id=?', [id])
      return res.json({ message: 'Servicio desactivado (tiene citas asociadas)' })
    }
    await query('DELETE FROM services WHERE id=?', [id])
    res.json({ message: 'Servicio eliminado' })
  } catch (err) { next(err) }
}