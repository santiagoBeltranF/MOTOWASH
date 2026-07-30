# Auditoría de seguridad y robustez — MotoWash

Realizada el **2026-07-30** sobre el commit `95ffea2` (estado inicial del proyecto).
1.290 líneas de backend, 21 archivos de frontend.

**23 hallazgos:** 6 críticos, 8 importantes, 9 menores.

| Estado | Significado |
|---|---|
| `- [x]` | Corregido y verificado |
| `- [ ]` | Pendiente |
| 🔵 | Decisión consciente de no corregir (queda documentado) |

Los identificadores C/I/M son estables: no se reutilizan aunque se cierren.

---

## 🔴 Críticos

- [ ] **C1 — El admin por defecto no puede iniciar sesión**
  `backend/src/config/database.sql`
  El hash original era un valor de ejemplo copiado de un tutorial y no correspondía a
  `Admin123!` ni a ninguna contraseña conocida (verificado con `bcrypt.compareSync`
  contra 8 candidatos). Nadie podía entrar en una instalación limpia.
  *Parcial:* en la Fase 2 se reemplazó por un hash real y se desactivó el 2FA de ese
  usuario semilla, lo justo para poder verificar el login. **Queda pendiente** sacar la
  credencial del repositorio: script de arranque idempotente que lea `ADMIN_EMAIL` y
  `ADMIN_PASSWORD` del entorno y haga el hash en runtime. → *Bloque C*

- [ ] **C2 — Credenciales vivas en disco**
  `backend/.env`
  App Password de Gmail en texto plano y `JWT_SECRET` con el valor de ejemplo
  (`motowash_super_secret_key_cambiar_en_produccion`). Quien conozca ese secreto puede
  firmar un token `{id:1, role:'admin'}` y saltarse login y 2FA por completo
  (`middleware/auth.js:11` confía en la firma sin más).
  Nunca llegó al historial de git (el repo se creó después), pero el proyecto vive en
  `OneDrive`, así que la credencial se replicó a la nube de Microsoft.
  *Estado:* el usuario reporta haber revocado la App Password en Google y rotado el
  secreto. **Pendiente:** limpiar los valores muertos que siguen en el archivo.

- [ ] **C3 — `express-validator` es inerte**
  `backend/src/routes/index.js:19-23`
  Los validadores están declarados en `/auth/register`, pero **`validationResult` no se
  invoca en ningún archivo del proyecto**. Sin leer el resultado, los errores se anotan
  en la request y el controlador sigue igual. No hay ninguna ruta validada en todo el
  backend, ni siquiera la que lo aparenta. → *Bloque C*

- [ ] **C4 — Sin límite de tasa en los endpoints que envían correo**
  `backend/src/routes/index.js:14-24`
  `loginLimiter` solo cubre `/auth/login`. Quedan abiertos `/auth/register` (cada POST
  dispara un correo a una dirección arbitraria → bomba de correo con tu dominio como
  remitente, y Gmail acaba suspendiendo la cuenta), `/auth/verify-2fa` y
  `/auth/verify-register` (fuerza bruta del código de 6 dígitos). → *Bloque A*

- [ ] **C5 — Condición de carrera al reservar cupo**
  `backend/src/controllers/appointmentController.js:131-157`
  Patrón consultar-decidir-insertar sin transacción ni bloqueo: dos peticiones
  simultáneas leen el mismo conteo y ambas insertan, superando
  `max_appointments_per_slot`. No hay `UNIQUE` en `appointments` que lo ataje en la base.
  El helper `transaction()` de `config/db.js:28` está correctamente implementado y **no
  lo usa nadie**. Mismo patrón en `rescheduleAppointment` (`:308-323`) y en el chequeo de
  cita pendiente activa (`:110-118`). → *Bloque B*

- [ ] **C6 — Código 2FA con `Math.random()` y sin contador de intentos**
  `backend/src/controllers/authController.js:10`
  `Math.random()` no es criptográficamente seguro: V8 usa xorshift128+ y observando
  salidas sucesivas se puede reconstruir el estado interno y predecir códigos futuros.
  Sin contador de intentos (ver C4), un código de 6 dígitos con ventana de 10 minutos es
  fuerza bruta viable — el atacante ya tiene el `tempToken` porque él inició el flujo.
  → *Bloque A*

