# Auditoría de seguridad y robustez — MotoWash

Realizada el **2026-07-30** sobre el commit `95ffea2` (estado inicial del proyecto).
1.290 líneas de backend, 21 archivos de frontend.

**24 hallazgos:** 7 críticos, 8 importantes, 9 menores.
*(C7 no salió de la lectura del código sino de probar el Bloque A: la auditoría original
no lo detectó.)*

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

- [x] **C4 — Sin límite de tasa en los endpoints que envían correo** ✅ *Bloque A*
  `backend/src/routes/index.js`
  `loginLimiter` solo cubría `/auth/login`. Quedaban abiertos `/auth/register` (cada POST
  dispara un correo a una dirección arbitraria → bomba de correo con tu dominio como
  remitente, y Gmail acaba suspendiendo la cuenta), `/auth/verify-2fa` y
  `/auth/verify-register` (fuerza bruta del código de 6 dígitos).
  *Corregido:* `registerLimiter` (5/hora) y `verifyLimiter` (15/15 min), más un contador
  de intentos **por código** en `authController` (`MAX_INTENTOS_CODIGO = 5`): al quinto
  fallo se invalida el código en la base y se descarta el token temporal.
  *Verificado* end-to-end con un servidor SMTP desechable: los mensajes van contando
  «quedan 4 / 3 / 2 intentos», «queda 1 intento», y el quinto responde «Demasiados
  intentos fallidos»; el sexto ya no encuentra el registro pendiente.

- [x] **C5 — Condición de carrera al reservar cupo** ✅ *Bloque B*
  `backend/src/controllers/appointmentController.js`
  Patrón consultar-decidir-insertar sin transacción ni bloqueo: dos peticiones
  simultáneas leían el mismo conteo y ambas insertaban, superando
  `max_appointments_per_slot`. El helper `transaction()` de `config/db.js` estaba bien
  implementado y no lo usaba nadie.
  *Corregido:* `createAppointment` y `rescheduleAppointment` envuelven la comprobación de
  cupo y la escritura en una transacción que abre con
  `SELECT ... FROM settings WHERE key_name='max_appointments_per_slot' FOR UPDATE`.
  El chequeo de cita pendiente activa entra también en el cerrojo.
  Se bloquea **una fila que existe**, no el rango `(fecha, hora)`, y es deliberado: un
  `FOR UPDATE` sobre el rango tomaría *gap locks*, que son compatibles entre sí, y las
  dos transacciones acabarían en **interbloqueo** al intentar insertar. El coste es que
  las reservas se serializan globalmente; con transacciones de cuatro consultas cortas es
  irrelevante para este negocio. La evolución natural, si algún día hiciera falta, es una
  tabla de franjas con una fila por `(fecha, hora)` y bloquear esa.
  *Demostrado empíricamente*, 30 rondas de 5 peticiones simultáneas con
  `max_appointments_per_slot=1`, precalentando los sockets para que las peticiones
  llegaran juntas de verdad:

  | | rondas que exceden el límite | máx. citas en una franja de 1 |
  |---|---|---|
  | Código anterior | **30/30** | **5** |
  | Código nuevo | **0/30** | 1 |

  Sin precalentar la conexión el bug no se reproducía: la ventana es de 1–2 ms y el coste
  de abrir el socket bastaba para escalonar las peticiones. Es justo lo que hace peligroso
  este tipo de fallo — no aparece en pruebas manuales.

- [x] **C6 — Código 2FA con `Math.random()` y sin contador de intentos** ✅ *Bloque A*
  `backend/src/controllers/authController.js`
  `Math.random()` no es criptográficamente seguro: V8 usa xorshift128+ y observando
  salidas sucesivas se puede reconstruir el estado interno y predecir códigos futuros.
  *Corregido:* `crypto.randomInt(100000, 1000000)`. El contador de intentos va en C4.
  *Verificado:* 20.000 códigos generados, todos de 6 dígitos, rango 100018–999993,
  19.786 valores distintos. Código real recibido por correo en la prueba: `561647`.

