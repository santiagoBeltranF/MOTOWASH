import { query, queryOne, transaction, queryWith } from '../config/db.js'
import { aCentavos, aDecimal } from '../utils/dinero.js'

/**
 * Categorias de moto y precio por servicio y categoria.
 *
 * service_prices es el precio efectivo; services.price se conserva como
 * respaldo y valor por defecto para lo que ya existia.
 */

export const getCategories = async (req, res, next) => {
  try {
    // El personal ve tambien las inactivas para poder activarlas; el cliente no.
    const todas = req.query.all === 'true'
    const categories = await query(
      `SELECT id, name, description, sort_order, is_active FROM motorcycle_categories
       ${todas ? '' : 'WHERE is_active=TRUE'} ORDER BY sort_order, name`
    )
    res.json({ categories })
  } catch (err) { next(err) }
}

export const updateCategory = async (req, res, next) => {
  try {
    const { id } = req.params
    const { name, description, is_active } = req.body
    const cat = await queryOne('SELECT id FROM motorcycle_categories WHERE id=?', [id])
    if (!cat) return res.status(404).json({ message: 'Categoría no encontrada' })

    await query(
      'UPDATE motorcycle_categories SET name=?, description=?, is_active=? WHERE id=?',
      [name.trim(), description?.trim() || null, is_active === true, id]
    )
    res.json({ message: 'Categoría actualizada' })
  } catch (err) { next(err) }
}

// Matriz completa de precios: una fila por servicio, una columna por categoria.
// Es lo que necesita la pantalla de Servicios para editarlos de un vistazo.
export const getPriceMatrix = async (req, res, next) => {
  try {
    const [services, categories, precios] = await Promise.all([
      query('SELECT id, name, price, duration_minutes, is_active FROM services ORDER BY name'),
      query('SELECT id, name, sort_order, is_active FROM motorcycle_categories ORDER BY sort_order, name'),
      query('SELECT service_id, category_id, price FROM service_prices')
    ])

    const mapa = new Map(precios.map(p => [`${p.service_id}:${p.category_id}`, p.price]))
    const matriz = services.map(s => ({
      service_id: s.id,
      service_name: s.name,
      is_active: s.is_active,
      base_price: s.price,
      precios: categories.map(c => ({
        category_id: c.id,
        category_name: c.name,
        category_active: c.is_active,
        // Si esa combinacion no tiene fila, se muestra el precio base del
        // servicio, que es lo que se aplicaria realmente.
        price: mapa.get(`${s.id}:${c.id}`) ?? s.price
      }))
    }))

    res.json({ categories, matriz })
  } catch (err) { next(err) }
}

// Guarda varios precios de golpe. Va en transaccion para que la matriz no
// quede a medias si una fila falla.
export const updatePrices = async (req, res, next) => {
  try {
    const { prices } = req.body

    const resultado = await transaction(async (conn) => {
      for (const p of prices) {
        // Se normaliza pasando por centavos enteros: asi un «15000,5» o un
        // numero con cola de coma flotante no llega nunca a la columna.
        const centavos = aCentavos(p.price)
        if (centavos < 0) return { error: 'Los precios no pueden ser negativos' }
        await queryWith(
          conn,
          `INSERT INTO service_prices (service_id, category_id, price) VALUES (?,?,?)
           ON DUPLICATE KEY UPDATE price=VALUES(price)`,
          [p.service_id, p.category_id, aDecimal(centavos)]
        )
      }
      return {}
    })

    if (resultado.error) return res.status(400).json({ message: resultado.error })
    res.json({ message: 'Precios actualizados' })
  } catch (err) { next(err) }
}
