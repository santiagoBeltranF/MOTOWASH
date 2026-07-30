import winston from 'winston'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const esProduccion = process.env.NODE_ENV === 'production'

// En contenedor los logs van a stdout/stderr y los recoge el runtime
// (`docker compose logs`). Escribir a archivo ahi engorda la capa de escritura
// del contenedor y se pierde al recrearlo. Fuera de contenedor si son utiles,
// asi que los transports de archivo se activan solo cuando NODE_ENV no es
// production. Ver hallazgo I3 en AUDITORIA.md.
const escribirAArchivos = !esProduccion

// colorize() inyecta codigos de escape ANSI. En una terminal eso es legible;
// redirigido a un archivo o recogido por el runtime de Docker, ensucia la
// salida con basura como `[32minfo[39m`.
const formatoConsola = [
  ...(process.stdout.isTTY ? [winston.format.colorize()] : []),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const extra = Object.keys(meta).length ? JSON.stringify(meta) : ''
    return `${timestamp} [${level}]: ${message} ${extra}`.trimEnd()
  })
]

const transports = [
  new winston.transports.Console({ format: winston.format.combine(...formatoConsola) })
]

if (escribirAArchivos) {
  transports.push(
    new winston.transports.File({
      filename: path.join(__dirname, '../../logs/error.log'),
      level: 'error',
      maxsize: 5242880,
      maxFiles: 5
    }),
    new winston.transports.File({
      filename: path.join(__dirname, '../../logs/combined.log'),
      maxsize: 5242880,
      maxFiles: 5
    })
  )
}

const logger = winston.createLogger({
  level: esProduccion ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports
})

export default logger
