import { test, expect } from '@playwright/test'
import { correoDePrueba, crearClienteDirecto, limpiarDatosDePrueba, restaurarConfiguracion, conectar } from '../helpers/datos.js'
import { entrarComoCliente, esperarToast, irAPantallaAdmin } from '../helpers/sesion.js'
import bcrypt from 'bcryptjs'

test.beforeAll(async () => { await restaurarConfiguracion() })
test.afterAll(async () => { await limpiarLoQueCreaEsteArchivo(); await restaurarConfiguracion() })

const CLAVE_CAJERO = 'Cajero123'
const correoCajero = 'cajero-e2e@prueba.local'

const crearCajero = async () => {
  const db = await conectar()
  await db.query('DELETE FROM users WHERE email=?', [correoCajero])
  await db.execute(
    'INSERT INTO users (name,email,password,role,is_active,email_verified,two_fa_enabled) VALUES (?,?,?,?,?,?,?)',
    ['Cajero E2E', correoCajero, bcrypt.hashSync(CLAVE_CAJERO, 10), 'cashier', 1, 1, 0]
  )
  await db.end()
}

const limpiarLoQueCreaEsteArchivo = async () => {
  const db = await conectar()
  await db.query("DELETE FROM appointments WHERE plate LIKE 'E2E%' OR client_id IN (SELECT id FROM users WHERE email LIKE '%@prueba.local' OR name LIKE '[E2E]%')")
  await db.query("DELETE FROM users WHERE name LIKE '[E2E]%'")
  await db.end()
  await limpiarDatosDePrueba()
}

const entrarComoCajero = async (page) => {
  await page.goto('/login')
  await page.locator('input[type="email"]').fill(correoCajero)
  await page.locator('input[type="password"]').fill(CLAVE_CAJERO)
  await page.getByRole('button', { name: /continuar/i }).click()
  await expect(page).toHaveURL(/\/admin/, { timeout: 15_000 })
}

// --- Rol de cajero ---------------------------------------------------------

test.describe('rol de cajero', () => {
  test.beforeAll(async () => { await crearCajero() })

  test('entra al panel y ve solo lo suyo', async ({ page }) => {
    await entrarComoCajero(page)

    // Lo que SÍ debe ver
    await expect(page.getByRole('link', { name: 'Citas', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: /clientes/i })).toBeVisible()

    // Lo que NO: configuración, servicios, promociones, horarios ni reportes
    for (const oculto of [/configuración|configuracion/i, /servicios/i, /promociones/i, /horarios/i, /reportes/i]) {
      await expect(page.getByRole('link', { name: oculto })).toHaveCount(0)
    }
    await expect(page.getByText(/caja/i).first()).toBeVisible()
  })

  test('escribir la URL a mano tampoco le abre lo de admin', async ({ page }) => {
    await entrarComoCajero(page)
    for (const ruta of ['/admin/settings', '/admin/services', '/admin/promotions', '/admin/reports']) {
      await page.goto(ruta)
      await expect(page, `${ruta} no debe quedar accesible`).not.toHaveURL(new RegExp(ruta.replace('/', '\\/') + '$'))
    }
  })

  test('el cajero ve TODAS las citas, no solo las suyas', async ({ page }) => {
    // Regresión del fallo silencioso: `role === 'admin'` degradaba al cajero a
    // cliente y le mostraba una lista vacía en vez de la del negocio.
    const correo = correoDePrueba('citaajena')
    await crearClienteDirecto(correo)
    const db = await conectar()
    const [cli] = await db.query('SELECT id FROM users WHERE email=?', [correo])
    const [svc] = await db.query('SELECT id FROM services LIMIT 1')
    const d = new Date(); d.setDate(d.getDate() + 4)
    while (d.getDay() === 0) d.setDate(d.getDate() + 1)
    const fecha = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    await db.execute(
      `INSERT INTO appointments (client_id, service_id, plate, appointment_date, start_time, end_time, final_price, status)
       VALUES (?,?,?,?,?,?,?,?)`,
      [cli[0].id, svc[0].id, 'E2EAAA1', fecha, '09:00:00', '10:00:00', 15000, 'confirmed']
    )
    await db.end()

    await entrarComoCajero(page)
    await irAPantallaAdmin(page, 'Citas')
    await expect(page.locator('tr', { hasText: 'E2EAAA1' })).toBeVisible({ timeout: 15_000 })
  })
})

// --- Invitados -------------------------------------------------------------

