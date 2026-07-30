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

export const testConnection = async () => {
  try {
    await pool.execute('SELECT 1')
    console.log('✅ MySQL conectado correctamente')
  } catch (err) {
    console.error('❌ Error conectando a MySQL:', err.message)
    process.exit(1)
  }
}

export default pool
