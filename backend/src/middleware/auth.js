import jwt from 'jsonwebtoken'
import { queryOne } from '../config/db.js'

// Marca los 401 que significan «tu sesion ya no vale», para distinguirlos de
// los 401 que son un error del usuario (credenciales o codigo incorrectos).
//
// El frontend solo debe echar a alguien al login cuando ve este codigo. Sin la
// distincion, el interceptor de axios trataba cualquier 401 como sesion
// caducada y recargaba la pagina, borrando el mensaje de error antes de que se
// pudiera leer.
export const CODIGO_SESION_INVALIDA = 'SESION_INVALIDA'

export const authenticate = async (req, res, next) => {
  try {
    const header = req.headers.authorization
    if (!header?.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Token requerido', code: CODIGO_SESION_INVALIDA })
    }
    const token = header.split(' ')[1]
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    const user = await queryOne('SELECT id, name, email, role, is_active FROM users WHERE id = ?', [decoded.id])
    if (!user || !user.is_active) {
      return res.status(401).json({ message: 'Usuario no válido o inactivo', code: CODIGO_SESION_INVALIDA })
    }
    req.user = user
    next()
  } catch (err) {
    return res.status(401).json({ message: 'Token inválido o expirado', code: CODIGO_SESION_INVALIDA })
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
