import { test, expect } from '@playwright/test'
import { correoDePrueba, crearClienteDirecto, limpiarDatosDePrueba, restaurarConfiguracion, conectar } from '../helpers/datos.js'
import { vaciarBuzon, esperarCodigo } from '../helpers/correo.js'
import { entrarComoCliente, escribirCodigo, esperarToast, elegirDiaEnCalendario } from '../helpers/sesion.js'
import bcrypt from 'bcryptjs'

test.beforeAll(async () => { await restaurarConfiguracion() })
test.afterAll(async () => { await limpiarDatosDePrueba(); await restaurarConfiguracion() })

const crearCon2FA = async (correo) => {
  const c = await conectar()
  await c.execute(
    'INSERT INTO users (name,email,password,role,is_active,email_verified,two_fa_enabled) VALUES (?,?,?,?,?,?,?)',
    ['Cliente 2FA', correo, bcrypt.hashSync('Password123', 10), 'client', 1, 1, 1]
  )
  await c.end()
}

const pedirCodigo = async (page, correo) => {
  await page.goto('/login')
  await page.locator('input[type="email"]').fill(correo)
  await page.locator('input[type="password"]').fill('Password123')
  await page.getByRole('button', { name: /continuar/i }).click()
  await expect(page).toHaveURL(/verify-2fa/, { timeout: 15_000 })
}

// --- Hallazgo 1: los mensajes de error deben llegar a la pantalla -----------

test('1. login incorrecto muestra el mensaje y no recarga la pagina', async ({ page }) => {
  await page.goto('/login')
  await page.locator('input[type="email"]').fill('noexiste@prueba.local')
  await page.locator('input[type="password"]').fill('loquesea123')
  await page.getByRole('button', { name: /continuar/i }).click()

  await esperarToast(page, /correo o contraseña incorrectos/i)
  await expect(page).toHaveURL(/\/login/)
  // Lo escrito debe seguir ahi: si la pagina se hubiera recargado estaria vacio
  await expect(page.locator('input[type="email"]')).toHaveValue('noexiste@prueba.local')
})

test('1. el contador de intentos de C4 se ve en el 2FA', async ({ page }) => {
  const correo = correoDePrueba('cont2fa')
  await crearCon2FA(correo)
  await vaciarBuzon()
  await pedirCodigo(page, correo)

  // Tres codigos equivocados: el aviso de intentos restantes debe verse cada vez
  for (const restantes of [4, 3, 2]) {
    await escribirCodigo(page, '000000')
    await esperarToast(page, new RegExp(`quedan ${restantes} intentos`, 'i'))
    await expect(page, 'no debe echarnos al login por un codigo mal').toHaveURL(/verify-2fa/)
  }

  await escribirCodigo(page, '000000')
  await esperarToast(page, /queda 1 intento/i)

  await escribirCodigo(page, '000000')
  await esperarToast(page, /demasiados intentos fallidos/i)
})

test('1. el contador de intentos se ve tambien en verify-register', async ({ page }) => {
  const correo = correoDePrueba('contreg')
  await vaciarBuzon()

  await page.goto('/register')
  await page.locator('input[type="text"]').first().fill('Contador Registro')
  await page.locator('input[type="email"]').fill(correo)
  const claves = page.locator('input[type="password"]')
  await claves.nth(0).fill('Password123')
  await claves.nth(1).fill('Password123')
  await page.getByRole('button', { name: /crear cuenta/i }).click()
  await expect(page.getByText(/verifica tu correo/i).first()).toBeVisible({ timeout: 15_000 })

  for (const restantes of [4, 3]) {
    await escribirCodigo(page, '000000')
    await esperarToast(page, new RegExp(`quedan ${restantes} intentos`, 'i'))
  }
})

test('1. contrasena actual incorrecta muestra el mensaje, no expulsa', async ({ page }) => {
  const correo = correoDePrueba('clave')
  await crearClienteDirecto(correo)
  await entrarComoCliente(page, correo, 'Password123')
  await page.goto('/client/profile')

  const claves = page.locator('input[type="password"]')
  await claves.nth(0).fill('EstaNoEsLaBuena')
  await claves.nth(1).fill('OtraClave1234')
  await claves.nth(2).fill('OtraClave1234')
  await page.getByRole('button', { name: /actualizar contraseña/i }).click()

  await esperarToast(page, /la contraseña actual no es correcta/i)
  await expect(page, 'no debe cerrarnos la sesion').toHaveURL(/\/client\/profile/)
})

// --- Hallazgo 2: recargar durante el 2FA ------------------------------------

