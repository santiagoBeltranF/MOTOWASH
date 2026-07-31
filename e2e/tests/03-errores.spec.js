import { test, expect } from '@playwright/test'
import { correoDePrueba, crearClienteDirecto, limpiarDatosDePrueba, restaurarConfiguracion, proximoDiaLaborable } from '../helpers/datos.js'
import { vaciarBuzon, esperarCodigo } from '../helpers/correo.js'
import { entrarComoAdmin, entrarComoCliente, escribirCodigo, esperarToast } from '../helpers/sesion.js'

test.beforeAll(async () => { await restaurarConfiguracion() })
test.afterAll(async () => { await limpiarDatosDePrueba(); await restaurarConfiguracion() })

// Los caminos de error se ejercitan desde la interfaz, no llamando al API: lo
// que interesa comprobar es que el mensaje del backend LLEGA a la pantalla.
test.describe('Caminos de error desde la interfaz', () => {

  test('login con credenciales incorrectas muestra el error', async ({ page }) => {
    await page.goto('/login')
    await page.locator('input[type="email"]').fill('noexiste@prueba.local')
    await page.locator('input[type="password"]').fill('loquesea123')
    await page.getByRole('button', { name: /continuar/i }).click()
    await esperarToast(page, /correo o contraseña incorrectos/i)
    await expect(page).toHaveURL(/\/login/)
  })

  test('registro con contrasena corta: el mensaje del backend debe verse', async ({ page }) => {
    await page.goto('/register')
    await page.locator('input[type="text"]').first().fill('X')
    await page.locator('input[type="email"]').fill(correoDePrueba('corta'))
    const claves = page.locator('input[type="password"]')
    await claves.nth(0).fill('1234')
    await claves.nth(1).fill('1234')
    await page.getByRole('button', { name: /crear cuenta/i }).click()
    await esperarToast(page, /al menos 8 caracteres/i)
  })

  test.describe('con sesion de administrador', () => {
    test.use({ storageState: 'estado-admin.json' })

  test('servicio con precio negativo', async ({ page }) => {
    await page.goto('/admin/services')
    await page.getByRole('button', { name: /nuevo servicio/i }).click()

    const m1 = page.locator('.fixed.inset-0')
    await m1.locator('input:not([type=number]):not([type=checkbox])').first().fill('[E2E] Precio negativo')
    await m1.locator('input[type=number]').nth(0).fill('-500')
    await m1.locator('input[type=number]').nth(1).fill('60')
    await page.getByRole('button', { name: /^guardar$/i }).click()

    // O lo frena el navegador (min="0") o lo frena el backend, pero NO debe
    // crearse un servicio con precio negativo.
    await expect(page.getByText('[E2E] Precio negativo')).not.toBeVisible({ timeout: 5000 })
  })

  test('servicio con duracion 0', async ({ page }) => {
    await page.goto('/admin/services')
    await page.getByRole('button', { name: /nuevo servicio/i }).click()

    const m2 = page.locator('.fixed.inset-0')
    await m2.locator('input:not([type=number]):not([type=checkbox])').first().fill('[E2E] Duracion cero')
    await m2.locator('input[type=number]').nth(0).fill('10000')
    await m2.locator('input[type=number]').nth(1).fill('0')
    await page.getByRole('button', { name: /^guardar$/i }).click()

    await expect(page.getByText('[E2E] Duracion cero')).not.toBeVisible({ timeout: 5000 })
  })

  test('promocion que termina antes de empezar', async ({ page }) => {
    await page.goto('/admin/promotions')
    await page.getByRole('button', { name: /nueva promoción|nueva promocion/i }).click()

    const m3 = page.locator('.fixed.inset-0')
    await m3.locator('input:not([type=number]):not([type=checkbox]):not([type=datetime-local])').first().fill('[E2E] Promo invertida')
    await m3.locator('input[type=number]').first().fill('10')
    await page.locator('input[type="datetime-local"]').nth(0).fill('2026-12-31T10:00')
    await page.locator('input[type="datetime-local"]').nth(1).fill('2026-01-01T10:00')
    await page.getByRole('button', { name: /^guardar$|crear/i }).last().click()

    // El backend responde 400 «La fecha de fin debe ser posterior a la de inicio»
    await esperarToast(page, /posterior a la de inicio/i)
  })

  test('doble clic en guardar no debe duplicar el servicio', async ({ page }) => {
    await page.goto('/admin/services')
    await page.getByRole('button', { name: /nuevo servicio/i }).click()

    const m4 = page.locator('.fixed.inset-0')
    await m4.locator('input:not([type=number]):not([type=checkbox])').first().fill('[E2E] Doble clic')
    await m4.locator('input[type=number]').nth(0).fill('15000')
    await m4.locator('input[type=number]').nth(1).fill('30')

    const guardar = page.getByRole('button', { name: /^guardar$/i })
    await guardar.click({ clickCount: 2, delay: 40 })

    await page.waitForTimeout(3000)
    await expect(page.getByText('[E2E] Doble clic')).toHaveCount(1)
  })

  test('sesion expirada: token invalido echa al login', async ({ page }) => {
    await page.goto('/admin/dashboard')
    await page.evaluate(() => localStorage.setItem('mw_token', 'token.completamente.invalido'))
    await page.goto('/admin/clients')
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 })
  })

  test('volver atras tras cerrar sesion no debe mostrar el panel', async ({ page }) => {
    await page.goto('/admin/clients')
    await expect(page.getByRole('heading', { name: /clientes/i })).toBeVisible()

    await page.getByRole('button', { name: /cerrar sesión|salir/i }).first().click()
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 })

    await page.goBack()
    // No debe verse contenido del panel con la sesion cerrada
    await expect(page.getByRole('heading', { name: /clientes/i })).not.toBeVisible({ timeout: 8000 })
  })

  })

  test('recargar a mitad del 2FA', async ({ page }) => {
    const correo = correoDePrueba('recarga')
    const c = await import('../helpers/datos.js')
    const bcrypt = (await import('bcryptjs')).default
    const conn = await c.conectar()
    await conn.execute(
      'INSERT INTO users (name,email,password,role,is_active,email_verified,two_fa_enabled) VALUES (?,?,?,?,?,?,?)',
      ['Recarga 2FA', correo, bcrypt.hashSync('Password123', 10), 'client', 1, 1, 1]
    )
    await conn.end()

    await vaciarBuzon()
    await page.goto('/login')
    await page.locator('input[type="email"]').fill(correo)
    await page.locator('input[type="password"]').fill('Password123')
    await page.getByRole('button', { name: /continuar/i }).click()
    await expect(page).toHaveURL(/verify-2fa/, { timeout: 15_000 })

    const codigo = await esperarCodigo(correo)

    // El usuario recarga la pagina — por ejemplo para volver a mirar el correo
    await page.reload()

    // Deberia poder seguir: o bien la pantalla mantiene el estado, o bien lo
    // manda de vuelta al login con un aviso. Quedarse en una pantalla que ya no
    // funciona es el peor resultado.
    await escribirCodigo(page, codigo)
    await expect(page).toHaveURL(/\/client|\/login/, { timeout: 15_000 })
  })

  test('cliente no puede entrar a rutas de admin', async ({ page }) => {
    const correo = correoDePrueba('rol')
    await crearClienteDirecto(correo)
    await entrarComoCliente(page, correo, 'Password123')

    await page.goto('/admin/clients')
    await expect(page).toHaveURL(/\/client/, { timeout: 10_000 })
  })

  test('agendar en una fecha pasada no debe ser posible', async ({ page }) => {
    const correo = correoDePrueba('pasada')
    await crearClienteDirecto(correo)
    await entrarComoCliente(page, correo, 'Password123')

    await page.locator('button', { hasText: /minutos/ }).first().click()
    await expect(page.getByText(/selecciona la fecha/i)).toBeVisible()

    // Los dias pasados del mes actual deben estar deshabilitados
    const hoy = new Date().getDate()
    if (hoy > 1) {
      const diaPasado = page.getByRole('button', { name: String(hoy - 1), exact: true }).first()
      await expect(diaPasado).toBeDisabled()
    }
  })

  test('domingo (cerrado) no ofrece horarios', async ({ page }) => {
    const correo = correoDePrueba('domingo')
    await crearClienteDirecto(correo)
    await entrarComoCliente(page, correo, 'Password123')

    await page.locator('button', { hasText: /minutos/ }).first().click()
    await expect(page.getByText(/selecciona la fecha/i)).toBeVisible()

    // Buscar el proximo domingo dentro del mes visible
    const d = new Date()
    d.setDate(d.getDate() + 1)
    while (d.getDay() !== 0) d.setDate(d.getDate() + 1)
    if (d.getMonth() === new Date().getMonth()) {
      await page.getByRole('button', { name: String(d.getDate()), exact: true }).first().click()
      await expect(page.getByText(/no hay horarios disponibles/i)).toBeVisible({ timeout: 10_000 })
    }
  })
})
