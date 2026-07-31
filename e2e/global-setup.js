import { chromium } from '@playwright/test'
import { ADMIN } from './helpers/datos.js'
import fs from 'fs'
import path from 'path'

// Entra como administrador UNA sola vez y guarda la sesion en disco.
//
// Es necesario, no una optimizacion: /auth/login tiene un limite de 5 intentos
// cada 15 minutos por IP, y todas las pruebas salen de la misma IP. Sin esto,
// a partir del sexto login la suite empieza a fallar por el limitador y no por
// la aplicacion.
export default async () => {
  const BASE = process.env.E2E_BASE_URL || 'http://localhost:8080'
  const destino = path.join(process.cwd(), 'estado-admin.json')

  const navegador = await chromium.launch()
  const pagina = await navegador.newPage({ baseURL: BASE })

  await pagina.goto('/login')
  await pagina.locator('input[type="email"]').fill(ADMIN.email)
  await pagina.locator('input[type="password"]').fill(ADMIN.password)
  await pagina.getByRole('button', { name: /continuar/i }).click()
  await pagina.waitForURL(/\/admin/, { timeout: 20_000 })

  await pagina.context().storageState({ path: destino })
  await navegador.close()

  if (!fs.existsSync(destino)) throw new Error('no se pudo guardar la sesion de administrador')
  console.log('  sesion de administrador guardada en estado-admin.json')
}