- [x] **C7 — Los cuatro endpoints paginados devolvían 500** ✅ *Bloque A*
  `appointmentController`, `settingsController`, `reportController` (×2)
  **Hallazgo nuevo, no estaba en la auditoría original.** `config/db.js` usa
  `pool.execute()`, es decir sentencias preparadas, y el protocolo de preparadas de
  MySQL 8 rechaza un `Number` como parámetro de `LIMIT`: devuelve *Incorrect arguments to
  mysqld_stmt_execute*. El código hacía `params.push(parseInt(limit), parseInt(offset))`,
  que produce justo un `Number`.
  Efecto: `/api/appointments`, `/api/clients`, `/api/reports/clients` y
  `/api/reports/appointments` respondían **500 siempre**. En el panel eso deja rotas las
  pantallas de Citas, Clientes y los dos informes, y «Mis Citas» del cliente.
  Es preexistente: se comprobó con `git show HEAD:` que el código anterior hacía lo mismo.
  **Es específico de MySQL 8+**, verificado sobre cinco motores con el mismo `mysql2 3.22.4`:

  | Motor | `execute` + Number |
  |---|---|
  | MySQL 5.7.44 | ✅ OK |
  | MySQL 8.0.46 | ❌ Incorrect arguments |
  | MySQL 8.4.11 | ❌ Incorrect arguments |
  | MariaDB 10.11.18 | ✅ OK |
  | MariaDB 11.4.12 | ✅ OK |

  La causa: mysql2 codifica todo `Number` de JS como `MYSQL_TYPE_DOUBLE`
  (`lib/packets/execute.js`), MySQL 8 endureció la validación de tipos para `LIMIT` y lo
  rechaza; MySQL 5.7 y MariaDB lo convertían a entero en silencio. Por eso las pantallas
  afectadas **funcionaban en el entorno local** —desarrollado contra la MariaDB 10.4 de
  XAMPP— y solo se rompieron al contenerizar con `mysql:8.0`. La Fase 2 no introdujo el
  bug: lo destapó.
  *Corregido:* helper `sqlLimitOffset()` que interpola los enteros ya validados por
  `parsePaginacion` (1–100), sin superficie de inyección. El resto de parámetros siguen
  con placeholders.
  *Verificado:* los cuatro pasan de 500 a 200.

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

- [x] **I2 — Desfase de zonas horarias** ✅ *Fase 2 + Bloque A*
  El negocio está en Armenia, Quindío (UTC−5, sin horario de verano).
  *Corregido en Fase 2:* `TZ=America/Bogota` explícito en los tres contenedores, con
  `tzdata` instalado en las imágenes Alpine (sin ese paquete la variable se ignora en
  silencio). Con eso `NOW()` de MySQL y el parseo de `new Date("...T...")` en Node ya
  operan en hora local, lo que arregla el cron de promociones y las validaciones de
  horario de las citas.
  *Corregido en Bloque A:* el pool pasa de `timezone: '+00:00'` a `'local'`, y los dos
  sitios que pasaban un objeto `Date` como parámetro (`serviceController` y
  `appointmentController`) ahora comparan con `NOW()` de MySQL, igual que
  `/promotions/active`. Los tres usan el mismo criterio.
  *Verificado con el caso que lo destapó:* promoción de ventana 11:00–12:00 consultada a
  las 11:29. Antes `/promotions/active` la veía activa y `/services` devolvía `null`;
  ahora los tres sitios coinciden y el descuento se aplica.
  ⚠️ El patrón `fecha.split('T')[0]` que usa el frontend funciona porque la medianoche
  local de UTC−5 cae el mismo día en UTC. En una zona con offset **positivo** fallaría.

- [x] **I3 — Winston escribe a archivos dentro del contenedor** ✅ *Bloque A*
  `backend/src/utils/logger.js`
  Dos `File` transports a `logs/`. En Docker eso engorda la capa de escritura, se pierde
  al recrear el contenedor y esconde los logs de `docker compose logs`. Además
  `format.colorize()` inyectaba códigos ANSI aunque no hubiera TTY.
  *Corregido:* los transports de archivo solo se activan con `NODE_ENV !== 'production'`,
  y `colorize()` solo si `process.stdout.isTTY`. Con eso sobra el parche del
  `mkdir logs && chown` que la Fase 2 había puesto en el Dockerfile, y se ha quitado.
  *Verificado:* los logs pasan de `[[32minfo[39m]` a `[info]` limpio.

- [x] **I4 — `trust proxy` ausente** ✅ *Fase 2*
  `backend/src/server.js`
  Detrás de nginx el backend veía la IP del proxy en todas las peticiones, y el límite de
  5 intentos de login pasaba a aplicarse **globalmente a todos los usuarios juntos**.
  *Corregido:* `app.set('trust proxy', TRUST_PROXY_HOPS)` con el número de saltos reales
  (1 = solo nginx), no `true`, que permitiría falsear la IP inyectando `X-Forwarded-For`.
  *Verificado:* 5 intentos → 429 al sexto; con `X-Forwarded-For` falseado sigue en 429.