---

## 🟠 Importantes

- [x] **I1 — `testConnection()` mataba el proceso** ✅ *Fase 2*
  `backend/src/config/db.js`
  `process.exit(1)` al primer fallo. En Compose el healthcheck de MySQL pasa cuando el
  demonio responde, pero el servidor sigue ejecutando los scripts de
  `/docker-entrypoint-initdb.d` y rechaza conexiones: el backend moría en cada arranque
  en frío.
  *Corregido:* 30 reintentos cada 2 s; si se agotan, lanza el error y `server.js` aborta.
  *Verificado:* con la BD apagada el backend registra `⏳ MySQL aun no responde
  (intento 1/30)` y reconecta solo al volver la base.

- [ ] **I2 — Desfase de zonas horarias** (parcialmente corregido)
  El negocio está en Armenia, Quindío (UTC−5, sin horario de verano).
  *Corregido en Fase 2:* `TZ=America/Bogota` explícito en los tres contenedores, con
  `tzdata` instalado en las imágenes Alpine (sin ese paquete la variable se ignora en
  silencio). Con eso `NOW()` de MySQL y el parseo de `new Date("...T...")` en Node ya
  operan en hora local, lo que arregla el cron de promociones y las validaciones de
  horario de las citas.
  **Pendiente:** el pool sigue declarando `timezone: '+00:00'` (`config/db.js:14`), así
  que los dos sitios que pasan un objeto `Date` como parámetro siguen desfasados 5 horas:
  `serviceController.js:14-17` y `appointmentController.js:138-141`.
  *Demostrado:* con una promoción de ventana 10:00–12:00 siendo las 10:52,
  `/promotions/active` la ve activa y `/services` no la ve. → *Bloque A*

- [ ] **I3 — Winston escribe a archivos dentro del contenedor**
  `backend/src/utils/logger.js:24-34`
  Dos `File` transports a `logs/`. En Docker eso engorda la capa de escritura, se pierde
  al recrear el contenedor y esconde los logs de `docker compose logs`. Además
  `format.colorize()` inyecta códigos ANSI cuando no hay TTY.
  *Parche temporal en Fase 2:* el Dockerfile crea `logs/` con `chown node` para que el
  transport no aborte con EACCES bajo el usuario no-root. → *Bloque A*

- [x] **I4 — `trust proxy` ausente** ✅ *Fase 2*
  `backend/src/server.js`
  Detrás de nginx el backend veía la IP del proxy en todas las peticiones, y el límite de
  5 intentos de login pasaba a aplicarse **globalmente a todos los usuarios juntos**.
  *Corregido:* `app.set('trust proxy', TRUST_PROXY_HOPS)` con el número de saltos reales
  (1 = solo nginx), no `true`, que permitiría falsear la IP inyectando `X-Forwarded-For`.
  *Verificado:* 5 intentos → 429 al sexto; con `X-Forwarded-For` falseado sigue en 429.

- [ ] **I5 — Estado de autenticación en memoria del proceso**
  `backend/src/controllers/authController.js:8` y `:59`
  `tempTokens` y `pendingRegistrations` son `Map` en memoria. (a) Nunca se purgan las
  entradas expiradas — solo se borran en el camino feliz, así que crecen sin límite con
  cada login abandonado. (b) Al reiniciar se pierden los 2FA y registros en vuelo.
  (c) Con varias réplicas, la verificación puede llegar a un proceso que no tiene el token.
  → *Bloque A: solo la purga (a). Lo de réplicas queda documentado, no se resuelve ahora.*

- [ ] **I6 — `rescheduleAppointment` no valida horario de negocio ni fechas pasadas**
  `backend/src/controllers/appointmentController.js:280-326`
  Verifica permisos, estado, margen de 30 minutos y cupo, pero nunca comprueba que la
  nueva fecha/hora esté en el futuro, sea día laborable, ni caiga dentro de
  `schedule_config`. Se puede reagendar a las 03:00 de un domingo o a una fecha pasada.
  `createAppointment` tiene el mismo hueco: confía en que el frontend solo ofrece slots
  válidos. → *Bloque B*

