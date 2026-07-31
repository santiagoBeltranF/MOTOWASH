import { test, expect } from '@playwright/test'
import { correoDePrueba, crearClienteDirecto, limpiarDatosDePrueba, restaurarConfiguracion, conectar, proximoDiaLaborable } from '../helpers/datos.js'
import { entrarComoCliente, esperarToast, elegirDiaEnCalendario, irAPantallaAdmin } from '../helpers/sesion.js'

test.beforeAll(async () => { await restaurarConfiguracion() })
test.afterAll(async () => { await limpiarDatosDePrueba(); await restaurarConfiguracion() })

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

// Lleva a un cliente hasta el paso de confirmar, sin pulsar el boton.
const prepararReserva = async (page, dia) => {
  await page.locator('button', { hasText: /minutos/ }).first().click()
  await expect(page.getByText(/selecciona la fecha/i)).toBeVisible()
  await elegirDiaEnCalendario(page, dia)
  await expect(page.getByText(/selecciona el horario/i)).toBeVisible()
  await page.locator('button').filter({ hasText: /^\d{2}:\d{2}$/ }).first().click()
  await expect(page.getByRole('button', { name: /^confirmar cita$/i })).toBeVisible()
}

// --- Concurrencia desde la interfaz (C5, ahora con navegadores) -------------

test('dos clientes reservando la misma franja a la vez: solo uno lo consigue', async ({ browser }) => {
  test.setTimeout(120_000)
  const db = await conectar()
  await db.query("UPDATE settings SET value='1' WHERE key_name='max_appointments_per_slot'")
  await db.end()

  const correoA = correoDePrueba('concA')
  const correoB = correoDePrueba('concB')
  await crearClienteDirecto(correoA)
  await crearClienteDirecto(correoB)

  // Dos contextos = dos navegadores independientes, con su propia sesion
  const ctxA = await browser.newContext()
  const ctxB = await browser.newContext()
  const pageA = await ctxA.newPage()
  const pageB = await ctxB.newPage()

  try {
    await entrarComoCliente(pageA, correoA, 'Password123')
    await entrarComoCliente(pageB, correoB, 'Password123')

    const dia = proximoDiaLaborable(6)
    await prepararReserva(pageA, dia)
    await prepararReserva(pageB, dia)

    // Ambos pulsan Confirmar sin esperarse
    await Promise.all([
      pageA.getByRole('button', { name: /^confirmar cita$/i }).click(),
      pageB.getByRole('button', { name: /^confirmar cita$/i }).click()
    ])

    await pageA.waitForTimeout(4000)

    const exito = async (p) => p.getByText(/¡cita confirmada!/i).isVisible().catch(() => false)
    const confirmadas = [await exito(pageA), await exito(pageB)].filter(Boolean).length

    expect(confirmadas, 'exactamente una de las dos reservas debe prosperar').toBe(1)

    // Y la base tiene que reflejar lo mismo
    const db2 = await conectar()
    const [filas] = await db2.query(
      "SELECT COUNT(*) n FROM appointments WHERE appointment_date=? AND status!='cancelled'", [ymd(dia)]
    )
    await db2.end()
    expect(filas[0].n, 'solo debe existir una cita en esa franja').toBe(1)
  } finally {
    await ctxA.close()
    await ctxB.close()
    const db3 = await conectar()
    await db3.query("UPDATE settings SET value='2' WHERE key_name='max_appointments_per_slot'")
    await db3.end()
  }
})

// --- Acciones del administrador sobre citas ---------------------------------

test.describe('acciones del admin sobre una cita', () => {
  test.use({ storageState: 'estado-admin.json' })

  test('cancelar una cita desde el panel', async ({ page }) => {
    const correo = correoDePrueba('adcancel')
    const { id } = await crearCitaDirecta(correo, proximoDiaLaborable(7), '09:00')

    page.on('dialog', d => d.accept())
    await page.goto('/admin/appointments')
    const fila = page.locator('tr', { hasText: 'Cliente E2E' }).first()
    await expect(fila).toBeVisible({ timeout: 10_000 })

    await fila.getByRole('button', { name: /cancelar/i }).click()
    await esperarToast(page, /cita cancelada/i)

    const db = await conectar()
    const [f] = await db.query('SELECT status FROM appointments WHERE id=?', [id])
    await db.end()
    expect(f[0].status, 'la cita debe quedar cancelada en la base').toBe('cancelled')
  })

  test('no deja marcar como realizada una cita que aun no ha empezado', async ({ page }) => {
    const correo = correoDePrueba('adfutura')
    await crearCitaDirecta(correo, proximoDiaLaborable(8), '10:00')

    await page.goto('/admin/appointments')
    const fila = page.locator('tr', { hasText: 'Cliente E2E' }).first()
    await expect(fila).toBeVisible({ timeout: 10_000 })

    await fila.getByRole('button', { name: /marcar como realizada/i }).click()
    // El backend lo rechaza (I6) y el mensaje tiene que llegar a la pantalla
    await esperarToast(page, /aún no ha llegado su fecha y hora/i)
  })
})

// --- Volumen: el tope de paginacion de M4 en la interfaz --------------------

