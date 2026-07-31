import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import { v4 as uuidv4 } from 'uuid'
import { query, queryOne } from '../config/db.js'
import { send2FACode, sendWelcomeEmail } from '../services/emailService.js'
import logger from '../utils/logger.js'

const tempTokens = new Map()

// Numero de codigos errados que se toleran antes de invalidar el codigo y
// obligar a pedir uno nuevo. Sin esto, un codigo de 6 digitos con ventana de
// 10 minutos es fuerza bruta viable: quien ataca ya tiene el tempToken porque
// el mismo inicio el flujo.
const MAX_INTENTOS_CODIGO = 5

// crypto.randomInt usa el generador del sistema. Math.random() no sirve aqui:
// V8 lo implementa con xorshift128+, que no es criptografico — observando
// salidas sucesivas se puede reconstruir el estado interno y predecir los
// codigos siguientes. El limite superior es exclusivo, asi que el rango real
// es 100000-999999.
const generate2FACode = () => String(crypto.randomInt(100000, 1000000))

// Un unico sitio donde se decide la vigencia del token. Antes estaba escrita a
// mano como '30d' en dos lugares, ignorando JWT_EXPIRES_IN del entorno.
const firmarToken = (user) => jwt.sign(
  { id: user.id, role: user.role },
  process.env.JWT_SECRET,
  { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
)

export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body
    const user = await queryOne('SELECT * FROM users WHERE email = ? AND is_active = TRUE', [email])
    // Un invitado no tiene credenciales: password es NULL. Sin este corte,
    // bcrypt.compare recibiria null y reventaria en vez de devolver 401.
    // El mensaje es el mismo que el de credenciales erroneas, a proposito: no
    // hay motivo para revelar que ese correo pertenece a un invitado.
    if (!user || user.is_guest || !user.password || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ message: 'Correo o contraseña incorrectos' })
    }
    if (user.two_fa_enabled) {
      const code = generate2FACode()
      const expires = new Date(Date.now() + 10 * 60 * 1000)
      // El codigo se guarda hasheado (hallazgo M6). Antes iba en claro, asi que
      // quien pudiera leer la tabla users entraba como cualquier usuario
      // durante los 10 minutos de vigencia. 10 rondas bastan: el codigo es de
      // un solo uso, caduca pronto y ya hay contador de intentos.
      const codeHash = await bcrypt.hash(code, 10)
      await query('UPDATE users SET two_fa_code=?, two_fa_expires=? WHERE id=?', [codeHash, expires, user.id])
      const tempToken = uuidv4()
      tempTokens.set(tempToken, { userId: user.id, expires: Date.now() + 15 * 60 * 1000, intentos: 0 })
      await send2FACode(user.email, user.name, code)
      logger.info(`2FA code sent to ${user.email}`)
      return res.json({ requires2FA: true, tempToken, message: 'Código enviado a tu correo' })
    }

    const token = firmarToken(user)
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } })
  } catch (err) { next(err) }
}

export const verify2FA = async (req, res, next) => {
  try {
    const { tempToken, code } = req.body
    const temp = tempTokens.get(tempToken)
    if (!temp || temp.expires < Date.now()) {
      tempTokens.delete(tempToken)
      return res.status(401).json({ message: 'Sesión expirada, inicia sesión de nuevo' })
    }
    // El codigo esta hasheado, asi que ya no se puede comparar en SQL: se trae
    // el usuario por id y se contrasta con bcrypt.
    const candidato = await queryOne(
      'SELECT * FROM users WHERE id=? AND two_fa_expires > NOW()',
      [temp.userId]
    )
    const user = candidato?.two_fa_code && await bcrypt.compare(code, candidato.two_fa_code)
      ? candidato
      : null
    if (!user) {
      temp.intentos += 1
      // Agotados los intentos se invalida el codigo en la base y se descarta el
      // tempToken: hay que volver a iniciar sesion para recibir uno nuevo.
      if (temp.intentos >= MAX_INTENTOS_CODIGO) {
        tempTokens.delete(tempToken)
        await query('UPDATE users SET two_fa_code=NULL, two_fa_expires=NULL WHERE id=?', [temp.userId])
        logger.warn(`2FA bloqueado por intentos fallidos (usuario ${temp.userId})`)
        return res.status(401).json({ message: 'Demasiados intentos fallidos. Inicia sesión de nuevo para recibir un código nuevo.' })
      }
      const restantes = MAX_INTENTOS_CODIGO - temp.intentos
      return res.status(401).json({ message: `Código incorrecto o expirado. Te ${restantes === 1 ? 'queda 1 intento' : `quedan ${restantes} intentos`}.` })
    }
    await query('UPDATE users SET two_fa_code=NULL, two_fa_expires=NULL WHERE id=?', [user.id])
    tempTokens.delete(tempToken)

    const token = firmarToken(user)
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } })
  } catch (err) { next(err) }
}

// Almacenamiento temporal de registros pendientes de verificación
const pendingRegistrations = new Map()

