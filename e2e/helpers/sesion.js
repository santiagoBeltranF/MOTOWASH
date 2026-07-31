import { expect } from '@playwright/test'
import { ADMIN } from './datos.js'
import { esperarCodigo } from './correo.js'

// Entra como administrador. El admin se crea con el 2FA apagado
// (bootstrapAdmin), asi que no pasa por el paso del codigo.
// OJO: en esta aplicacion los <label> no estan asociados a sus <input> (no hay
// htmlFor/id), asi que getByLabel no funciona en los formularios de acceso. Se
// selecciona por tipo de campo, que si es estable.
export const entrarComoAdmin = async (page) => {
  await page.goto('/login')
  await page.locator('input[type="email"]').fill(ADMIN.email)
  await page.locator('input[type="password"]').fill(ADMIN.password)
  await page.getByRole('button', { name: /continuar/i }).click()
  await expect(page).toHaveURL(/\/admin/, { timeout: 15_000 })
}

// Entra como cliente. Si tiene el 2FA activo, lee el codigo del buzon de
// pruebas y completa la verificacion.
export const entrarComoCliente = async (page, email, password, { con2FA = false } = {}) => {
  await page.goto('/login')
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(password)
  await page.getByRole('button', { name: /continuar/i }).click()

  if (con2FA) {
    await expect(page).toHaveURL(/verify-2fa/, { timeout: 15_000 })
    const codigo = await esperarCodigo(email)
    await escribirCodigo(page, codigo)
  }
  await expect(page).toHaveURL(/\/client/, { timeout: 15_000 })
}

// Los seis recuadros del codigo son inputs sueltos que van pasando el foco.
export const escribirCodigo = async (page, codigo) => {
  const recuadros = page.locator('input[inputmode="numeric"]')
  await expect(recuadros).toHaveCount(6)
  for (let i = 0; i < 6; i++) await recuadros.nth(i).fill(codigo[i])
}

// El calendario de BookPage abre siempre en el mes en curso. Si la fecha
// buscada cae en otro mes hay que avanzar con la flecha antes de pinchar el
// dia, o se acaba pinchando el dia equivocado (o uno deshabilitado del pasado).
export const elegirDiaEnCalendario = async (page, fecha) => {
  // Se cuenta cuantos meses hay que avanzar en vez de comparar el texto de la
  // cabecera: el formato de date-fns ("agosto 2026") y el de toLocaleDateString
  // ("agosto de 2026") no coinciden, y comparar cadenas hacia saltar de ano.
  const hoy = new Date()
  const saltos = (fecha.getFullYear() * 12 + fecha.getMonth()) - (hoy.getFullYear() * 12 + hoy.getMonth())

  for (let i = 0; i < saltos; i++) {
    await page.locator('.card button').nth(1).click()   // flecha "mes siguiente"
    await page.waitForTimeout(150)
  }

  const dia = page.getByRole('button', { name: String(fecha.getDate()), exact: true }).first()
  await expect(dia, `el dia ${fecha.toDateString()} deberia poder elegirse`).toBeEnabled()
  await dia.click()
}

// Por debajo de 1024 px (el breakpoint `lg` de Tailwind) la barra lateral del
// panel esta desplazada fuera de pantalla y solo se abre con el boton de menu.
// Ojo: Playwright considera "visible" un elemento desplazado con transform,
// porque sigue teniendo caja, asi que no sirve preguntar por isVisible(): hay
// que mirar el ancho del viewport.
export const esPantallaEstrecha = (page) => (page.viewportSize()?.width ?? 1280) < 1024

export const abrirMenuAdminSiHaceFalta = async (page) => {
  if (!esPantallaEstrecha(page)) return
  const barra = page.locator('aside')
  const yaAbierta = await barra.evaluate(el => !el.className.includes('-translate-x-full')).catch(() => false)
  if (yaAbierta) return
  await page.locator('header button').first().click()
  await expect(barra).not.toHaveClass(/-translate-x-full/, { timeout: 5000 })
}

// Navega por el panel funcionando igual en escritorio y en movil.
export const irAPantallaAdmin = async (page, nombreEnlace) => {
  await abrirMenuAdminSiHaceFalta(page)
  await page.getByRole('link', { name: nombreEnlace }).click()
}

export const cerrarSesion = async (page) => {
  // En el panel el boton vive dentro de la barra lateral; en el portal del
  // cliente esta siempre en la cabecera.
  if (await page.locator('aside').count()) await abrirMenuAdminSiHaceFalta(page)
  await page.getByRole('button', { name: /cerrar sesión|salir/i }).first().click()
  await expect(page).toHaveURL(/\/login/, { timeout: 10_000 })
}

// Texto del toast de react-hot-toast, que es donde acaban todos los mensajes
// de error y confirmacion de la aplicacion.
export const toast = (page) => page.locator('[class*="go"]').filter({ hasText: /\S/ })

export const esperarToast = async (page, patron, { timeout = 12_000 } = {}) => {
  await expect(page.getByText(patron).first()).toBeVisible({ timeout })
}
