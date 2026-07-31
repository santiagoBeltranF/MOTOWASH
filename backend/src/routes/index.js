import express from 'express'
import rateLimit from 'express-rate-limit'
import { authenticate, requireAdmin } from '../middleware/auth.js'
import { validar } from '../middleware/validate.js'
import {
  idParam, loginRules, registerRules, codigoRules, perfilRules, passwordRules,
  servicioRules, crearCitaRules, reagendarRules, estadoCitaRules,
  crearPromocionRules, actualizarPromocionRules, horarioRules, settingsRules
} from '../middleware/validators.js'
import { login, verify2FA, register, verifyRegister, getMe, updateProfile, changePassword } from '../controllers/authController.js'
import { getServices, createService, updateService, deleteService } from '../controllers/serviceController.js'
import { getAvailableSlots, createAppointment, getAppointments, cancelAppointment, updateAppointmentStatus, rescheduleAppointment, getActivePendingAppointment } from '../controllers/appointmentController.js'
import { getPromotions, getActivePromotion, createPromotion, updatePromotion, deletePromotion } from '../controllers/promotionController.js'
import { getSchedule, updateSchedule, getSettings, updateSettings, getClients, toggleClientStatus } from '../controllers/settingsController.js'
import { getDashboardStats, getRevenueReport, getClientsReport, getAppointmentsReport } from '../controllers/reportController.js'

const router = express.Router()

// Los limites son configurables por entorno, con el valor de produccion como
// defecto: si no se define nada, se comporta exactamente igual que antes.
//
// Existe porque las pruebas end-to-end salen todas de la misma IP y agotaban el
// limite de login a mitad de la suite, con lo que fallaban por el limitador y
// no por la aplicacion. Se sube en docker-compose.test.yml, nunca en el codigo.
const numeroDeEntorno = (nombre, pordefecto) => {
  const v = parseInt(process.env[nombre], 10)
  return Number.isFinite(v) && v > 0 ? v : pordefecto
}

const loginLimiter = rateLimit({
  windowMs: numeroDeEntorno('RATE_LIMIT_LOGIN_WINDOW_MIN', 15) * 60 * 1000,
  max: numeroDeEntorno('RATE_LIMIT_LOGIN_MAX', 5),
  message: { message: 'Demasiados intentos. Intenta en 15 minutos.' }
})

// /auth/register dispara un envio de correo a una direccion arbitraria en cada
// peticion. Sin limite es una bomba de correo con nuestro dominio como
// remitente, y Gmail acaba suspendiendo la cuenta. La ventana es de una hora
// porque registrarse es algo que se hace una vez, no repetidamente.
const registerLimiter = rateLimit({
  windowMs: numeroDeEntorno('RATE_LIMIT_REGISTER_WINDOW_MIN', 60) * 60 * 1000,
  max: numeroDeEntorno('RATE_LIMIT_REGISTER_MAX', 5),
  message: { message: 'Demasiados registros desde esta conexión. Intenta en una hora.' }
})

// Limite por IP para los dos endpoints de verificacion. Es la segunda barrera
// contra la fuerza bruta del codigo de 6 digitos; la primera es el contador de
// intentos por codigo que lleva authController (MAX_INTENTOS_CODIGO).
const verifyLimiter = rateLimit({
  windowMs: numeroDeEntorno('RATE_LIMIT_VERIFY_WINDOW_MIN', 15) * 60 * 1000,
  max: numeroDeEntorno('RATE_LIMIT_VERIFY_MAX', 15),
  message: { message: 'Demasiados intentos de verificación. Intenta en 15 minutos.' }
})

// Auth
router.post('/auth/login', loginLimiter, loginRules, validar, login)
router.post('/auth/verify-2fa', verifyLimiter, codigoRules, validar, verify2FA)
router.post('/auth/register', registerLimiter, registerRules, validar, register)
router.post('/auth/verify-register', verifyLimiter, codigoRules, validar, verifyRegister)
router.get('/auth/me', authenticate, getMe)
router.put('/auth/profile', authenticate, perfilRules, validar, updateProfile)
router.put('/auth/password', authenticate, passwordRules, validar, changePassword)

// Services
router.get('/services', authenticate, getServices)
router.post('/services', authenticate, requireAdmin, servicioRules, validar, createService)
router.put('/services/:id', authenticate, requireAdmin, idParam, servicioRules, validar, updateService)
router.delete('/services/:id', authenticate, requireAdmin, idParam, validar, deleteService)

// Appointments
router.get('/appointments/slots', authenticate, getAvailableSlots)
router.get('/appointments', authenticate, getAppointments)
router.post('/appointments', authenticate, crearCitaRules, validar, createAppointment)
router.patch('/appointments/:id/cancel', authenticate, idParam, validar, cancelAppointment)
router.patch('/appointments/:id/status', authenticate, requireAdmin, estadoCitaRules, validar, updateAppointmentStatus)
router.get('/appointments/active-pending', authenticate, getActivePendingAppointment)
router.patch('/appointments/:id/reschedule', authenticate, reagendarRules, validar, rescheduleAppointment)

// Promotions
router.get('/promotions', authenticate, requireAdmin, getPromotions)
router.get('/promotions/active', authenticate, getActivePromotion)
router.post('/promotions', authenticate, requireAdmin, crearPromocionRules, validar, createPromotion)
router.put('/promotions/:id', authenticate, requireAdmin, actualizarPromocionRules, validar, updatePromotion)
router.delete('/promotions/:id', authenticate, requireAdmin, idParam, validar, deletePromotion)

// Schedule & Settings (Admin)
router.get('/schedule', authenticate, getSchedule)
router.put('/schedule', authenticate, requireAdmin, horarioRules, validar, updateSchedule)
router.get('/settings', authenticate, requireAdmin, getSettings)
router.put('/settings', authenticate, requireAdmin, settingsRules, validar, updateSettings)
router.get('/clients', authenticate, requireAdmin, getClients)
router.patch('/clients/:id/toggle', authenticate, requireAdmin, idParam, validar, toggleClientStatus)

// Reports (Admin)
router.get('/reports/dashboard', authenticate, requireAdmin, getDashboardStats)
router.get('/reports/revenue', authenticate, requireAdmin, getRevenueReport)
router.get('/reports/clients', authenticate, requireAdmin, getClientsReport)
router.get('/reports/appointments', authenticate, requireAdmin, getAppointmentsReport)

export default router