- [ ] 🔵 **I7 — `node-cron` corre dentro del proceso de Express**
  `backend/src/server.js:44`
  Con una réplica está bien. Con `--scale backend=N` el job corre N veces cada 5 minutos.
  El `UPDATE` es idempotente, así que no corrompe datos, pero multiplica escrituras y logs.
  *Decisión:* no se corrige. Queda documentado en el README. La salida sería extraerlo a
  un servicio propio o tomar un lock en base.

- [ ] **I8 — `JWT_EXPIRES_IN` se ignora**
  `backend/src/controllers/authController.js:31` y `:53`
  El `.env` define `JWT_EXPIRES_IN=7d`, pero el código codifica `{ expiresIn: '30d' }`.
  La variable de entorno no tiene ningún efecto: la configuración miente. 30 días es
  mucho para un token sin revocación posible (no hay lista negra). → *Bloque A*

---

## 🟡 Menores

- [ ] **M1 — `console.log` de depuración en producción**
  `backend/src/controllers/appointmentController.js:71-79` — cinco `console.log` que se
  ejecutan en cada consulta de slots, saltándose winston e imprimiendo las citas.
  → *Bloque A*

- [x] **M2 — El health check no cuelga de `/api`** ✅ *Fase 2 (documentación)*
  Está en `/health` (`server.js:34`), pero `DEPLOY.md` y el README afirmaban que
  `/api/health` responde: daba 404. Corregido en la documentación y contemplado en
  `nginx.conf`, que hace proxy de ambas rutas.

- [x] **M3 — El README describía una estructura inexistente** ✅ *Fase 2*
  Listaba `backend/src/models/`, `frontend/src/hooks/`, `frontend/src/components/`,
  `frontend/public/` y `backend/src/config/seed.sql`, ninguno de los cuales existe.
  También citaba `node-otp / speakeasy` como dependencia de 2FA, que no está en
  `package.json` ni se usa (el 2FA es por correo). Reescrito en la Fase 2.

- [ ] **M4 — Sin tope en la paginación**
  `getAppointments` (`:175`), `getClients` (`settingsController.js:43`) y
  `getClientsReport` (`reportController.js:61`) aceptan `?limit=999999`. → *Bloque A*

- [ ] **M5 — `sendWelcomeEmail` se importa y nunca se llama**
  `backend/src/controllers/authController.js:5` — el correo de bienvenida no se envía
  jamás. Decidir: usarlo tras verificar el registro, o borrarlo. → *Bloque A*

- [ ] **M6 — El código 2FA se guarda en claro**
  `users.two_fa_code` — quien lea la base puede iniciar sesión como cualquiera durante la
  ventana de 10 minutos. → *Bloque C*

- [ ] **M7 — Enumeración de usuarios por temporización**
  `backend/src/controllers/authController.js:15-18` — si el correo no existe,
  `bcrypt.compare` no llega a ejecutarse y la respuesta vuelve notablemente más rápido.
  El mensaje de error sí es genérico, que está bien.

- [ ] **M8 — Falta índice compuesto**
  `appointments(appointment_date, start_time)` — la consulta de cupos (`:132`) filtra por
  ambas columnas y solo hay índice sobre `appointment_date`. → *Bloque A*

- [ ] **M9 — Query param `date` sin validar**
  `backend/src/controllers/appointmentController.js:43` — `new Date(date + 'T00:00:00')`
  a partir de un parámetro sin validar; con `?date=basura` produce `Invalid Date` y
  `getDay()` devuelve `NaN`, que acaba en una consulta SQL. → *Bloque A*

---

## Resumen

| | Total | Corregidos | Pendientes |
|---|---|---|---|
| 🔴 Críticos | 6 | 0 | 6 |
| 🟠 Importantes | 8 | 2 | 6 |
| 🟡 Menores | 9 | 2 | 7 |
| **Total** | **23** | **4** | **19** |

*(1 de los pendientes, I7, es decisión consciente de no corregir.)*

### Plan de la Fase 3

- **Bloque A** — internas, sin tocar el contrato de la API: C6, C4, I2, I3, I5a, I8, M1, M4, M8, M9, M5
- **Bloque B** — integridad de datos: C5, I6
- **Bloque C** — requieren coordinar con el frontend: C3, C1, M6