test.describe('volumen de datos', () => {
  test.use({ storageState: 'estado-admin.json' })

  test('@ui con 150 citas la paginacion deja llegar a todas', async ({ page }) => {
    test.setTimeout(120_000)
    const correo = correoDePrueba('volumen')
    await crearClienteDirecto(correo)

    const db = await conectar()
    const [[cli]] = [await db.query('SELECT id FROM users WHERE email=?', [correo])]
    const clienteId = cli[0].id
    const [[svc]] = [await db.query('SELECT id FROM services LIMIT 1')]
    const servicioId = svc[0].id

    const base = proximoDiaLaborable(20)
    for (let i = 0; i < 150; i++) {
      const d = new Date(base); d.setDate(d.getDate() + (i % 30))
      await db.execute(
        `INSERT INTO appointments (client_id, service_id, appointment_date, start_time, end_time, final_price, status)
         VALUES (?,?,?,?,?,?,?)`,
        [clienteId, servicioId, ymd(d), '08:00:00', '09:00:00', 15000, 'confirmed']
      )
    }
    const [tot] = await db.query('SELECT COUNT(*) n FROM appointments WHERE client_id=?', [clienteId])
    await db.end()
    expect(tot[0].n).toBe(150)

    await page.goto('/admin/appointments')
    await expect(page.locator('table')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText(/no hay citas para mostrar/i)).toHaveCount(0)

    // 20 filas por pagina, pero ahora hay controles para llegar al resto (E9)
    expect(await page.locator('tbody tr').count()).toBe(20)
    await expect(page.getByText(/mostrando 1–20 de 15\d/i)).toBeVisible()

    // Ir a la pagina 2 debe traer filas distintas
    const primeraDeLaUno = await page.locator('tbody tr').first().textContent()
    await page.getByRole('button', { name: 'Página siguiente' }).click()
    await expect(page.getByText(/mostrando 21–40/i)).toBeVisible({ timeout: 10_000 })
    expect(await page.locator('tbody tr').first().textContent()).not.toBe(primeraDeLaUno)

    // Saltar por numero de pagina
    await page.getByRole('button', { name: 'Página 4', exact: true }).click()
    await expect(page.getByText(/mostrando 61–80/i)).toBeVisible({ timeout: 10_000 })

    // Y volver atras
    await page.getByRole('button', { name: 'Página anterior' }).click()
    await expect(page.getByText(/mostrando 41–60/i)).toBeVisible({ timeout: 10_000 })

    // En la primera pagina, "anterior" tiene que estar deshabilitado
    await page.getByRole('button', { name: 'Página 1', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Página anterior' })).toBeDisabled()
  })
})

test.describe('paginacion en las otras dos pantallas', () => {
  test.use({ storageState: 'estado-admin.json' })

  test('@ui Clientes y Reportes tambien paginan', async ({ page }) => {
    test.setTimeout(120_000)
    const bcrypt = (await import('bcryptjs')).default
    const db = await conectar()
    const hash = bcrypt.hashSync('Password123', 10)
    for (let i = 0; i < 45; i++) {
      await db.execute(
        'INSERT INTO users (name,email,password,role,is_active,email_verified,two_fa_enabled) VALUES (?,?,?,?,?,?,?)',
        [`Cliente Paginado ${i}`, `pag${i}-${Date.now()}@prueba.local`, hash, 'client', 1, 1, 0]
      )
    }
    await db.end()

    await page.goto('/admin/clients')
    await expect(page.locator('table')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText(/mostrando 1–20 de/i)).toBeVisible({ timeout: 10_000 })
    await page.getByRole('button', { name: 'Página siguiente' }).click()
    await expect(page.getByText(/mostrando 21–40/i)).toBeVisible({ timeout: 10_000 })

    // Buscar debe devolver a la pagina 1 (estabamos en la 2)
    await page.locator('input[placeholder*="Buscar"]').fill('Cliente Paginado')
    await expect(page.getByText(/mostrando 1–20 de 45/i)).toBeVisible({ timeout: 10_000 })

    // Con pocos resultados no hay nada que paginar y el control desaparece
    await page.locator('input[placeholder*="Buscar"]').fill('Cliente Paginado 7')
    await page.waitForTimeout(1200)
    await expect(page.getByRole('button', { name: 'Página siguiente' })).toHaveCount(0)

    // Reportes: la pestana de Clientes esta paginada; la de Ingresos no, porque
    // viene agregada por periodo.
    await page.goto('/admin/reports')
    await page.getByRole('button', { name: 'Clientes', exact: true }).click()
    await expect(page.getByText(/mostrando 1–20 de/i)).toBeVisible({ timeout: 15_000 })

    await page.getByRole('button', { name: 'Ingresos', exact: true }).click()
    await page.waitForTimeout(1500)
    await expect(page.getByRole('button', { name: 'Página siguiente' })).toHaveCount(0)
  })
})

// Crea una cita ya confirmada directamente en la base, para no tener que
// recorrer el asistente cuando lo que se prueba es otra cosa.
async function crearCitaDirecta (correo, dia, hora) {
  await crearClienteDirecto(correo)
  const db = await conectar()
  const [cli] = await db.query('SELECT id FROM users WHERE email=?', [correo])
  const [svc] = await db.query('SELECT id, duration_minutes FROM services LIMIT 1')
  const fin = `${String(Number(hora.slice(0, 2)) + 1).padStart(2, '0')}:00:00`
  const [res] = await db.execute(
    `INSERT INTO appointments (client_id, service_id, appointment_date, start_time, end_time, final_price, status)
     VALUES (?,?,?,?,?,?,?)`,
    [cli[0].id, svc[0].id, ymd(dia), hora + ':00', fin, 15000, 'confirmed']
  )
  await db.end()
  return { id: res.insertId }
}