- [x] **I5 — Estado de autenticación en memoria del proceso** ✅ *Bloque A (alcance acordado)*
  `backend/src/controllers/authController.js`
  `tempTokens` y `pendingRegistrations` son `Map` en memoria. (a) Nunca se purgaban las
  entradas expiradas — solo se borran en el camino feliz, así que crecían sin límite con
  cada login abandonado. (b) Al reiniciar se pierden los 2FA y registros en vuelo.
  (c) Con varias réplicas, la verificación puede llegar a un proceso que no tiene el token.
  *Corregido (a):* barrido con `setInterval` cada 5 minutos, con `.unref()` para no
  mantener vivo el proceso al apagarse.
  🔵 **(b) y (c) siguen abiertos por decisión:** son inherentes a guardar el estado en
  memoria. Resolverlos exige moverlo a la base o a Redis. Documentado en el README.

- [x] **I6 — No se validaba el horario de negocio en el servidor** ✅ *Bloque B*
  `backend/src/controllers/appointmentController.js`
  `rescheduleAppointment` verificaba permisos, estado, margen de 30 minutos y cupo, pero
  nunca que la nueva fecha/hora estuviera en el futuro, fuera día laborable ni cayera
  dentro de `schedule_config`. `createAppointment` tenía el mismo hueco: confiaba en que
  el frontend solo ofreciera franjas válidas.
  *Corregido:* helper `validarFranjaNegocio()` aplicado en ambos, que comprueba formato,
  que la franja esté en el futuro, que el día esté abierto, y que el servicio **quepa
  entero** antes del cierre (no solo que empiece antes).
  *Verificado* en los dos endpoints:

  | Caso | Respuesta |
  |---|---|
  | Fecha pasada | 400 «No puedes agendar en una fecha u hora que ya pasó» |
  | Domingo | 400 «El negocio no abre ese día» |
  | Lunes 07:00 | 400 «El negocio abre a las 08:00 ese día» |
  | Sábado 15:00 (cierra 14:00) | 400 «…no alcanza a terminar antes del cierre (14:00)» |
  | Lunes 16:00 con servicio de 180 min | 400 «…no alcanza a terminar antes del cierre (18:00)» |
  | Hora con basura | 400 «Hora con formato inválido» |
  | Lunes 10:00 con servicio de 60 min | 201 creada |

- [ ] 🔵 **I7 — `node-cron` corre dentro del proceso de Express**
  `backend/src/server.js:44`
  Con una réplica está bien. Con `--scale backend=N` el job corre N veces cada 5 minutos.
  El `UPDATE` es idempotente, así que no corrompe datos, pero multiplica escrituras y logs.
  *Decisión:* no se corrige. Queda documentado en el README. La salida sería extraerlo a
  un servicio propio o tomar un lock en base.

- [x] **I8 — `JWT_EXPIRES_IN` se ignora** ✅ *Bloque A*
  `backend/src/controllers/authController.js`
  El `.env` definía `JWT_EXPIRES_IN=7d`, pero el código codificaba `{ expiresIn: '30d' }`
  en dos sitios. La variable de entorno no tenía ningún efecto: la configuración mentía.
  *Corregido:* helper `firmarToken()` como único punto donde se decide la vigencia, que
  lee `process.env.JWT_EXPIRES_IN` con `'7d'` por defecto.
  *Verificado:* decodificando el token, `exp - iat` = 7 días (antes 30).

---

## 🟡 Menores

- [x] **M1 — `console.log` de depuración en producción** ✅ *Bloque A*
  `backend/src/controllers/appointmentController.js` — cinco `console.log` que se
  ejecutaban en cada consulta de slots, saltándose winston e imprimiendo las citas.
  *Corregido:* eliminados. *Verificado:* 0 líneas de depuración tras consultar slots.

- [x] **M2 — El health check no cuelga de `/api`** ✅ *Fase 2 (documentación)*
  Está en `/health` (`server.js:34`), pero `DEPLOY.md` y el README afirmaban que
  `/api/health` responde: daba 404. Corregido en la documentación y contemplado en
  `nginx.conf`, que hace proxy de ambas rutas.

- [x] **M3 — El README describía una estructura inexistente** ✅ *Fase 2 — cerrado y confirmado*
  Listaba `backend/src/models/`, `frontend/src/hooks/`, `frontend/src/components/`,
  `frontend/public/` y `backend/src/config/seed.sql`, ninguno de los cuales existe.
  También citaba `node-otp / speakeasy` como dependencia de 2FA, que no está en
  `package.json` ni se usa (el 2FA es por correo). Reescrito en la Fase 2.