test.describe('clientes invitados', () => {
  test.use({ storageState: 'estado-admin.json' })

  test('crear invitado y agendarle una cita desde el panel', async ({ page }) => {
    await page.goto('/admin/appointments')
    await page.getByRole('button', { name: /nueva cita/i }).click()

    await page.getByRole('button', { name: /registrar invitado/i }).click()
    await page.locator('#inv-nombre').fill('[E2E] Invitado Mostrador')
    await page.locator('#inv-tel').fill('3001112233')
    await page.getByRole('button', { name: /guardar invitado/i }).click()
    await esperarToast(page, /invitado registrado/i)

    const d = new Date(); d.setDate(d.getDate() + 5)
    while (d.getDay() === 0) d.setDate(d.getDate() + 1)
    const fecha = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

    await page.locator('#panel-servicio').selectOption({ index: 1 })
    await page.locator('#panel-categoria').selectOption({ index: 1 })
    await page.locator('#panel-placa').fill('e2e-bb2')
    await page.locator('#panel-fecha').fill(fecha)
    await page.locator('#panel-hora').fill('10:00')
    await page.getByRole('button', { name: /^crear cita$/i }).click()

    await esperarToast(page, /cita creada/i)
    // La placa se guarda normalizada: mayúsculas y sin guiones
    await expect(page.locator('tr', { hasText: 'E2EBB2' })).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('tr', { hasText: 'E2EBB2' }).getByText(/invitado/i)).toBeVisible()
  })

})

// Fuera del grupo anterior a proposito: este test necesita llegar al login SIN
// sesion. Heredando la del administrador, GuestRoute redirige a /admin antes de
// que se pueda escribir nada.
test.describe('invitado sin credenciales', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('un invitado no puede iniciar sesión', async ({ page }) => {
    const correo = correoDePrueba('invlogin')
    const db = await conectar()
    await db.execute(
      'INSERT INTO users (name,email,password,role,is_guest,is_active) VALUES (?,?,?,?,?,?)',
      ['[E2E] Invitado Sin Clave', correo, null, 'client', 1, 1]
    )
    await db.end()

    await page.goto('/login')
    await page.locator('input[type="email"]').fill(correo)
    await page.locator('input[type="password"]').fill('cualquiercosa1')
    await page.getByRole('button', { name: /continuar/i }).click()
    await esperarToast(page, /correo o contraseña incorrectos/i)
    await expect(page).toHaveURL(/\/login/)
  })
})

// --- Placa -----------------------------------------------------------------

test.describe('placa', () => {
  test.use({ storageState: 'estado-admin.json' })

  test('se puede buscar una cita por placa', async ({ page }) => {
    const correo = correoDePrueba('placa')
    await crearClienteDirecto(correo)
    const db = await conectar()
    const [cli] = await db.query('SELECT id FROM users WHERE email=?', [correo])
    const [svc] = await db.query('SELECT id FROM services LIMIT 1')
    const d = new Date(); d.setDate(d.getDate() + 6)
    while (d.getDay() === 0) d.setDate(d.getDate() + 1)
    const fecha = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    await db.execute(
      `INSERT INTO appointments (client_id, service_id, plate, appointment_date, start_time, end_time, final_price, status)
       VALUES (?,?,?,?,?,?,?,?)`,
      [cli[0].id, svc[0].id, 'E2ECCC3', fecha, '11:00:00', '12:00:00', 15000, 'confirmed']
    )
    await db.end()

    await page.goto('/admin/appointments')
    // Buscar en minúsculas y con guion debe encontrar la misma moto
    await page.locator('#citas-placa').fill('e2e-ccc3')
    await expect(page.locator('tr', { hasText: 'E2ECCC3' })).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('tbody tr')).toHaveCount(1)
  })
})

// --- Sobrecupo -------------------------------------------------------------

