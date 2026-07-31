import { defineConfig, devices } from '@playwright/test'

// La aplicacion se sirve por nginx en 8080, que es el mismo origen desde el que
// el navegador pide /api. Apuntar a otro sitio (por ejemplo al backend directo
// en 3000) no serviria: no hay frontend ahi.
const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8080'

export default defineConfig({
  testDir: './tests',
  globalSetup: './global-setup.js',
  outputDir: './resultados',

  // Estas pruebas comparten una sola base de datos: si corren en paralelo se
  // pisan las citas y los ajustes. Un solo worker, en orden.
  fullyParallel: false,
  workers: 1,

  // Nada de reintentos: aqui se busca detectar fallos, y un reintento que pasa
  // esconde precisamente la inestabilidad que interesa ver.
  retries: 0,

  timeout: 45_000,
  expect: { timeout: 10_000 },

  reporter: [
    ['list'],
    ['html', { outputFolder: './informe', open: 'never' }]
  ],

  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10_000,
    locale: 'es-CO',
    timezoneId: 'America/Bogota'
  },

  // Solo lo etiquetado @ui se ejecuta en los cuatro navegadores extra. La
  // lógica de negocio —cobros, arqueo, validaciones, permisos por rol— no
  // depende del motor del navegador: repetirla cinco veces multiplica el coste
  // sin encontrar nada. Chromium sigue ejecutándolo TODO.
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', grep: /@ui/, use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', grep: /@ui/, use: { ...devices['Desktop Safari'] } },

    // Movil de verdad, no una ventana estrecha: los perfiles de dispositivo
    // traen ademas user agent tactil, escala y `hasTouch`, y eso cambia como se
    // comportan los controles. Importa porque el menu del cliente es una barra
    // inferior de aspecto movil que hasta ahora solo se habia visto a 1280 px.
    { name: 'movil-android', grep: /@ui/, use: { ...devices['Pixel 7'] } },
    { name: 'movil-ios', grep: /@ui/, use: { ...devices['iPhone 14'] } }
  ]
})
