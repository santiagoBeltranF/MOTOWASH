import { body, param } from 'express-validator'

// Cadenas de validacion por ruta. Los mensajes van en espanol porque el
// frontend los muestra tal cual al usuario.
//
// Criterio: se valida forma (tipo, presencia, rango), no reglas de negocio. Lo
// que depende del estado de la base —si la franja esta libre, si el negocio
// abre ese dia— se queda en los controladores, que es donde puede consultarse.

const FORMATO_FECHA = /^\d{4}-\d{2}-\d{2}$/
const FORMATO_HORA = /^([01]\d|2[0-3]):[0-5]\d$/
const FORMATO_CODIGO = /^\d{6}$/

export const idParam = [
  param('id').isInt({ min: 1 }).withMessage('Identificador inválido')
]

// --- Autenticacion ---------------------------------------------------------

export const loginRules = [
  body('email').isEmail().withMessage('Correo con formato inválido').normalizeEmail(),
  body('password').notEmpty().withMessage('La contraseña es obligatoria')
]

export const registerRules = [
  body('name').trim().notEmpty().withMessage('El nombre es obligatorio')
    .isLength({ max: 100 }).withMessage('El nombre no puede pasar de 100 caracteres'),
  body('email').isEmail().withMessage('Correo con formato inválido').normalizeEmail()
    .isLength({ max: 150 }).withMessage('El correo es demasiado largo'),
  body('password').isLength({ min: 8 }).withMessage('La contraseña debe tener al menos 8 caracteres'),
  body('phone').optional({ values: 'falsy' }).trim()
    .isLength({ max: 20 }).withMessage('El teléfono no puede pasar de 20 caracteres')
]

export const codigoRules = [
  body('tempToken').trim().notEmpty()
    .withMessage('Tu verificación caducó. Vuelve a iniciar sesión para recibir un código nuevo.'),
  body('code').trim().matches(FORMATO_CODIGO).withMessage('El código son 6 dígitos')
]

export const perfilRules = [
  body('name').trim().notEmpty().withMessage('El nombre es obligatorio')
    .isLength({ max: 100 }).withMessage('El nombre no puede pasar de 100 caracteres'),
  body('phone').optional({ values: 'falsy' }).trim()
    .isLength({ max: 20 }).withMessage('El teléfono no puede pasar de 20 caracteres')
]

export const passwordRules = [
  body('currentPassword').notEmpty().withMessage('Escribe tu contraseña actual'),
  body('newPassword').isLength({ min: 8 }).withMessage('La contraseña nueva debe tener al menos 8 caracteres')
]

// --- Servicios -------------------------------------------------------------

export const servicioRules = [
  body('name').trim().notEmpty().withMessage('El nombre del servicio es obligatorio')
    .isLength({ max: 100 }).withMessage('El nombre no puede pasar de 100 caracteres'),
  body('description').optional({ values: 'null' }).trim(),
  body('price').isFloat({ min: 0 }).withMessage('El precio debe ser un número mayor o igual a 0'),
  body('duration_minutes').isInt({ min: 1, max: 1440 })
    .withMessage('La duración debe ser un número de minutos entre 1 y 1440')
]

// --- Citas -----------------------------------------------------------------

export const crearCitaRules = [
  body('service_id').isInt({ min: 1 }).withMessage('Servicio inválido'),
  body('appointment_date').matches(FORMATO_FECHA).withMessage('Fecha con formato inválido. Se espera AAAA-MM-DD.'),
  body('start_time').matches(FORMATO_HORA).withMessage('Hora con formato inválido. Se espera HH:MM.'),
  body('notes').optional({ values: 'falsy' }).trim()
    .isLength({ max: 1000 }).withMessage('Las notas no pueden pasar de 1000 caracteres')
]

export const reagendarRules = [
  ...idParam,
  body('appointment_date').matches(FORMATO_FECHA).withMessage('Fecha con formato inválido. Se espera AAAA-MM-DD.'),
  body('start_time').matches(FORMATO_HORA).withMessage('Hora con formato inválido. Se espera HH:MM.')
]

export const estadoCitaRules = [
  ...idParam,
  body('status').isIn(['pending', 'confirmed', 'completed', 'cancelled'])
    .withMessage('Estado no válido')
]

// --- Promociones -----------------------------------------------------------

const promocionBase = [
  body('title').trim().notEmpty().withMessage('El título es obligatorio')
    .isLength({ max: 150 }).withMessage('El título no puede pasar de 150 caracteres'),
  body('description').optional({ values: 'null' }).trim(),
  body('discount_percent').isFloat({ min: 0, max: 100 })
    .withMessage('El descuento debe estar entre 0 y 100'),
  body('starts_at').trim().notEmpty().withMessage('La fecha de inicio es obligatoria'),
  body('ends_at').trim().notEmpty().withMessage('La fecha de fin es obligatoria')
    .custom((valor, { req }) => {
      // Una promocion que termina antes de empezar nunca llega a estar activa,
      // asi que se rechaza en vez de guardarla y que el admin no entienda por
      // que no aparece.
      if (req.body.starts_at && new Date(valor) <= new Date(req.body.starts_at)) {
        throw new Error('La fecha de fin debe ser posterior a la de inicio')
      }
      return true
    })
]

export const crearPromocionRules = [
  ...promocionBase,
  body('applies_to').optional().isIn(['all', 'specific'])
    .withMessage('El campo "aplica a" solo admite "all" o "specific"'),
  body('service_ids').optional().isArray().withMessage('Los servicios deben venir en una lista')
]

export const actualizarPromocionRules = [...idParam, ...promocionBase]

// --- Horario y configuracion -----------------------------------------------

export const horarioRules = [
  body('schedule').isArray({ min: 1 }).withMessage('El horario debe venir como una lista de días'),
  body('schedule.*.day_of_week').isInt({ min: 0, max: 6 }).withMessage('Día de la semana inválido'),
  body('schedule.*.open_time').matches(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/)
    .withMessage('Hora de apertura inválida'),
  body('schedule.*.close_time').matches(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/)
    .withMessage('Hora de cierre inválida')
]

export const settingsRules = [
  body('settings').isObject().withMessage('La configuración debe venir como un objeto')
]
