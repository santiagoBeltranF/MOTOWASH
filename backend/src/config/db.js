import mysql from 'mysql2/promise'
import dotenv from 'dotenv'
dotenv.config()

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 3306,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  timezone: '+00:00',
  charset: 'utf8mb4'
})

export const query = async (sql, params) => {
  const [rows] = await pool.execute(sql, params)
  return rows
}

export const queryOne = async (sql, params) => {
  const rows = await query(sql, params)
  return rows[0] || null
}

export const transaction = async (callback) => {
  const conn = await pool.getConnection()
  await conn.beginTransaction()
  try {
    const result = await callback(conn)
    await conn.commit()
    return result
  } catch (err) {
    await conn.rollback()
    throw err
  } finally {
    conn.release()
  }
}

// Reintenta con espera fija en vez de morir al primer fallo. En Docker Compose
// el healthcheck de MySQL pasa en cuanto el demonio responde, pero el servidor
// sigue ejecutando los scripts de /docker-entrypoint-initdb.d y rechaza
// conexiones un rato mas; sin reintentos el backend se cae en cada arranque en
// frio. Si se agotan los intentos lanza el error, y quien llama decide.
export const testConnection = async ({ retries = 30, delayMs = 2000 } = {}) => {
  for (let intento = 1; intento <= retries; intento++) {
    try {
      await pool.execute('SELECT 1')
      console.log('✅ MySQL conectado correctamente')
      return
    } catch (err) {
      if (intento === retries) {
        console.error(`❌ No se pudo conectar a MySQL tras ${retries} intentos:`, err.message)
        throw err
      }
      console.warn(`⏳ MySQL aun no responde (intento ${intento}/${retries}): ${err.message}`)
      await new Promise(resolve => setTimeout(resolve, delayMs))
    }
  }
}

export default pool
