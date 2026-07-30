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
  await testConnection()
  app.listen(PORT, () => {
    logger.info(`🚀 MotoWash API running on port ${PORT}`)
    logger.info(`📋 Environment: ${process.env.NODE_ENV}`)
  })
}

start()