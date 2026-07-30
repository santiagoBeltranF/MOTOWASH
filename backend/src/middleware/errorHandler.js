import logger from '../utils/logger.js'

export const errorHandler = (err, req, res, next) => {
  logger.error(err.message, { stack: err.stack, path: req.path, method: req.method })

  if (err.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ message: 'Ya existe un registro con esos datos.' })
  }
  if (err.name === 'ValidationError') {
    return res.status(400).json({ message: err.message })
  }
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({ message: 'Token inválido.' })
  }

  const status = err.status || err.statusCode || 500
  const message = status < 500 ? err.message : 'Error interno del servidor'
  res.status(status).json({ message })
}

export const notFound = (req, res) => {
  res.status(404).json({ message: `Ruta no encontrada: ${req.method} ${req.path}` })
}