export const register = async (req, res, next) => {
  try {
    const { name, email, password, phone } = req.body
    const existing = await queryOne('SELECT id FROM users WHERE email=?', [email])
    if (existing) return res.status(409).json({ message: 'Este correo ya está registrado' })

    // Generar código de verificación
    const code = generate2FACode()
    const tempToken = uuidv4()
    const expires = Date.now() + 15 * 60 * 1000 // 15 minutos

    // Guardar temporalmente
    const hashed = await bcrypt.hash(password, 12)
    pendingRegistrations.set(tempToken, { name, email, password: hashed, phone, code, expires, intentos: 0 })

    // Enviar código al correo
    await send2FACode(email, name, code)

    res.status(200).json({ message: 'Código enviado a tu correo', tempToken })
  } catch (err) { next(err) }
}

export const verifyRegister = async (req, res, next) => {
  try {
    const { tempToken, code } = req.body
    const pending = pendingRegistrations.get(tempToken)

    if (!pending || pending.expires < Date.now()) {
      pendingRegistrations.delete(tempToken)
      return res.status(401).json({ message: 'Código expirado, regístrate de nuevo' })
    }

    if (pending.code !== code) {
      pending.intentos += 1
      // Igual que en el 2FA de login: agotados los intentos se descarta el
      // registro pendiente y hay que empezar de nuevo.
      if (pending.intentos >= MAX_INTENTOS_CODIGO) {
        pendingRegistrations.delete(tempToken)
        logger.warn(`Registro bloqueado por intentos fallidos (${pending.email})`)
        return res.status(401).json({ message: 'Demasiados intentos fallidos. Regístrate de nuevo para recibir un código nuevo.' })
      }
      const restantes = MAX_INTENTOS_CODIGO - pending.intentos
      return res.status(401).json({ message: `Código incorrecto. Te ${restantes === 1 ? 'queda 1 intento' : `quedan ${restantes} intentos`}.` })
    }

    // Crear usuario en la base de datos
    await query(
      'INSERT INTO users (name, email, password, phone, role, email_verified) VALUES (?,?,?,?,?,?)',
      [pending.name, pending.email, pending.password, pending.phone || null, 'client', true]
    )

    pendingRegistrations.delete(tempToken)

    // El correo de bienvenida se envia sin bloquear la respuesta: la funcion
    // captura sus propios errores, asi que un fallo de SMTP no impide que la
    // cuenta quede creada.
    sendWelcomeEmail(pending.email, pending.name)

    res.status(201).json({ message: '¡Cuenta creada exitosamente! Ya puedes iniciar sesión.' })
  } catch (err) { next(err) }
}

// Los Map de arriba solo se limpian en el camino feliz, asi que cada login
// abandonado o registro sin verificar deja una entrada muerta y la memoria
// crece sin limite. Este barrido las descarta cada 5 minutos.
//
// NOTA: esto resuelve la fuga, no el problema de fondo. El estado sigue
// viviendo en la memoria del proceso: se pierde al reiniciar el contenedor y,
// con mas de una replica del backend, la peticion de verificacion puede llegar
// a un proceso que no tiene el token. Ver hallazgo I5 en AUDITORIA.md.
const purgarExpirados = () => {
  const ahora = Date.now()
  let purgados = 0
  for (const [clave, valor] of tempTokens) {
    if (valor.expires < ahora) { tempTokens.delete(clave); purgados++ }
  }
  for (const [clave, valor] of pendingRegistrations) {
    if (valor.expires < ahora) { pendingRegistrations.delete(clave); purgados++ }
  }
  if (purgados > 0) logger.debug(`Purgadas ${purgados} entrada(s) expirada(s) de autenticacion`)
}

// unref() para que este temporizador no mantenga vivo el proceso al apagarse.
setInterval(purgarExpirados, 5 * 60 * 1000).unref()

export const getMe = async (req, res) => {
  res.json({ user: req.user })
}

// Los dos endpoints de abajo faltaban: la pantalla de Perfil del cliente ya los
// llamaba (`PUT /auth/profile` y `PUT /auth/password` en ProfilePage.jsx), pero
// no estaban declarados en las rutas, asi que ambos botones respondian 404 y la
// pantalla entera no servia para nada (hallazgo C8). El contrato que se
// implementa aqui es exactamente el que el frontend ya enviaba.

export const updateProfile = async (req, res, next) => {
  try {
    const { name, phone } = req.body
    await query('UPDATE users SET name=?, phone=? WHERE id=?', [name.trim(), phone?.trim() || null, req.user.id])
    const user = await queryOne('SELECT id, name, email, phone, role, is_active FROM users WHERE id=?', [req.user.id])
    res.json({ user, message: 'Perfil actualizado' })
  } catch (err) { next(err) }
}

export const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body
    const user = await queryOne('SELECT id, password FROM users WHERE id=?', [req.user.id])
    if (!user || !(await bcrypt.compare(currentPassword, user.password))) {
      return res.status(401).json({ message: 'La contraseña actual no es correcta' })
    }
    if (await bcrypt.compare(newPassword, user.password)) {
      return res.status(400).json({ message: 'La contraseña nueva debe ser distinta de la actual' })
    }
    const hashed = await bcrypt.hash(newPassword, 12)
    await query('UPDATE users SET password=? WHERE id=?', [hashed, req.user.id])
    logger.info(`Contrasena cambiada (usuario ${req.user.id})`)
    // Los tokens ya emitidos siguen siendo validos hasta que caduquen: no hay
    // lista negra de JWT. Queda anotado en AUDITORIA.md.
    res.json({ message: 'Contraseña actualizada' })
  } catch (err) { next(err) }
}