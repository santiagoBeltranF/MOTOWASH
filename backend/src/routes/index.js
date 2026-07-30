import express from 'express'
import rateLimit from 'express-rate-limit'
import { body } from 'express-validator'
import { authenticate, requireAdmin } from '../middleware/auth.js'
import { login, verify2FA, register, verifyRegister, getMe } from '../controllers/authController.js'
import { getServices, createService, updateService, deleteService } from '../controllers/serviceController.js'
import { getAvailableSlots, createAppointment, getAppointments, cancelAppointment, updateAppointmentStatus, rescheduleAppointment, getActivePendingAppointment } from '../controllers/appointmentController.js'
import { getPromotions, getActivePromotion, createPromotion, updatePromotion, deletePromotion } from '../controllers/promotionController.js'
import { getSchedule, updateSchedule, getSettings, updateSettings, getClients, toggleClientStatus } from '../controllers/settingsController.js'
import { getDashboardStats, getRevenueReport, getClientsReport, getAppointmentsReport } from '../controllers/reportController.js'

const router = express.Router()

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 5, message: { message: 'Demasiados intentos. Intenta en 15 minutos.' } })

// Auth
router.post('/auth/login', loginLimiter, login)
router.post('/auth/verify-2fa', verify2FA)
router.post('/auth/register', [
  body('email').isEmail(),
  body('password').isLength({ min: 8 }),
  body('name').trim().notEmpty()
], register)
router.post('/auth/verify-register', verifyRegister)
router.get('/auth/me', authenticate, getMe)

// Services
router.get('/services', authenticate, getServices)
router.post('/services', authenticate, requireAdmin, createService)
router.put('/services/:id', authenticate, requireAdmin, updateService)
router.delete('/services/:id', authenticate, requireAdmin, deleteService)

// Appointments
router.get('/appointments/slots', authenticate, getAvailableSlots)
router.get('/appointments', authenticate, getAppointments)
router.post('/appointments', authenticate, createAppointment)
router.patch('/appointments/:id/cancel', authenticate, cancelAppointment)
router.patch('/appointments/:id/status', authenticate, requireAdmin, updateAppointmentStatus)
router.get('/appointments/active-pending', authenticate, getActivePendingAppointment) // <-- Nueva ruta
router.patch('/appointments/:id/reschedule', authenticate, rescheduleAppointment)     

// Promotions
router.get('/promotions', authenticate, requireAdmin, getPromotions)
router.get('/promotions/active', authenticate, getActivePromotion)
router.post('/promotions', authenticate, requireAdmin, createPromotion)
router.put('/promotions/:id', authenticate, requireAdmin, updatePromotion)
router.delete('/promotions/:id', authenticate, requireAdmin, deletePromotion)

// Schedule & Settings (Admin)
router.get('/schedule', authenticate, getSchedule)
router.put('/schedule', authenticate, requireAdmin, updateSchedule)
router.get('/settings', authenticate, requireAdmin, getSettings)
router.put('/settings', authenticate, requireAdmin, updateSettings)
router.get('/clients', authenticate, requireAdmin, getClients)
router.patch('/clients/:id/toggle', authenticate, requireAdmin, toggleClientStatus)

// Reports (Admin)
router.get('/reports/dashboard', authenticate, requireAdmin, getDashboardStats)
router.get('/reports/revenue', authenticate, requireAdmin, getRevenueReport)
router.get('/reports/clients', authenticate, requireAdmin, getClientsReport)
router.get('/reports/appointments', authenticate, requireAdmin, getAppointmentsReport)

export default router