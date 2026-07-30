import jwt from 'jsonwebtoken'
import { queryOne } from '../config/db.js'

export const authenticate = async (req, res, next) => {
  try {
    const header = req.headers.authorization
    if (!header?.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Token requerido' })
    }
    const token = header.split(' ')[1]
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    const user = await queryOne('SELECT id, name, email, role, is_active FROM users WHERE id = ?', [decoded.id])
    if (!user || !user.is_active) {
      return res.status(401).json({ message: 'Usuario no válido o inactivo' })
    }
    req.user = user
    next()
  } catch (err) {
    return res.status(401).json({ message: 'Token inválido o expirado' })
  }
}

export const requireAdmin = (req, res, next) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ message: 'Acceso denegado. Se requiere rol de administrador.' })
  }
  next()
}

export const requireClient = (req, res, next) => {
  if (req.user?.role !== 'client') {
    return res.status(403).json({ message: 'Acceso denegado.' })
  }
  next()
}