test('@ui 2. recargar durante el 2FA permite continuar', async ({ page }) => {
  const correo = correoDePrueba('recarga')
  await crearCon2FA(correo)
  await vaciarBuzon()
  await pedirCodigo(page, correo)

  const codigo = await esperarCodigo(correo)
  await page.reload()                       // el usuario vuelve a mirar el correo

  await escribirCodigo(page, codigo)
  await expect(page, 'tras recargar, el codigo correcto debe seguir sirviendo').toHaveURL(/\/client/, { timeout: 15_000 })
})

test('@ui 2. sin 2FA en curso, /verify-2fa avisa y devuelve al login', async ({ page }) => {
  await page.goto('/login')
  await page.evaluate(() => sessionStorage.clear())
  await page.goto('/verify-2fa')

  await esperarToast(page, /tu verificación caducó/i)
  await expect(page).toHaveURL(/\/login/, { timeout: 10_000 })
})

// --- Hallazgo 5: el perfil refresca el nombre en toda la aplicacion ----------

test('@ui 5. cambiar el nombre lo actualiza en la cabecera sin recargar', async ({ page }) => {
  const correo = correoDePrueba('nombre')
  await crearClienteDirecto(correo)
  await entrarComoCliente(page, correo, 'Password123')
  await page.goto('/client/profile')

  await page.locator('#perfil-nombre').fill('Nombre Nuevo E2E')
  await page.getByRole('button', { name: /guardar cambios/i }).click()
  await esperarToast(page, /perfil actualizado/i)

  // La tarjeta de perfil muestra el nombre en cualquier tamano.
  await expect(page.locator('.card').first().getByText('Nombre Nuevo E2E')).toBeVisible({ timeout: 8000 })
  // En la cabecera el nombre es `hidden sm:block`, asi que en moviles estrechos
  // no se pinta a proposito: ahi no tiene sentido exigirlo.
  const ancho = page.viewportSize()?.width ?? 1280
  if (ancho >= 640) {
    await expect(page.locator('header').getByText('Nombre Nuevo E2E')).toBeVisible({ timeout: 8000 })
  }
})

// --- Hallazgo 6: el asistente se reinicia al pulsar "Agendar" ---------------

test('@ui 6. pulsar Agendar tras reservar reinicia el asistente', async ({ page }) => {
  const correo = correoDePrueba('reinicio')
  await crearClienteDirecto(correo)
  await entrarComoCliente(page, correo, 'Password123')

  await page.locator('button', { hasText: /minutos/ }).first().click()
  const dia = new Date(); dia.setDate(dia.getDate() + 3)
  while (dia.getDay() === 0) dia.setDate(dia.getDate() + 1)
  await elegirDiaEnCalendario(page, dia)
  await page.locator('button').filter({ hasText: /^\d{2}:\d{2}$/ }).first().click()
  await page.getByRole('button', { name: /^confirmar cita$/i }).click()
  await expect(page.getByText(/¡cita confirmada!/i)).toBeVisible({ timeout: 20_000 })

  // Pulsar "Agendar" en el menu estando ya en /client/book
  await page.getByRole('link', { name: /agendar/i }).click()
  await expect(page.getByText(/¡cita confirmada!/i)).toHaveCount(0, { timeout: 10_000 })
  await expect(page.getByText(/ya tienes una cita pendiente activa/i)).toBeVisible({ timeout: 10_000 })
})

// --- Hallazgo 7: los labels estan asociados a sus campos --------------------

test('@ui 7. los formularios se pueden manejar por etiqueta', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Correo electrónico').fill('prueba@labels.local')
  await page.getByLabel('Contraseña').fill('unaclave123')
  await expect(page.locator('#login-email')).toHaveValue('prueba@labels.local')

  await page.goto('/register')
  await page.getByLabel('Nombre completo').fill('Por Etiqueta')
  await page.getByLabel('Teléfono (opcional)').fill('3009998877')
  await expect(page.locator('#reg-nombre')).toHaveValue('Por Etiqueta')
  await expect(page.locator('#reg-telefono')).toHaveValue('3009998877')
})

// --- Cobertura que faltaba: domingo cerrado --------------------------------

test('@ui domingo no ofrece horarios en la interfaz', async ({ page }) => {
  const correo = correoDePrueba('domingo')
  await crearClienteDirecto(correo)
  await entrarComoCliente(page, correo, 'Password123')

  await page.locator('button', { hasText: /minutos/ }).first().click()
  await expect(page.getByText(/selecciona la fecha/i)).toBeVisible()

  // Proximo domingo, saltando el mes si hace falta
  const domingo = new Date()
  domingo.setDate(domingo.getDate() + 1)
  while (domingo.getDay() !== 0) domingo.setDate(domingo.getDate() + 1)

  await elegirDiaEnCalendario(page, domingo)
  await expect(page.getByText(/no hay horarios disponibles/i)).toBeVisible({ timeout: 10_000 })
})
