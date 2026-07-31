// Acceso directo a la base para preparar y limpiar escenarios. El puerto es el
// publicado por Compose en el host (DB_PORT_HOST, 3307 por defecto).
import mysql from 'mysql2/promise'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

const env = Object.fromEntries(
  fs.readFileSync(path.join(raiz, '.env'), 'utf8')
    .split('\n')
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
)

export const ADMIN = {
  email: env.ADMIN_EMAIL || 'admin@motowash.com',
  password: env.ADMIN_PASSWORD || 'Admin123!'
}

export const conectar = () => mysql.createConnection({
  host: '127.0.0.1',
  port: Number(env.DB_PORT_HOST || 3307),
  user: 'root',
  password: env.MYSQL_ROOT_PASSWORD,
  database: env.DB_NAME || 'motowash_db',
  timezone: 'local'
})

// Correo unico por ejecucion, para que las pruebas no choquen entre si ni con
// datos de corridas anteriores.
export const correoDePrueba = (prefijo = 'e2e') =>
  `${prefijo}-${Date.now()}-${Math.floor(Math.random() * 1000)}@prueba.local`

export const limpiarDatosDePrueba = async () => {
  const c = await conectar()
  await c.query("DELETE FROM appointments WHERE client_id IN (SELECT id FROM users WHERE email LIKE '%@prueba.local')")
  await c.query("DELETE FROM users WHERE email LIKE '%@prueba.local'")
  await c.query("DELETE FROM services WHERE name LIKE '[E2E]%'")
  await c.query("DELETE FROM promotions WHERE title LIKE '[E2E]%'")
  await c.end()
}

// Restaura los valores que las pruebas pueden dejar tocados.
export const restaurarConfiguracion = async () => {
  const c = await conectar()
  await c.query("UPDATE settings SET value='2' WHERE key_name='max_appointments_per_slot'")
  await c.query("UPDATE settings SET value='60' WHERE key_name='appointment_interval_minutes'")
  await c.query(`UPDATE schedule_config SET is_open=TRUE, open_time='08:00:00', close_time='18:00:00' WHERE day_of_week BETWEEN 1 AND 5`)
  await c.query(`UPDATE schedule_config SET is_open=TRUE, open_time='08:00:00', close_time='14:00:00' WHERE day_of_week=6`)
  await c.query(`UPDATE schedule_config SET is_open=FALSE WHERE day_of_week=0`)
  await c.end()
}

// Crea un cliente ya verificado y con el 2FA apagado, para las pruebas que no
// van sobre el flujo de correo.
export const crearClienteDirecto = async (email, password = 'Password123') => {
  const bcrypt = (await import('bcryptjs')).default
  const c = await conectar()
  await c.execute(
    'INSERT INTO users (name,email,password,role,is_active,email_verified,two_fa_enabled) VALUES (?,?,?,?,?,?,?)',
    ['Cliente E2E', email, bcrypt.hashSync(password, 10), 'client', 1, 1, 0]
  )
  await c.end()
  return { email, password }
}

// Proximo dia laborable a N dias vista, evitando domingo (cerrado).
export const proximoDiaLaborable = (desdeDias = 3) => {
  const d = new Date()
  d.setDate(d.getDate() + desdeDias)
  while (d.getDay() === 0) d.setDate(d.getDate() + 1)
  return d
}
