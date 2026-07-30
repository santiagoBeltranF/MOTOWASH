import bcrypt from 'bcryptjs'
import { query, queryOne } from './db.js'
import logger from '../utils/logger.js'

// Crea el usuario administrador en el arranque, a partir de ADMIN_EMAIL y
// ADMIN_PASSWORD del entorno.
//
// Antes el admin venia como INSERT en database.sql, con el hash escrito en el
// archivo (hallazgo C1). Eso metia una credencial en el repositorio: cualquiera
// que viera el codigo conocia el usuario y la contrasena del panel. Ahora el
// repositorio no contiene ninguna.
//
// Es idempotente: si el usuario ya existe no lo toca, asi que se puede ejecutar
// en cada arranque sin pisar una contrasena que se haya cambiado despues desde
// la aplicacion.
export const bootstrapAdmin = async () => {
  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase()
  const password = process.env.ADMIN_PASSWORD || ''

  if (!email || !password) {
    const yaHayAdmin = await queryOne("SELECT id FROM users WHERE role='admin' LIMIT 1")
    if (!yaHayAdmin) {
      logger.warn(
        'No hay ningun administrador y faltan ADMIN_EMAIL / ADMIN_PASSWORD: ' +
        'nadie podra entrar al panel. Defínelas en el .env y reinicia.'
      )
    }
    return
  }

  if (password.length < 8) {
    logger.warn('ADMIN_PASSWORD tiene menos de 8 caracteres; no se crea el administrador.')
    return
  }

  const existente = await queryOne('SELECT id, role FROM users WHERE email=?', [email])
  if (existente) {
    // Ya existe: no se toca la contrasena. Si se hubiera cambiado desde la
    // aplicacion, reescribirla en cada reinicio la revertiria.
    logger.info(`Administrador ya existente (${email}), no se modifica`)
    return
  }

  const hash = await bcrypt.hash(password, 12)
  await query(
    `INSERT INTO users (name, email, password, role, is_active, email_verified, two_fa_enabled)
     VALUES (?,?,?,?,?,?,?)`,
    ['Administrador', email, hash, 'admin', true, true, false]
  )
  logger.info(`Administrador creado: ${email}`)
  logger.warn('Cambia la contrasena del administrador desde la aplicacion y activa el 2FA cuando el correo este configurado.')
}
