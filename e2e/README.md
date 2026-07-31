# Pruebas end-to-end

Recorren la aplicación con un navegador real (Playwright + Chromium) contra el entorno de
Docker Compose. Es lo que destapó los hallazgos de la Fase 4: ninguno de ellos aparece
leyendo el código ni llamando al API endpoint por endpoint.

## Requisitos

El buzón de correo desechable es **obligatorio**: el registro y el 2FA mandan un código
por correo, y las pruebas lo leen de ahí.

```bash
# desde la raíz del proyecto
docker compose -f docker-compose.yml -f docker-compose.test.yml up -d --build
```

Eso añade un contenedor `mailpit` y apunta el backend hacia él. La bandeja se puede mirar
en http://localhost:8025.

## Ejecutar

```bash
cd e2e
npm install
npx playwright install chromium   # solo la primera vez

npm test              # todo
npm run test:headed   # viendo el navegador
npm run test:ui       # modo interactivo
npm run report        # abre el informe HTML de la última ejecución
```

## Qué hay

| Archivo | Cubre |
|---|---|
| `tests/00-humo.spec.js` | Las 11 pantallas cargan; recoge errores de consola, excepciones y respuestas HTTP ≥400 |
| `tests/01-cliente.spec.js` | Recorrido completo: registro → 2FA → agendar → consultar → reagendar → cancelar → perfil |
| `tests/02-admin.spec.js` | Panel: las 4 pantallas de C7, servicios, promociones, horarios y ajustes |
| `tests/03-errores.spec.js` | Caminos de error desde la interfaz: entradas inválidas, doble clic, sesión expirada, botón atrás, recarga a mitad del 2FA |

## Detalles que conviene conocer

**Sesión reutilizada.** `global-setup.js` entra como administrador una sola vez y guarda
la sesión en `estado-admin.json`. No es una optimización: `/auth/login` admite 5 intentos
cada 15 minutos por IP, y todas las pruebas salen de la misma. Sin esto, a partir del
sexto login la suite falla por el limitador y no por la aplicación.

**Un solo worker.** Comparten una misma base de datos; en paralelo se pisarían las citas
y los ajustes.

**Sin reintentos.** Aquí se buscan fallos: un reintento que pasa esconde justo la
inestabilidad que interesa ver.

**Selectores.** No se usa `getByLabel` porque en esta aplicación los `<label>` no están
asociados a sus `<input>` (falta `htmlFor`/`id`) — es uno de los hallazgos. Se selecciona
por tipo de campo o por posición dentro del modal.

**Limpieza.** Los datos de prueba usan el dominio `@prueba.local` y el prefijo `[E2E]`, y
se borran al terminar cada archivo. `restaurarConfiguracion()` devuelve horarios y
`max_appointments_per_slot` a sus valores por defecto.
