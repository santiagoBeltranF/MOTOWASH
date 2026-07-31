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

## Qué corre en cuántos navegadores

No todo necesita cinco motores. La regla:

| Etiqueta | Dónde corre | Qué va aquí |
|---|---|---|
| `@ui` | Los 5 navegadores | Interfaz y lo que depende del motor: carga de pantallas, recorridos completos, paginación, sesión y navegación, formularios por etiqueta, móvil |
| *(sin etiqueta)* | **Solo Chromium** | Lógica de negocio: cobros, arqueo, validaciones, permisos por rol, concurrencia, precios |

Un cobro mixto que no cuadra se comporta igual en WebKit que en Chromium: repetirlo cinco
veces multiplica el coste sin encontrar nada. En cambio **E8 solo se reproducía en Firefox
y WebKit** —y de forma intermitente—, así que los recorridos de interfaz sí se repiten.

Chromium ejecuta **todo**; los otros cuatro proyectos llevan `grep: /@ui/`.

Para etiquetar una prueba basta con el prefijo en el nombre:

```js
test('@ui recargar a mitad del 2FA', async ({ page }) => { … })
```

## Cómo ejecutarla

**Durante el desarrollo, solo Chromium.** La pasada de cinco navegadores se hace **una vez
al cerrar cada bloque**, no en cada iteración.

```bash
npm test -- --project=chromium   # desarrollo: ~2 min
npm test                         # cierre de bloque: los 5 navegadores
npm test -- --repeat-each=8      # cazar fallos intermitentes
```

⚠️ **No lances dos ejecuciones a la vez.** Comparten la misma base de datos y se pisan
entre sí: aparecen fallos que no son de la aplicación.

**Un solo worker.** Comparten una misma base de datos; en paralelo se pisarían las citas
y los ajustes.

**Diferencias de tamaño de pantalla.** Por debajo de 1024 px la barra lateral del panel
está oculta y hay que abrirla con el botón de menú: para eso está `irAPantallaAdmin()`, que
funciona igual en escritorio y en móvil. Y en el portal del cliente el nombre de la
cabecera es `hidden sm:block`, así que por debajo de 640 px no se pinta a propósito — las
comprobaciones que dependen de él van condicionadas al ancho.

**Sin reintentos.** Aquí se buscan fallos: un reintento que pasa esconde justo la
inestabilidad que interesa ver.

**Selectores.** No se usa `getByLabel` porque en esta aplicación los `<label>` no están
asociados a sus `<input>` (falta `htmlFor`/`id`) — es uno de los hallazgos. Se selecciona
por tipo de campo o por posición dentro del modal.

**Limpieza.** Los datos de prueba usan el dominio `@prueba.local` y el prefijo `[E2E]`, y
se borran al terminar cada archivo. `restaurarConfiguracion()` devuelve horarios y
`max_appointments_per_slot` a sus valores por defecto.
