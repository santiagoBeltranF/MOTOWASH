import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import cron from 'node-cron'
import { fileURLToPath } from 'url'
import path from 'path'
import routes from './routes/index.js'
import { errorHandler, notFound } from './middleware/errorHandler.js'
import { testConnection, query } from './config/db.js'
import logger from './utils/logger.js'

const app = express()
const PORT = process.env.PORT || 3000

// Detras de un proxy inverso (nginx), la IP real del cliente llega en la
// cabecera X-Forwarded-For. Sin esto, express-rate-limit ve la IP de nginx en
// todas las peticiones y el limite de 5 intentos de login pasa a aplicarse
// globalmente a todos los usuarios juntos: un solo atacante deja fuera al
// negocio entero.
//
// Se declara el numero de saltos reales (1 = solo nginx), no `true`. Con
// `true` Express confiaria en toda la cadena de X-Forwarded-For, y cualquiera
// podria falsear su IP inyectando la cabecera para saltarse el limite.
// Por defecto 0, que es lo correcto al correr sin proxy delante.
app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS ?? 0))

// Security middleware
app.use(helmet())
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cache-Control', 'Pragma']
}))

// Logging
app.use(morgan('combined', { stream: { write: msg => logger.info(msg.trim()) } }))

// Body parsing
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }))

// API Routes
app.use('/api', routes)

// 404 & Error handler
app.use(notFound)
app.use(errorHandler)

// Cron: desactivar promociones expiradas cada 5 minutos
cron.schedule('*/5 * * * *', async () => {
  try {
    const result = await query(
      "UPDATE promotions SET is_active=FALSE WHERE is_active=TRUE AND ends_at < NOW()"
    )
    if (result.affectedRows > 0) {
      logger.info(`${result.affectedRows} promotion(s) expired and deactivated`)
    }
  } catch (err) {
    logger.error('Error in promotion cron', { err: err.message })
  }
})

// Start server
const start = async () => {
  try {
    await testConnection()
  } catch (err) {
    logger.error('Arranque abortado: no hay conexion con MySQL', { err: err.message })
    process.exit(1)
  }
  app.listen(PORT, () => {
    logger.info(`🚀 MotoWash API running on port ${PORT}`)
    logger.info(`📋 Environment: ${process.env.NODE_ENV}`)
  })
}

start()