test.describe('sobrecupo', () => {
  test.use({ storageState: 'estado-admin.json' })

  test('avisa y exige confirmación antes de sobrepasar el cupo', async ({ page }) => {
    test.setTimeout(120_000)
    const db = await conectar()
    await db.query("UPDATE settings SET value='1' WHERE key_name='max_appointments_per_slot'")
    await db.end()

    const d = new Date(); d.setDate(d.getDate() + 7)
    while (d.getDay() === 0) d.setDate(d.getDate() + 1)
    const fecha = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

    const agendar = async (nombre, placa) => {
      await page.goto('/admin/appointments')
      await page.getByRole('button', { name: /nueva cita/i }).click()
      await page.getByRole('button', { name: /registrar invitado/i }).click()
      await page.locator('#inv-nombre').fill(nombre)
      await page.getByRole('button', { name: /guardar invitado/i }).click()
      await esperarToast(page, /invitado registrado/i)
      await page.locator('#panel-servicio').selectOption({ index: 1 })
      await page.locator('#panel-placa').fill(placa)
      await page.locator('#panel-fecha').fill(fecha)
      await page.locator('#panel-hora').fill('09:00')
      await page.getByRole('button', { name: /^crear cita$/i }).click()
    }

    await agendar('[E2E] Primero', 'E2EDD1')
    await esperarToast(page, /cita creada/i)

    // El segundo debe toparse con el aviso, NO crearse solo
    await agendar('[E2E] Segundo', 'E2EDD2')
    await expect(page.getByText(/esta franja ya tiene 1 de 1/i)).toBeVisible({ timeout: 15_000 })

    // Si se cancela, no se crea nada
    await page.getByRole('button', { name: /no, cancelar/i }).click()
    await expect(page.getByText(/esta franja ya tiene/i)).toHaveCount(0)

    // Al confirmar sí, y queda marcada
    await page.getByRole('button', { name: /^crear cita$/i }).click()
    await expect(page.getByText(/esta franja ya tiene 1 de 1/i)).toBeVisible({ timeout: 15_000 })
    await page.getByRole('button', { name: /sí, crear en sobrecupo/i }).click()
    await esperarToast(page, /sobrecupo/i)

    await expect(page.locator('tr', { hasText: 'E2EDD2' }).getByText(/sobrecupo/i)).toBeVisible({ timeout: 15_000 })

    const db2 = await conectar()
    const [filas] = await db2.query("SELECT is_overbooked FROM appointments WHERE plate='E2EDD2'")
    await db2.end()
    expect(filas[0].is_overbooked, 'debe quedar marcada como sobrecupo en la base').toBe(1)
  })
})

// --- Precio por categoría --------------------------------------------------

test.describe('precio por tipo de moto', () => {
  test.use({ storageState: 'estado-admin.json' })

  test('cada categoría puede tener su propio precio', async ({ page }) => {
    const db = await conectar()
    const [svc] = await db.query("SELECT id FROM services ORDER BY id LIMIT 1")
    const [cats] = await db.query('SELECT id, name FROM motorcycle_categories WHERE is_active=TRUE ORDER BY sort_order')
    // Precio distinto en la primera categoría activa
    await db.execute(
      'INSERT INTO service_prices (service_id, category_id, price) VALUES (?,?,?) ON DUPLICATE KEY UPDATE price=VALUES(price)',
      [svc[0].id, cats[0].id, 33000]
    )
    const [fila] = await db.query('SELECT price FROM service_prices WHERE service_id=? AND category_id=?', [svc[0].id, cats[0].id])
    await db.end()

    expect(String(fila[0].price)).toBe('33000.00')
    expect(cats.length, 'deben quedar 3 categorías activas: Media nace inactiva').toBe(3)
  })
})

// --- Pantalla de precios por tipo de moto ----------------------------------

test.describe('matriz de precios', () => {
  test.use({ storageState: 'estado-admin.json' })

  test('editar un precio desde la pantalla y que persista', async ({ page }) => {
    await page.goto('/admin/services')
    await expect(page.getByRole('heading', { name: /precios por tipo de moto/i })).toBeVisible({ timeout: 15_000 })

    // Primer servicio, primera categoría
    const celda = page.locator('table input[type=number]').first()
    await celda.fill('41500')
    await page.getByRole('button', { name: /guardar precios/i }).click()
    await esperarToast(page, /precios actualizados/i)

    await page.reload()
    await expect(page.locator('table input[type=number]').first()).toHaveValue('41500.00', { timeout: 15_000 })

    const db = await conectar()
    const [fila] = await db.query(
      `SELECT sp.price FROM service_prices sp
       JOIN services s ON s.id=sp.service_id
       JOIN motorcycle_categories c ON c.id=sp.category_id
       ORDER BY s.name, c.sort_order LIMIT 1`
    )
    await db.end()
    expect(String(fila[0].price), 'debe guardarse exacto, sin coma flotante').toBe('41500.00')
  })

  test('una categoría inactiva se puede activar sin migrar', async ({ page }) => {
    await page.goto('/admin/services')
    await expect(page.getByRole('heading', { name: /precios por tipo de moto/i })).toBeVisible({ timeout: 15_000 })

    // «Media» nace inactiva y su columna aparece marcada como tal
    await expect(page.getByRole('columnheader', { name: /media \(inactiva\)/i })).toBeVisible()

    await page.getByRole('button', { name: /activar media/i }).click()
    await esperarToast(page, /media activada/i)
    await expect(page.getByRole('columnheader', { name: /^media$/i })).toBeVisible({ timeout: 10_000 })

    // Se deja como estaba, que las demás pruebas cuentan 3 activas
    await page.getByRole('button', { name: /desactivar media/i }).click()
    await esperarToast(page, /media desactivada/i)
  })
})