- [x] **M4 — Sin tope en la paginación** ✅ *Bloque A*
  `getAppointments`, `getClients`, `getClientsReport` y también `getAppointmentsReport`
  (el cuarto no estaba en el informe original pero tenía el mismo patrón) aceptaban
  `?limit=999999`.
  *Corregido:* helper `utils/pagination.js` con tope de 100 y valor por defecto de 20;
  todo lo que no sea un entero válido cae en el defecto, así que `?limit=abc` o
  `?page=-3` ya no producen `NaN` ni offsets negativos.
  *Verificado* con 150 clientes reales: `?limit=999999` devuelve 100 filas, `?limit=5`
  devuelve 5, `?limit=abc` → 20, `?limit=-3` → 1.

- [x] **M5 — `sendWelcomeEmail` se importa y nunca se llama** ✅ *Bloque A*
  `backend/src/controllers/authController.js` — el correo de bienvenida no se enviaba jamás.
  *Decisión: usarlo.* Ya estaba escrito y con plantilla, y mejora la experiencia de alta.
  Se llama tras crear la cuenta en `verifyRegister`, sin `await`: la función captura sus
  propios errores, así que un fallo de SMTP no impide que la cuenta quede creada.

- [ ] **M6 — El código 2FA se guarda en claro**
  `users.two_fa_code` — quien lea la base puede iniciar sesión como cualquiera durante la
  ventana de 10 minutos. → *Bloque C*

- [ ] **M7 — Enumeración de usuarios por temporización**
  `backend/src/controllers/authController.js:15-18` — si el correo no existe,
  `bcrypt.compare` no llega a ejecutarse y la respuesta vuelve notablemente más rápido.
  El mensaje de error sí es genérico, que está bien.

- [x] **M8 — Falta índice compuesto** ✅ *Bloque A*
  `appointments(appointment_date, start_time)` — la consulta de cupos filtra por ambas
  columnas y solo había índice sobre `appointment_date`.
  *Corregido:* `idx_appointments_date_time` añadido a `database.sql`.
  *Verificado:* `SHOW INDEX` lo lista con `seq 1 = appointment_date`, `seq 2 = start_time`.
  ⚠️ **Para una instalación que ya tiene datos**, `database.sql` no se vuelve a ejecutar
  (solo corre con el volumen vacío). Hay que aplicarlo a mano, sin perder nada:
  ```bash
  docker compose exec db mysql -u root -p motowash_db \
    -e "CREATE INDEX idx_appointments_date_time ON appointments(appointment_date, start_time);"
  ```
  Es una operación online en MySQL 8 (`ALGORITHM=INPLACE` por defecto al añadir un índice
  secundario): no bloquea escrituras ni obliga a parar la aplicación. Si el índice ya
  existe, MySQL responde error 1061 y no ocurre nada más.

- [x] **M9 — Query param `date` sin validar** ✅ *Bloque A*
  `backend/src/controllers/appointmentController.js` — `new Date(date + 'T00:00:00')` a
  partir de un parámetro sin validar; con `?date=basura` producía `Invalid Date` y
  `getDay()` devolvía `NaN`, que acababa en una consulta SQL.
  *Corregido:* se exige el formato `AAAA-MM-DD` y se comprueba que la fecha resultante sea
  válida; si no, 400.
  *Verificado:* `basura`, `2026-13-99` y vacío devuelven 400; una fecha válida, 200.

---

## Resumen

| | Total | Corregidos | Pendientes |
|---|---|---|---|
| 🔴 Críticos | 7 | 4 | 3 |
| 🟠 Importantes | 8 | 7 | 1 |
| 🟡 Menores | 9 | 7 | 2 |
| **Total** | **24** | **18** | **6** |

Pendientes reales: **C1, C3, M6** (Bloque C).
Los otros tres —I7, M7 y las partes (b)/(c) de I5— son decisiones conscientes de no
corregir, documentadas en su entrada.

### Plan de la Fase 3

- ✅ **Bloque A** — internas, sin tocar el contrato de la API: C4, C6, C7, I2, I3, I5a,
  I8, M1, M4, M5, M8, M9
- ✅ **Bloque B** — integridad de datos: C5, I6
- ⬜ **Bloque C** — requieren coordinar con el frontend: C3, C1, M6
