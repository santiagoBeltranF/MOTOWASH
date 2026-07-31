import { test, expect } from '@playwright/test'
import { correoDePrueba, crearClienteDirecto, limpiarDatosDePrueba, restaurarConfiguracion, conectar } from '../helpers/datos.js'
import { esperarToast } from '../helpers/sesion.js'

test.beforeAll(async () => { await restaurarConfiguracion(); await limpiarCaja() })
test.afterAll(async () => { await limpiarCaja(); await limpiarDatosDePrueba(); await restaurarConfiguracion() })

// La caja se deja siempre en un estado conocido: estas pruebas dependen de que
// no haya turnos abiertos de una ejecución anterior.
const limpiarCaja = async () => {
  const db = await conectar()
  await db.query('UPDATE appointments SET paid_receipt_id=NULL')
  await db.query('DELETE FROM receipt_payments')
  await db.query('DELETE FROM receipt_lines')
  await db.query('DELETE FROM receipts')
  await db.query('DELETE FROM cash_shifts')
  await db.query('UPDATE receipt_sequence SET last_number=0 WHERE id=1')
  await db.end()
}

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

// Crea una cita cobrable de hoy, con precio conocido.
const citaCobrable = async (placa, precio = 15000) => {
  const correo = correoDePrueba('caja')
  await crearClienteDirecto(correo)
  const db = await conectar()
  const [cli] = await db.query('SELECT id FROM users WHERE email=?', [correo])
  const [svc] = await db.query('SELECT id FROM services LIMIT 1')
  const [res] = await db.execute(
    `INSERT INTO appointments (client_id, service_id, plate, appointment_date, start_time, end_time, final_price, status, source)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [cli[0].id, svc[0].id, placa, ymd(new Date()), '09:00:00', '10:00:00', precio, 'confirmed', 'panel']
  )
  await db.end()
  return res.insertId
}

test.describe('turno de caja', () => {
  test.use({ storageState: 'estado-admin.json' })

  test('sin turno abierto no se puede cobrar', async ({ page }) => {
    await limpiarCaja()
    await citaCobrable('CAJAA1')

    await page.goto('/admin/appointments')
    await page.locator('tr', { hasText: 'CAJAA1' }).getByRole('button', { name: /cobrar/i }).click()
    await page.getByRole('button', { name: /^cobrar \$/i }).click()

    await esperarToast(page, /no hay un turno de caja abierto/i)
  })

  test('abrir caja, cobrar en efectivo y cerrar cuadrando', async ({ page }) => {
    await limpiarCaja()
    await citaCobrable('CAJAB1', 15000)

    await page.goto('/admin/cash')
    await page.locator('#caja-base').fill('50000')
    await page.getByRole('button', { name: /^abrir caja$/i }).click()
    await esperarToast(page, /turno abierto/i)
    await expect(page.getByText(/turno abierto/i).first()).toBeVisible()

    await page.goto('/admin/appointments')
    await page.locator('tr', { hasText: 'CAJAB1' }).getByRole('button', { name: /cobrar/i }).click()
    await expect(page.getByText(/total a cobrar/i)).toBeVisible()
    await page.getByRole('button', { name: /^cobrar \$/i }).click()
    await esperarToast(page, /recibo n\.º 1/i)

    // La caja ya refleja el efectivo cobrado
    await page.goto('/admin/cash')
    await expect(page.getByText('$65.000')).toBeVisible({ timeout: 10_000 })

    await page.locator('#caja-conteo').fill('65000')
    await expect(page.getByText(/la caja cuadra exactamente/i)).toBeVisible()
    await page.getByRole('button', { name: /^cerrar caja$/i }).click()
    await esperarToast(page, /cuadra exactamente/i)
  })

  test('cierre con diferencia queda registrado', async ({ page }) => {
    await limpiarCaja()
    await citaCobrable('CAJAC1', 15000)

    await page.goto('/admin/cash')
    await page.locator('#caja-base').fill('20000')
    await page.getByRole('button', { name: /^abrir caja$/i }).click()
    await esperarToast(page, /turno abierto/i)

    await page.goto('/admin/appointments')
    await page.locator('tr', { hasText: 'CAJAC1' }).getByRole('button', { name: /cobrar/i }).click()
    await page.getByRole('button', { name: /^cobrar \$/i }).click()
    await esperarToast(page, /recibo n/i)

    // Esperado 35000, se declaran 33000: faltan 2000
    await page.goto('/admin/cash')
    await page.locator('#caja-conteo').fill('33000')
    await expect(page.getByText(/faltan \$2\.000/i)).toBeVisible()
    await page.getByRole('button', { name: /^cerrar caja$/i }).click()
    await esperarToast(page, /diferencia de -2000/i)

    const db = await conectar()
    const [t] = await db.query("SELECT expected_amount, counted_amount, difference_amount FROM cash_shifts ORDER BY id DESC LIMIT 1")
    await db.end()
    expect(String(t[0].expected_amount)).toBe('35000.00')
    expect(String(t[0].counted_amount)).toBe('33000.00')
    expect(String(t[0].difference_amount), 'la diferencia debe quedar guardada').toBe('-2000.00')
  })

  test('un turno de un día anterior queda vencido y bloquea el cobro', async ({ page }) => {
    await limpiarCaja()
    await citaCobrable('CAJAD1')

    // Turno abierto fechado ayer
    const ayer = new Date(); ayer.setDate(ayer.getDate() - 1)
    const db = await conectar()
    const [admin] = await db.query("SELECT id FROM users WHERE role='admin' LIMIT 1")
    await db.execute(
      `INSERT INTO cash_shifts (operation_date, opened_by, opened_at, opening_amount, status)
       VALUES (?,?,?,?,'open')`,
      [ymd(ayer), admin[0].id, `${ymd(ayer)} 08:00:00`, 10000]
    )
    await db.end()

    await page.goto('/admin/cash')
    await expect(page.getByText(/turno vencido/i)).toBeVisible({ timeout: 10_000 })

    // Y no deja cobrar
    await page.goto('/admin/appointments')
    await page.locator('tr', { hasText: 'CAJAD1' }).getByRole('button', { name: /cobrar/i }).click()
    await page.getByRole('button', { name: /^cobrar \$/i }).click()
    await esperarToast(page, /es de un día anterior/i)

    // Al cerrarlo se registra como cierre tardío
    await page.goto('/admin/cash')
    await page.locator('#caja-conteo').fill('10000')
    await page.getByRole('button', { name: /^cerrar caja$/i }).click()
    await esperarToast(page, /turno cerrado/i)

    const db2 = await conectar()
    const [t] = await db2.query('SELECT was_late_close, operation_date, closed_at FROM cash_shifts ORDER BY id DESC LIMIT 1')
    await db2.end()
    expect(t[0].was_late_close, 'debe marcarse como cierre tardío').toBe(1)
    // Misma trampa que en el backend: mysql2 devuelve DATE como objeto Date, y
    // String(fecha).slice(0,10) da «Thu Jul 30», no «2026-07-30».
    expect(ymd(new Date(t[0].operation_date)), 'conserva el día de operación').toBe(ymd(ayer))
  })
})

test.describe('cobro', () => {
  test.use({ storageState: 'estado-admin.json' })

  test('el mixto que no suma no deja cobrar', async ({ page }) => {
    await limpiarCaja()
    await citaCobrable('CAJAE1', 15000)

    await page.goto('/admin/cash')
    await page.locator('#caja-base').fill('0')
    await page.getByRole('button', { name: /^abrir caja$/i }).click()
    await esperarToast(page, /turno abierto/i)

    await page.goto('/admin/appointments')
    await page.locator('tr', { hasText: 'CAJAE1' }).getByRole('button', { name: /cobrar/i }).click()
    await page.getByRole('button', { name: /^mixto$/i }).click()

    // 5000 + 5000 sobre un total de 15000
    await page.locator('#cobro-efectivo').fill('5000')
    await page.locator('#cobro-transferencia').fill('5000')
    await expect(page.getByText(/faltan \$5\.000 por cubrir/i)).toBeVisible()
    await expect(page.getByRole('button', { name: /^cobrar \$/i })).toBeDisabled()

    // Pasarse tampoco vale
    await page.locator('#cobro-transferencia').fill('20000')
    await expect(page.getByText(/sobran/i)).toBeVisible()
    await expect(page.getByRole('button', { name: /^cobrar \$/i })).toBeDisabled()

    // Cuadrando sí
    await page.locator('#cobro-transferencia').fill('10000')
    await expect(page.getByRole('button', { name: /^cobrar \$/i })).toBeEnabled()
    await page.getByRole('button', { name: /^cobrar \$/i }).click()
    await esperarToast(page, /recibo n/i)

    const db = await conectar()
    const [pagos] = await db.query('SELECT method, amount FROM receipt_payments ORDER BY method')
    await db.end()
    expect(pagos.length, 'el mixto guarda el desglose, no solo el total').toBe(2)
    expect(pagos.map(p => `${p.method}:${p.amount}`).join(' ')).toBe('cash:5000.00 transfer:10000.00')
  })

  test('el descuento exige motivo', async ({ page }) => {
    await limpiarCaja()
    await citaCobrable('CAJAF1', 15000)

    await page.goto('/admin/cash')
    await page.locator('#caja-base').fill('0')
    await page.getByRole('button', { name: /^abrir caja$/i }).click()
    await esperarToast(page, /turno abierto/i)

    await page.goto('/admin/appointments')
    await page.locator('tr', { hasText: 'CAJAF1' }).getByRole('button', { name: /cobrar/i }).click()
    await page.locator('#cobro-descuento').fill('3000')
    await page.getByRole('button', { name: /^cobrar \$/i }).click()
    await esperarToast(page, /necesita motivo/i)

    await page.locator('#cobro-motivo').fill('Cliente frecuente')
    await page.getByRole('button', { name: /^cobrar \$/i }).click()
    await esperarToast(page, /recibo n/i)

    const db = await conectar()
    const [r] = await db.query('SELECT subtotal_amount, discount_amount, discount_reason, total_amount FROM receipts ORDER BY id DESC LIMIT 1')
    await db.end()
    expect(String(r[0].total_amount)).toBe('12000.00')
    expect(r[0].discount_reason).toBe('Cliente frecuente')
  })

  test('el precio del recibo queda congelado aunque cambie la tarifa', async ({ page }) => {
    await limpiarCaja()
    await citaCobrable('CAJAG1', 15000)

    await page.goto('/admin/cash')
    await page.locator('#caja-base').fill('0')
    await page.getByRole('button', { name: /^abrir caja$/i }).click()
    await esperarToast(page, /turno abierto/i)

    await page.goto('/admin/appointments')
    await page.locator('tr', { hasText: 'CAJAG1' }).getByRole('button', { name: /cobrar/i }).click()
    await page.getByRole('button', { name: /^cobrar \$/i }).click()
    await esperarToast(page, /recibo n/i)

    // Se cambia la tarifa y se renombra el servicio DESPUÉS del cobro
    const db = await conectar()
    const [antes] = await db.query('SELECT service_name, unit_amount FROM receipt_lines ORDER BY id DESC LIMIT 1')
    await db.query('UPDATE service_prices SET price=99000')
    await db.query("UPDATE services SET name=CONCAT(name,' MODIFICADO'), price=99000")
    const [despues] = await db.query('SELECT service_name, unit_amount FROM receipt_lines ORDER BY id DESC LIMIT 1')
    // Se deja como estaba para no afectar a otras pruebas
    await db.query("UPDATE services SET name=REPLACE(name,' MODIFICADO',''), price=15000")
    await db.query('UPDATE service_prices SET price=15000')
    await db.end()

    expect(despues[0].service_name, 'el nombre del recibo no puede reescribirse').toBe(antes[0].service_name)
    expect(String(despues[0].unit_amount), 'el importe del recibo no puede reescribirse').toBe(String(antes[0].unit_amount))
  })

  test('anular un cobro deja rastro y libera la cita', async ({ page }) => {
    await limpiarCaja()
    const citaId = await citaCobrable('CAJAH1', 15000)

    await page.goto('/admin/cash')
    await page.locator('#caja-base').fill('0')
    await page.getByRole('button', { name: /^abrir caja$/i }).click()
    await esperarToast(page, /turno abierto/i)

    await page.goto('/admin/appointments')
    await page.locator('tr', { hasText: 'CAJAH1' }).getByRole('button', { name: /cobrar/i }).click()
    await page.getByRole('button', { name: /^cobrar \$/i }).click()
    await esperarToast(page, /recibo n/i)

    // La anulación va por API: la pantalla de historial de recibos llega en el
    // Bloque 3, con el recibo impreso.
    const db = await conectar()
    const [r] = await db.query('SELECT id, receipt_number FROM receipts ORDER BY id DESC LIMIT 1')
    await db.end()

    // La autenticación va por Bearer en localStorage, no por cookie: page.request
    // no la hereda y hay que pasarla a mano.
    const token = await page.evaluate(() => localStorage.getItem('mw_token'))
    const resp = await page.request.post(`/api/receipts/${r[0].id}/void`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { reason: 'Cobro duplicado por error' }
    })
    expect(resp.status()).toBe(200)

    const db2 = await conectar()
    const [anulado] = await db2.query('SELECT status, void_reason, voided_at FROM receipts WHERE id=?', [r[0].id])
    const [cita] = await db2.query('SELECT status, paid_receipt_id FROM appointments WHERE id=?', [citaId])
    const [cuenta] = await db2.query('SELECT COUNT(*) n FROM receipts WHERE id=?', [r[0].id])
    await db2.end()

    expect(cuenta[0].n, 'un cobro no se borra nunca').toBe(1)
    expect(anulado[0].status).toBe('voided')
    expect(anulado[0].void_reason).toBe('Cobro duplicado por error')
    expect(cita[0].paid_receipt_id, 'la cita vuelve a poder cobrarse').toBeNull()
  })

  test('el consecutivo es global y continuo', async ({ page }) => {
    await limpiarCaja()
    await page.goto('/admin/cash')
    await page.locator('#caja-base').fill('0')
    await page.getByRole('button', { name: /^abrir caja$/i }).click()
    await esperarToast(page, /turno abierto/i)

    for (const placa of ['CAJAI1', 'CAJAI2', 'CAJAI3']) {
      await citaCobrable(placa, 10000)
      await page.goto('/admin/appointments')
      await page.locator('tr', { hasText: placa }).getByRole('button', { name: /cobrar/i }).click()
      await page.getByRole('button', { name: /^cobrar \$/i }).click()
      await esperarToast(page, /recibo n/i)
    }

    const db = await conectar()
    const [nums] = await db.query('SELECT receipt_number FROM receipts ORDER BY receipt_number')
    await db.end()
    expect(nums.map(n => n.receipt_number), 'sin huecos ni repetidos').toEqual([1, 2, 3])
  })
})
