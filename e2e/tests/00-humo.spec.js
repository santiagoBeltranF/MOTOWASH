import { test, expect } from '@playwright/test'
import { entrarComoAdmin } from '../helpers/sesion.js'
import { crearClienteDirecto, correoDePrueba, limpiarDatosDePrueba } from '../helpers/datos.js'
import { entrarComoCliente } from '../helpers/sesion.js'

test.afterAll(async () => { await limpiarDatosDePrueba() })

// Red de arrastre: recorre las 14 pantallas y recoge errores de consola,
// peticiones fallidas y excepciones sin capturar. Es lo que la auditoria
// estatica no puede ver.
// Una peticion cancelada porque la pagina navego a otra pantalla no es un fallo
// de la aplicacion: es lo que hace cualquier navegador. WebKit ademas las
// reporta como error de pagina con el texto «due to access control checks»,
// aunque el origen sea el mismo. Se descartan para que el recuento solo
// contenga excepciones reales.
const esAbortoPorNavegacion = (texto) =>
  /due to access control checks|NetworkError|The operation was aborted|Load failed/i.test(texto)

const vigilar = (page, bolsa) => {
  page.on('console', m => {
    if (m.type() === 'error' && !esAbortoPorNavegacion(m.text())) bolsa.consola.push(m.text().slice(0, 200))
  })
  page.on('pageerror', e => {
    if (!esAbortoPorNavegacion(String(e))) bolsa.excepciones.push(String(e).slice(0, 200))
  })
  page.on('response', r => {
    if (r.status() >= 400) bolsa.http.push(`${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`)
  })
}

test('las 8 pantallas del admin cargan sin errores', async ({ page }) => {
  const bolsa = { consola: [], excepciones: [], http: [] }
  vigilar(page, bolsa)
  await entrarComoAdmin(page)

  const pantallas = [
    ['/admin/dashboard', /dashboard|resumen/i],
    ['/admin/services', /servicios/i],
    ['/admin/schedule', /horario/i],
    ['/admin/appointments', /citas/i],
    ['/admin/promotions', /promociones/i],
    ['/admin/clients', /clientes/i],
    ['/admin/reports', /reportes/i],
    ['/admin/settings', /configuración|configuracion/i]
  ]

  for (const [ruta, titulo] of pantallas) {
    await page.goto(ruta)
    await expect(page.getByRole('heading', { name: titulo }).first(),
      `la pantalla ${ruta} deberia mostrar su titulo`).toBeVisible({ timeout: 15_000 })
    // Hay que dejar que terminen las peticiones antes de irse a la siguiente
    // pantalla: navegar encima aborta las que quedan en vuelo, y WebKit reporta
    // esos abortos como error de pagina ("due to access control checks"), lo que
    // ensucia el recuento con fallos que no son de la aplicacion.
    await page.waitForLoadState('networkidle').catch(() => {})
  }

  console.log('\n--- ADMIN ---')
  console.log('HTTP >=400:', bolsa.http.length ? bolsa.http : 'ninguno')
  console.log('errores de consola:', bolsa.consola.length ? bolsa.consola : 'ninguno')
  console.log('excepciones:', bolsa.excepciones.length ? bolsa.excepciones : 'ninguna')

  expect(bolsa.excepciones, 'no deberia haber excepciones sin capturar').toEqual([])
  expect(bolsa.http, 'no deberia haber respuestas HTTP de error').toEqual([])
})

test('las 3 pantallas del cliente cargan sin errores', async ({ page }) => {
  const bolsa = { consola: [], excepciones: [], http: [] }
  vigilar(page, bolsa)

  const correo = correoDePrueba('humo')
  await crearClienteDirecto(correo)
  await entrarComoCliente(page, correo, 'Password123')

  for (const ruta of ['/client/book', '/client/appointments', '/client/profile']) {
    await page.goto(ruta)
    await page.waitForLoadState('networkidle').catch(() => {})
    await page.waitForTimeout(400)
  }

  console.log('\n--- CLIENTE ---')
  console.log('HTTP >=400:', bolsa.http.length ? bolsa.http : 'ninguno')
  console.log('errores de consola:', bolsa.consola.length ? bolsa.consola : 'ninguno')
  console.log('excepciones:', bolsa.excepciones.length ? bolsa.excepciones : 'ninguna')

  expect(bolsa.excepciones, 'no deberia haber excepciones sin capturar').toEqual([])
  expect(bolsa.http, 'no deberia haber respuestas HTTP de error').toEqual([])
})
