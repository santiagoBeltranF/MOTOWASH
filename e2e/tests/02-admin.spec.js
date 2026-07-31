import { test, expect } from '@playwright/test'
import { limpiarDatosDePrueba, restaurarConfiguracion } from '../helpers/datos.js'
import { entrarComoAdmin, esperarToast, irAPantallaAdmin } from '../helpers/sesion.js'

test.beforeAll(async () => { await restaurarConfiguracion() })
test.afterAll(async () => { await limpiarDatosDePrueba(); await restaurarConfiguracion() })

test.describe('Recorrido del administrador', () => {
  // Sesion reutilizada: /auth/login solo admite 5 intentos por IP cada 15 min.
  test.use({ storageState: 'estado-admin.json' })
  test.beforeEach(async ({ page }) => { await page.goto('/admin/dashboard') })

  test('las cuatro pantallas que estaban muertas por C7 pintan datos', async ({ page }) => {
    // Citas
    await irAPantallaAdmin(page, 'Citas')
    await expect(page.getByRole('heading', { name: /citas/i }).first()).toBeVisible()
    await expect(page.getByText(/error/i)).not.toBeVisible()

    // Clientes
    await irAPantallaAdmin(page, /clientes/i)
    await expect(page.getByRole('heading', { name: /clientes/i })).toBeVisible()
    await expect(page.locator('table')).toBeVisible({ timeout: 10_000 })

    // Reportes
    await irAPantallaAdmin(page, /reportes/i)
    await expect(page.getByRole('heading', { name: /reportes/i }).first()).toBeVisible()
    await expect(page.getByText(/error/i)).not.toBeVisible()

    // Dashboard
    await irAPantallaAdmin(page, /dashboard/i)
    await expect(page.getByText(/error/i)).not.toBeVisible()
  })

  test('crear y editar un servicio', async ({ page }) => {
    await irAPantallaAdmin(page, /servicios/i)
    await page.getByRole('button', { name: /nuevo servicio/i }).click()

    // getByLabel no sirve: los <label> no estan asociados a sus <input>.
    const modal = page.locator('.fixed.inset-0')
    await modal.locator('input:not([type=number]):not([type=checkbox])').first().fill('[E2E] Lavado de prueba')
    await modal.locator('textarea').fill('creado por las pruebas')
    await modal.locator('input[type=number]').nth(0).fill('22000')
    await modal.locator('input[type=number]').nth(1).fill('45')
    await page.getByRole('button', { name: /^guardar$/i }).click()

    await esperarToast(page, /servicio creado/i)
    // La lista debe refrescarse sola, sin recargar la pagina
    await expect(page.getByText('[E2E] Lavado de prueba')).toBeVisible({ timeout: 10_000 })

    // Editar
    const tarjeta = page.locator('.card', { hasText: '[E2E] Lavado de prueba' })
    await tarjeta.getByRole('button').first().click()
    await page.locator('.fixed.inset-0').locator('input[type=number]').nth(0).fill('27000')
    await page.getByRole('button', { name: /^guardar$/i }).click()
    await esperarToast(page, /servicio actualizado/i)
    await expect(page.getByText('$27.000')).toBeVisible({ timeout: 10_000 })
  })

  test('crear una promocion con fecha de fin', async ({ page }) => {
    await irAPantallaAdmin(page, /promociones/i)
    await page.getByRole('button', { name: /nueva promoción|nueva promocion/i }).click()

    const modal = page.locator('.fixed.inset-0')
    await modal.locator('input:not([type=number]):not([type=checkbox]):not([type=datetime-local])').first().fill('[E2E] Promo de prueba')
    await modal.locator('input[type=number]').first().fill('20')

    const ahora = new Date()
    const fin = new Date(ahora.getTime() + 7 * 24 * 3600 * 1000)
    const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:00`

    await page.locator('input[type="datetime-local"]').nth(0).fill(iso(ahora))
    await page.locator('input[type="datetime-local"]').nth(1).fill(iso(fin))
    await page.getByRole('button', { name: /^guardar$|crear/i }).last().click()

    await esperarToast(page, /promoción creada|promocion creada/i)
    await expect(page.getByText('[E2E] Promo de prueba')).toBeVisible({ timeout: 10_000 })
  })

  test('cambiar el horario de un dia', async ({ page }) => {
    await irAPantallaAdmin(page, /horarios/i)
    await expect(page.getByRole('heading', { name: /horario/i }).first()).toBeVisible()

    const horas = page.locator('input[type="time"]')
    await expect(horas.first()).toBeVisible({ timeout: 10_000 })
    await horas.nth(2).fill('09:00')

    await page.getByRole('button', { name: /guardar/i }).click()
    await esperarToast(page, /horario actualizado/i)

    // Al recargar deberia conservar el valor guardado
    await page.reload()
    await expect(page.locator('input[type="time"]').nth(2)).toHaveValue('09:00', { timeout: 10_000 })
  })

  test('guardar ajustes', async ({ page }) => {
    await irAPantallaAdmin(page, /configuración|configuracion/i)
    await expect(page.getByRole('heading', { name: /configuración|configuracion/i }).first()).toBeVisible()

    const campo = page.locator('input').first()
    await expect(campo).toBeVisible({ timeout: 10_000 })
    await campo.fill('MotoWash E2E')
    await page.getByRole('button', { name: /guardar/i }).click()
    await esperarToast(page, /configuración guardada|configuracion guardada/i)

    await page.reload()
    await expect(page.locator('input').first()).toHaveValue('MotoWash E2E', { timeout: 10_000 })
  })
})
