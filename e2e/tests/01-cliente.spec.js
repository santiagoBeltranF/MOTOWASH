import { test, expect } from '@playwright/test'
import { correoDePrueba, limpiarDatosDePrueba, restaurarConfiguracion, proximoDiaLaborable, conectar } from '../helpers/datos.js'
import { vaciarBuzon, esperarCodigo } from '../helpers/correo.js'
import { entrarComoCliente, escribirCodigo, esperarToast, elegirDiaEnCalendario } from '../helpers/sesion.js'

test.beforeAll(async () => { await restaurarConfiguracion() })
test.afterAll(async () => { await limpiarDatosDePrueba() })

// Va todo en un solo test a proposito: es un recorrido, cada paso depende del
// anterior. Partirlo obligaria a compartir estado entre tests, y Playwright
// reinicia el worker cuando uno falla, con lo que ese estado se pierde.
test('recorrido completo del cliente', async ({ page }) => {
  test.setTimeout(180_000)
  const CLAVE = 'Password123'
  const NUEVA = 'NuevaClave456'
  const correo = correoDePrueba('cliente')
  await vaciarBuzon()

  await test.step('registro con verificacion por correo', async () => {
    await page.goto('/register')
    await page.locator('input[type="text"]').first().fill('Cliente E2E')
    await page.locator('input[type="email"]').fill(correo)
    await page.locator('input[type="tel"]').fill('3001234567')
    const claves = page.locator('input[type="password"]')
    await claves.nth(0).fill(CLAVE)
    await claves.nth(1).fill(CLAVE)
    await page.getByRole('button', { name: /crear cuenta/i }).click()

    await expect(page.getByText(/verifica tu correo/i).first()).toBeVisible({ timeout: 15_000 })
    const codigo = await esperarCodigo(correo)
    await escribirCodigo(page, codigo)
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 })

    const c = await conectar()
    const [filas] = await c.query('SELECT id FROM users WHERE email=?', [correo])
    await c.end()
    expect(filas.length, 'el usuario deberia quedar creado').toBe(1)
  })

  await test.step('login con 2FA', async () => {
    await vaciarBuzon()
    await entrarComoCliente(page, correo, CLAVE, { con2FA: true })
  })

  await test.step('agendar una cita', async () => {
    await expect(page.getByRole('heading', { name: /agendar cita/i })).toBeVisible()
    // Se elige por posicion y no por nombre: los nombres con tilde estan
    // corrompidos en la base (ver informe), asi que "Lavado Básico" no casa.
    await page.locator('button', { hasText: /minutos/ }).first().click()

    await expect(page.getByText(/selecciona la fecha/i)).toBeVisible()
    const dia = proximoDiaLaborable(3)
    await elegirDiaEnCalendario(page, dia)

    await expect(page.getByText(/selecciona el horario/i)).toBeVisible()
    await page.locator('button').filter({ hasText: /^\d{2}:\d{2}$/ }).first().click()

    await expect(page.getByText(/confirmar cita/i).first()).toBeVisible()
    await page.getByRole('button', { name: /^confirmar cita$/i }).click()
    await expect(page.getByText(/¡cita confirmada!/i)).toBeVisible({ timeout: 20_000 })
  })

  await test.step('la cita aparece en Mis citas', async () => {
    await page.getByRole('link', { name: /mis citas/i }).click()
    await expect(page.getByRole('heading', { name: /mis citas/i })).toBeVisible()
    await expect(page.getByText(/no tienes citas aún/i)).toHaveCount(0)
    await expect(page.getByText(/pendiente/i).first()).toBeVisible()
  })

  await test.step('reagendar la cita', async () => {
    await page.getByRole('link', { name: /agendar/i }).click()
    await expect(page.getByText(/ya tienes una cita pendiente activa/i)).toBeVisible({ timeout: 10_000 })
    await page.getByRole('button', { name: /reagendar cita/i }).click()

    await expect(page.getByText(/selecciona la fecha/i)).toBeVisible()
    const dia = proximoDiaLaborable(5)
    await elegirDiaEnCalendario(page, dia)
    await page.locator('button').filter({ hasText: /^\d{2}:\d{2}$/ }).first().click()
    await page.getByRole('button', { name: /confirmar nuevo horario/i }).click()
    await expect(page.getByText(/¡cita reagendada!/i)).toBeVisible({ timeout: 20_000 })
  })

  await test.step('cancelar la cita', async () => {
    page.on('dialog', d => d.accept())
    // Hay que usar "Volver al inicio": pulsar "Agendar" en el menu no reinicia
    // el asistente porque es la misma ruta y el componente no se remonta.
    await page.getByRole('button', { name: /volver al inicio/i }).click()
    await expect(page.getByText(/ya tienes una cita pendiente activa/i)).toBeVisible({ timeout: 10_000 })
    await page.getByRole('button', { name: /cancelar cita/i }).click()
    await esperarToast(page, /cita cancelada/i)
    await expect(page.getByRole('heading', { name: /agendar cita/i })).toBeVisible({ timeout: 10_000 })
  })

  await test.step('perfil: cambiar datos personales', async () => {
    await page.getByRole('link', { name: /perfil/i }).click()
    await expect(page.getByRole('heading', { name: /mi perfil/i })).toBeVisible()

    await page.locator('form').first().locator('input').first().fill('Nombre Cambiado')
    await page.getByRole('button', { name: /guardar cambios/i }).click()
    await esperarToast(page, /perfil actualizado/i)

    // El nombre de la cabecera y de la tarjeta deberia reflejar el cambio sin
    // tener que recargar: la sesion en memoria sigue teniendo el nombre viejo.
    // expect.soft: se anota el fallo pero el recorrido continua, para recoger
    // todos los problemas en una sola pasada.
    await expect.soft(page.locator('header').getByText('Nombre Cambiado'),
      'la cabecera deberia mostrar el nombre nuevo sin recargar').toBeVisible({ timeout: 8000 })
  })

  await test.step('perfil: cambiar contrasena', async () => {
    const claves = page.locator('input[type="password"]')
    await claves.nth(0).fill(CLAVE)
    await claves.nth(1).fill(NUEVA)
    await claves.nth(2).fill(NUEVA)
    await page.getByRole('button', { name: /actualizar contraseña/i }).click()
    await esperarToast(page, /contraseña actualizada/i)
  })

  await test.step('entrar con la contrasena nueva', async () => {
    await page.evaluate(() => localStorage.clear())
    await vaciarBuzon()
    await entrarComoCliente(page, correo, NUEVA, { con2FA: true })
    await expect(page).toHaveURL(/\/client/)
  })
})
