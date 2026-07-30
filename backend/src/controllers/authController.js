import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { v4 as uuidv4 } from 'uuid'
import { query, queryOne } from '../config/db.js'
import { send2FACode, sendWelcomeEmail } from '../services/emailService.js'
import logger from '../utils/logger.js'

const tempTokens = new Map()

const generate2FACode = () => Math.floor(100000 + Math.random() * 900000).toString()

export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body
    const user = await queryOne('SELECT * FROM users WHERE email = ? AND is_active = TRUE', [email])
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ message: 'Correo o contraseña incorrectos' })
    }
    if (user.two_fa_enabled) {
      const code = generate2FACode()
      const expires = new Date(Date.now() + 10 * 60 * 1000)
      await query('UPDATE users SET two_fa_code=?, two_fa_expires=? WHERE id=?', [code, expires, user.id])
      const tempToken = uuidv4()
      tempTokens.set(tempToken, { userId: user.id, expires: Date.now() + 15 * 60 * 1000 })
      await send2FACode(user.email, user.name, code)
      logger.info(`2FA code sent to ${user.email}`)
      return res.json({ requires2FA: true, tempToken, message: 'Código enviado a tu correo' })
    }
    
    // Firma de token con expiración de 30 días para mantener la sesión abierta
    const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '30d' })
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
    const user = await queryOne(
      'SELECT * FROM users WHERE id=? AND two_fa_code=? AND two_fa_expires > NOW()',
      [temp.userId, code]
    )
    if (!user) return res.status(401).json({ message: 'Código incorrecto o expirado' })
    await query('UPDATE users SET two_fa_code=NULL, two_fa_expires=NULL WHERE id=?', [user.id])
    tempTokens.delete(tempToken)
    
    // Firma de token con expiración de 30 días para mantener la sesión abierta tras el 2FA
    const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '30d' })
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
    pendingRegistrations.set(tempToken, { name, email, password: hashed, phone, code, expires })

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
      return res.status(401).json({ message: 'Código incorrecto' })
    }

    // Crear usuario en la base de datos
    await query(
      'INSERT INTO users (name, email, password, phone, role, email_verified) VALUES (?,?,?,?,?,?)',
      [pending.name, pending.email, pending.password, pending.phone || null, 'client', true]
    )

    pendingRegistrations.delete(tempToken)
    res.status(201).json({ message: '¡Cuenta creada exitosamente! Ya puedes iniciar sesión.' })
  } catch (err) { next(err) }
}

export const getMe = async (req, res) => {
  res.json({ user: req.user })
}