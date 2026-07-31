# Auditoría de seguridad y robustez — MotoWash

Realizada el **2026-07-30** sobre el commit `95ffea2` (estado inicial del proyecto).
1.290 líneas de backend, 21 archivos de frontend.

**25 hallazgos:** 8 críticos, 8 importantes, 9 menores.
*(C7 y C8 no salieron de leer el código sino de ejecutarlo: la auditoría original, hecha
solo por lectura, no los detectó. Los dos dejaban pantallas enteras sin funcionar.)*

| Estado | Significado |
|---|---|
| `- [x]` | Corregido y verificado |
| `- [ ]` | Pendiente |
| 🔵 | Decisión consciente de no corregir (queda documentado) |

Los identificadores C/I/M son estables: no se reutilizan aunque se cierren.

---

## 🔴 Críticos

- [x] **C1 — El admin por defecto no puede iniciar sesión** ✅ *Fase 2 + Bloque C*
  `backend/src/config/database.sql` → `backend/src/config/bootstrapAdmin.js`
  El hash original era un valor de ejemplo copiado de un tutorial y no correspondía a
  `Admin123!` ni a ninguna contraseña conocida (verificado con `bcrypt.compareSync`
  contra 8 candidatos). Nadie podía entrar en una instalación limpia.
  *Fase 2:* hash real y 2FA desactivado en el usuario semilla, lo justo para verificar
  el login — pero la credencial seguía dentro del repositorio.
  *Bloque C:* el `INSERT` sale de `database.sql`. Ahora `bootstrapAdmin()` se ejecuta al
  arrancar, lee `ADMIN_EMAIL` y `ADMIN_PASSWORD` del entorno y hashea en runtime. Es
  idempotente: si el correo ya existe **no lo toca**, así que una contraseña cambiada
  desde la aplicación sobrevive a los reinicios. Si faltan las variables y no hay ningún
  admin, avisa por log en vez de fallar en silencio.
  *Verificado:* desde volumen limpio, log «Administrador creado» y login correcto; al
  reiniciar, «Administrador ya existente, no se modifica». **Cero credenciales en el
  repositorio** (`grep` de `Admin123!` y de hashes bcrypt en `backend/src/`: 0 archivos).

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

- [x] **C3 — `express-validator` es inerte** ✅ *Bloque C*
  `backend/src/routes/index.js`, `middleware/validate.js`, `middleware/validators.js`
  Los validadores estaban declarados en `/auth/register`, pero **`validationResult` no se
  invocaba en ningún archivo**. Sin leer el resultado, los errores se anotaban en la
  request y el controlador seguía igual: no había ninguna ruta validada en todo el
  backend, ni siquiera la que lo aparentaba.
  *Corregido:* middleware `validar` que lee `validationResult` y responde 400, más
  cadenas de validación para las **15 rutas que reciben body o `:id`**.
  **No hizo falta tocar el frontend**: las 14 pantallas ya muestran
  `err.response?.data?.message`, así que basta con mantener `message` en la raíz de la
  respuesta. El detalle por campo va aparte, en `errors`.
  *Verificado* — 10 entradas inválidas, todas rechazadas con mensaje en español:

  | Entrada | Respuesta |
  |---|---|
  | Correo `no-es-correo` | «Correo con formato inválido» |
  | Contraseña de 3 caracteres | «La contraseña debe tener al menos 8 caracteres» |
  | Precio `-5` | «El precio debe ser un número mayor o igual a 0» |
  | Duración `0` | «La duración debe ser un número de minutos entre 1 y 1440» |
  | Fecha `30-08-2026` | «Fecha con formato inválido. Se espera AAAA-MM-DD.» |
  | Hora `99:99` | «Hora con formato inválido. Se espera HH:MM.» |
  | Descuento `150` | «El descuento debe estar entre 0 y 100» |
  | Promoción que acaba antes de empezar | «La fecha de fin debe ser posterior a la de inicio» |
  | Estado `inventado` | «Estado no válido» |

  Y los caminos válidos siguen funcionando: crear/editar servicio, crear promoción,
  guardar horario y guardar ajustes, con los mismos cuerpos que envían las pantallas.

- [x] **C8 — La pantalla de Perfil estaba entera rota** ✅ *Bloque C*
  `backend/src/routes/index.js`, `controllers/authController.js`
  **Hallazgo nuevo, no estaba en la auditoría original.** `ProfilePage.jsx` llamaba a
  `PUT /auth/profile` y `PUT /auth/password`, pero **ninguna de las dos rutas existía**:
  las dos respondían `404 Ruta no encontrada`. Los dos botones de la pantalla no hacían
  nada. Salió al revisar qué envía cada pantalla para C3.
  *Corregido:* implementados con el contrato exacto que el frontend ya enviaba —
  `{ name, phone }` y `{ currentPassword, newPassword }`. El cambio de contraseña
  verifica la actual, rechaza repetir la misma y hashea con 12 rondas.
  *Verificado:* perfil se actualiza; contraseña actual incorrecta → 401; nueva igual a la
  actual → 400; cambio correcto → la contraseña nueva entra y la vieja deja de servir.
  ⚠️ Los JWT ya emitidos siguen siendo válidos tras cambiar la contraseña: no hay lista
  negra de tokens. Relacionado con I8; queda anotado, no se corrige aquí.

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

- [x] **M6 — El código 2FA se guarda en claro** ✅ *Bloque C*
  `users.two_fa_code` — quien leyera la base podía iniciar sesión como cualquiera durante
  la ventana de 10 minutos.
  *Corregido:* se guarda el hash bcrypt (10 rondas; el código es de un solo uso, caduca
  en 10 minutos y ya tiene contador de intentos). La verificación ya no puede compararse
  en SQL: se trae el usuario por id y se contrasta con `bcrypt.compare`.
  La columna pasa de `VARCHAR(10)` a `VARCHAR(255)`.
  *Verificado* con el flujo completo: lo almacenado es `$2a$10$Ccj5TjQFq8uny…`, 60
  caracteres, y el código real (`494133`, leído del correo) supera la verificación.
  ⚠️ **Instalación existente:** `database.sql` no se vuelve a ejecutar. Aplica la
  migración a mano, o los hashes no caben y el 2FA deja de funcionar:
  ```bash
  docker compose exec db mysql -u root -p motowash_db \
    -e "ALTER TABLE users MODIFY two_fa_code VARCHAR(255);"
  ```

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
| 🔴 Críticos | 8 | 7 | 1 |
| 🟠 Importantes | 8 | 7 | 1 |
| 🟡 Menores | 9 | 8 | 1 |
| **Total** | **25** | **22** | **3** |

**Los 3 pendientes son decisiones conscientes de no corregir**, no trabajo olvidado:

| | Por qué se deja |
|---|---|
| **C2** | La parte que importaba —revocar la App Password y rotar el `JWT_SECRET`— está hecha. Lo que queda es que el secreto vive en un `.env` de un disco sincronizado a OneDrive; resolverlo de verdad pide un gestor de secretos, que no encaja en este despliegue. |
| **I7** | `node-cron` dentro de Express. Correcto con una réplica; con varias el job se duplica. El `UPDATE` es idempotente, así que no corrompe datos. Documentado en el README. |
| **I5 (b) y (c)** | El estado de 2FA vive en memoria del proceso: se pierde al reiniciar y no se comparte entre réplicas. La fuga de memoria (a) sí se corrigió. Resolver el resto exige mover el estado a la base o a Redis. |
| **M7** | Enumeración de usuarios por temporización en el login. El mensaje de error ya es genérico; cerrar el canal temporal obliga a un `bcrypt.compare` señuelo. Impacto bajo. |

### Plan de la Fase 3

- ✅ **Bloque A** — internas, sin tocar el contrato de la API: C4, C6, C7, I2, I3, I5a,
  I8, M1, M4, M5, M8, M9
- ✅ **Bloque B** — integridad de datos: C5, I6
- ✅ **Bloque C** — coordinación con el frontend: C3, C1, C8, M6
  *(al final no hizo falta cambiar ni un archivo del frontend: ver C3)*

---

## 🔬 Fase 4 — hallazgos de la verificación end-to-end

Los nueve salieron de recorrer la aplicación con navegadores reales
(`e2e/`, Playwright). **Ninguno aparece leyendo el código**, que es como se hicieron las
fases 1–3. Tres de ellos (E3, E4 y E8) los había introducido yo al contenerizar en la
Fase 2, y **E8 solo se manifestaba fuera de Chromium**: apareció al ampliar la suite a
Firefox, WebKit y perfiles móviles.

- [x] **E1 — Cualquier 401 recargaba la página y borraba el mensaje de error** ✅
  `frontend/src/utils/api.js`
  El interceptor trataba todo 401 como sesión caducada y hacía `window.location.href`.
  Cuatro endpoints usan 401 para errores normales del usuario, así que sus mensajes
  nunca llegaban a verse — incluido el contador de intentos de C4, que quedaba inútil.
  *Corregido:* el backend marca con `code: 'SESION_INVALIDA'` únicamente los 401 que
  significan «tu token ya no vale» (`middleware/auth.js`). El interceptor cierra sesión
  solo ante ese código; el resto se propaga a la pantalla.
  *Verificado:* login incorrecto conserva lo escrito y muestra el mensaje; el contador
  del 2FA recorre «quedan 4 / 3 / 2 intentos», «queda 1 intento» y «demasiados intentos
  fallidos»; lo mismo en `verify-register`; contraseña actual incorrecta no expulsa.

- [x] **E2 — Recargar durante el 2FA dejaba al usuario atrapado** ✅
  `frontend/src/store/authStore.js`, `pages/auth/Verify2FAPage.jsx`
  `pending2FA` vivía solo en memoria de Zustand. Tras un F5 el código correcto se
  rechazaba indefinidamente y no había salida.
  *Corregido:* se persiste en **sessionStorage**. Se eligió frente a localStorage porque
  muere al cerrar la pestaña (en un equipo compartido no queda un 2FA a medias
  reutilizable) y frente a «detectar y devolver al login» porque eso arregla el síntoma,
  no el caso real: quien recarga quiere continuar, no empezar de cero. El aviso claro se
  mantiene para cuando el estado sí es inválido.
  También se cambió el mensaje «Falta el token de la sesión» por «Tu verificación caducó.
  Vuelve a iniciar sesión para recibir un código nuevo.»
  *De paso:* login y 2FA ahora llevan a cada rol a su panel, en vez de mandar a todos a
  `/admin` y dejar que la guarda de ruta rebotara a los clientes.

- [x] **E3 — Recrear el backend dejaba la aplicación en 502** ✅ *(bug propio de la Fase 2)*
  `frontend/nginx.conf`
  nginx resolvía `backend` una sola vez al arrancar y cacheaba la IP para siempre. Como
  Docker asigna IP nueva a cada contenedor recreado, **cada redespliegue rompía todo
  `/api`** hasta reiniciar nginx a mano.
  *Corregido:* `resolver 127.0.0.11` y destino en variable (`set $destino_api`), que es
  lo que obliga a nginx a re-resolver en cada petición. Con variable ya no reescribe la
  ruta, de ahí `$request_uri`.
  *Verificado* forzando el escenario con contenedores señuelo: la IP del backend cambió
  de `172.19.0.4` a `172.19.0.8` y nginx la siguió sin reiniciarse. Cero 502.

- [x] **E4 — Los datos iniciales con tildes se guardaban corrompidos** ✅ *(bug propio de la Fase 2)*
  `backend/src/config/database.sql`, `docker-compose.yml`
  El `.sql` es UTF-8, pero MySQL lo ejecutaba con `character_set_client = latin1` y
  guardaba los bytes doble-codificados: «Lavado B**Ã¡**sico», «agua a presi**Ã³**n»,
  «Armenia, Quind**Ã­**o». Lo veía todo cliente al entrar a agendar.
  *Corregido en la causa, no en las filas:* `SET NAMES utf8mb4` como primera instrucción
  del script, más `--character-set-server=utf8mb4` en el servicio `db` para que ningún
  cliente que no declare su juego de caracteres vuelva a caer en latin1.
  *Verificado desde volumen limpio.* Migración manual para instalaciones existentes: ver
  más abajo.

- [x] **E5 — Tras guardar el perfil seguía el nombre viejo** ✅
  `frontend/src/pages/client/ProfilePage.jsx`
  El backend devolvía el usuario actualizado y la pantalla lo descartaba, así que
  cabecera, avatar y tarjeta mantenían el nombre anterior hasta recargar.
  *Corregido:* `setUser` en el store y la pantalla lo usa. De paso, el botón de cambiar
  contraseña ahora tiene estado de carga, que tampoco tenía.

- [x] **E6 — El asistente de reserva se quedaba clavado** ✅
  `frontend/src/pages/client/BookPage.jsx`
  Tras reservar o reagendar, pulsar «Agendar» en el menú no hacía nada: misma ruta, React
  Router no remonta y `step` seguía en 4. La única salida era «Volver al inicio».
  *Corregido:* se reinicia el asistente cuando cambia `location.key`, que React Router
  renueva en cada pulsación del enlace.

- [x] **E7 — Ningún `<label>` estaba asociado a su campo** ✅
  9 archivos de `frontend/src/pages/`
  Sin `htmlFor`/`id`, un lector de pantalla no anuncia el nombre de los campos y pulsar
  la etiqueta no enfoca el control.
  *Corregido:* 29 campos asociados en los 9 formularios. Las pruebas ya pueden usar
  `getByLabel` en vez de seleccionar por posición, que era frágil.

- [x] **E8 — La pantalla de Agendar reventaba en Firefox y WebKit** ✅ *(bug propio de la Fase 2)*
  `frontend/nginx.conf`, `frontend/src/pages/client/BookPage.jsx`
  **Hallazgo nuevo, salió al ampliar la suite a otros navegadores.** En carga completa de
  `/client/book` saltaba, de forma intermitente,
  `TypeError: can't access property "map", n is undefined`. En Chromium **no se
  reproducía nunca**, y por eso las 30 pruebas anteriores lo daban por bueno.
  *Diagnóstico:* resolviendo el sourcemap se localizó en `BookPage.jsx:239`
  (`services.map`). Instrumentando la respuesta se vio que axios recibía el cuerpo **como
  texto**: falla el `JSON.parse` interno, devuelve la cadena cruda en silencio, y
  `r.data.services` queda `undefined`.
  *Causa:* el `gzip` que añadí en la Fase 2 incluía `application/json`, así que nginx
  comprimía también las respuestas del API que pasan de 1 KB. En la práctica **solo
  `/api/services`** (1171 B) — todos los demás endpoints se quedan por debajo del umbral,
  que es justo por qué solo esa pantalla fallaba. Se servía gzip + chunked, y ese cuerpo
  fallaba al decodificarse de vez en cuando fuera de Chromium.
  *Corregido en dos frentes:* se saca `application/json` de `gzip_types` y se añade
  `gzip_proxied off` — el API viaja por la red interna del contenedor y sus respuestas son
  de un par de kilobytes, comprimirlas no aportaba nada; el bundle de Vite (120 KB) sí
  se sigue comprimiendo, que es donde importa. Y `BookPage` normaliza la respuesta a lista
  antes de guardarla, de modo que un cuerpo inesperado muestre un aviso en vez de tumbar
  la pantalla.
  *Verificado:* `Content-Encoding: gzip` desaparece del API y se mantiene en el bundle;
  16 repeticiones del humo en Firefox y WebKit, cero excepciones.

- [x] **E9 — El panel solo dejaba ver 20 registros** ✅
  `frontend/src/pages/admin/Appointments.jsx`, `Clients.jsx`, `Reports.jsx`
  **Hallazgo nuevo, salió al probar con volumen.** Ninguna de las tres pantallas envía
  `page` ni `limit`, así que reciben el valor por defecto del backend —20 filas— y
  **no tienen ningún control de paginación**: ni «siguiente», ni «cargar más», ni número
  de página.
  *Comprobado* sembrando 150 citas: la pantalla de Citas aguanta sin romperse, pero pinta
  20 y las otras 130 son sencillamente inalcanzables desde el panel. El tope de 100 de M4
  ni siquiera llega a notarse, porque nadie pide tanto.
  *Corregido:* los cuatro endpoints paginados devuelven ahora `total`, `page`, `limit` y
  `totalPages` con un envoltorio común (`utils/pagination.js`), calculando el total con el
  mismo `FROM`/`WHERE` que la página para que no puedan desincronizarse. En el frontend,
  un componente `Paginacion` compartido por Citas, Clientes y las dos pestañas paginadas
  de Reportes; se oculta solo cuando hay una única página, y cambiar de filtro o de
  búsqueda devuelve a la primera —quedarse en la página 7 de un listado que ahora tiene 2
  mostraría una tabla vacía sin explicación—. La pestaña de Ingresos no lleva controles:
  viene agregada por periodo, no paginada.
  *Verificado* con 150 citas y 45 clientes sembrados: «Mostrando 1–20 de 150», saltar a la
  página siguiente trae filas distintas, el salto por número lleva a «61–80», «anterior»
  vuelve a «41–60» y queda deshabilitado en la primera. En Clientes, buscar devuelve a la
  página 1 y con pocos resultados el control desaparece.

### Otros cambios de la Fase 4

**Límites de tasa configurables por entorno**, con el valor de producción como defecto
(`RATE_LIMIT_LOGIN_MAX=5`, etc.). Existe porque las pruebas salen todas de la misma IP y
agotaban el límite a mitad de la suite, fallando por el limitador y no por la aplicación.
Se suben en `docker-compose.test.yml`, nunca en el código.

---

### Migraciones pendientes de aplicar en instalaciones existentes

`database.sql` solo se ejecuta con el volumen vacío. Sobre una base con datos:

```bash
docker compose exec db mysql -u root -p motowash_db -e "
  CREATE INDEX idx_appointments_date_time ON appointments(appointment_date, start_time);
  ALTER TABLE users MODIFY two_fa_code VARCHAR(255);"
```

**Reparar las tildes corrompidas (E4).** La corrección actúa sobre la causa, así que las
instalaciones nuevas nacen bien — pero las filas ya guardadas siguen dobles-codificadas.

Primero comprueba si te afecta:

```bash
docker compose exec db mysql -u root -p motowash_db \
  -e "SELECT name FROM services WHERE name LIKE '%Ã%' OR name LIKE '%Â%';"
```

Si esa consulta **no devuelve filas, no ejecutes nada más**: tus datos están sanos y la
reparación los rompería. Si sí devuelve filas:

```bash
docker compose exec db mysql -u root -p motowash_db -e "
  UPDATE services SET
    name        = CONVERT(BINARY(CONVERT(name        USING latin1)) USING utf8mb4),
    description = CONVERT(BINARY(CONVERT(description USING latin1)) USING utf8mb4)
    WHERE name LIKE '%Ã%' OR description LIKE '%Ã%';
  UPDATE settings SET
    value = CONVERT(BINARY(CONVERT(value USING latin1)) USING utf8mb4)
    WHERE value LIKE '%Ã%';"
```

⚠️ **Se ejecuta una sola vez.** Repetirla sobre datos ya reparados vuelve a corromperlos.
Los `WHERE` acotan el daño, pero haz un volcado antes:
`docker compose exec db mysqldump -u root -p motowash_db > respaldo.sql`


---

## 🧾 Fase 5 — Módulo de caja (en curso)

A diferencia de las fases 1-4, **esto no son correcciones**: es un módulo nuevo que cambia
el modelo de datos. Se anota aquí porque toca cosas que las fases anteriores dejaron
cerradas, y conviene que el rastro esté en el mismo sitio.

### Bloque 1 — Modelo de datos y roles ✅

**Rol `cashier`.** Añadirlo no era una fila más en un ENUM. Había **once sitios** que
usaban `role === 'admin'` como sinónimo de «no es un cliente»: seis en el backend
(`appointmentController` ×5, `serviceController`) y cinco en el frontend (`App.jsx` ×2,
`LoginPage`, `Verify2FAPage`, y la guarda de rutas). Ninguno *fallaba*: **degradaban al
cajero a cliente en silencio** — le habrían mostrado una lista de citas vacía en vez de la
del negocio. Se sustituyen por el predicado `esPersonal()` y la guarda `requireStaff`.
Las pantallas de solo-admin se protegen **también en el enrutador**, no solo ocultando el
menú: escribir `/admin/settings` a mano tampoco las abre.

**Invitados.** Un cliente sin cuenta es un usuario real con `is_guest = TRUE` y sin
credenciales, no unos campos sueltos en la cita. Convertirlo es un `UPDATE` sobre la misma
fila: el `id` no cambia y conserva todo su historial. El login los rechaza de forma
explícita — sin ese corte, un `password` NULL llegaba a `bcrypt.compare` y reventaba en
vez de devolver 401.

**Sobrecupo explícito.** Si la franja está llena el backend responde 409 con `CUPO_LLENO`
y los conteos; la pantalla avisa «esta franja ya tiene N de N» y **solo reintenta si quien
atiende lo confirma**. Queda marcado en la cita y visible en la lista, para poder contarlo
en el reporte del Bloque 4.

**Dinero en centavos enteros** (`utils/dinero.js`). Las columnas `DECIMAL` ya eran exactas;
el problema estaba en JS, donde el cálculo del precio con descuento era aritmética de coma
flotante. Ahora se parsea con BigInt y se opera con enteros.

**Reutilización, no copia.** El núcleo de reserva se extrajo a `reservarFranja()` y lo
comparten autoservicio y mostrador: el cerrojo `SELECT ... FOR UPDATE` de **C5** es
literalmente el mismo código. La validación de **I6** admite «ahora» solo por la vía del
panel, y sigue rechazando cualquier cosa de más de 12 horas atrás.

### Decisiones tomadas y por qué

| Decisión | Motivo |
|---|---|
| Los invitados son usuarios, no campos en la cita | Historial, búsqueda por placa y reportes funcionan sin casos especiales |
| «Media» nace inactiva **pero con sus precios sembrados** | Activarla es cambiar una bandera, no volver a migrar |
| `service_prices` es el precio efectivo; `services.price` queda de respaldo | Ningún importe se mueve al migrar |
| La regla de «una sola cita pendiente» no aplica al panel | Impediría atender dos veces el mismo día al mismo cliente |
| Validación de placa permisiva (`[A-Z0-9]{5,8}`) | Rechazar una placa extranjera o temporal en el mostrador es peor que aceptar una rara |
| `attended_by` se añade **sin lógica** | Reservada para comisiones por lavador. Documentada como «nadie la escribe todavía» |

### Un tropiezo propio, y lo que se hizo con él

Al actualizar `database.sql` una sustitución de texto acertó **también dentro de un
comentario** —la línea de ejemplo del hallazgo M8— y partió el bloque, dejando el script
con error de sintaxis en la línea 192. Efecto: las tablas nuevas quedaban vacías en una
instalación limpia.

Se corrigió y, sobre todo, **se añadió un paso de validación**: ejecutar el `.sql` completo
contra un MySQL desechable antes de tocar el entorno real, comprobando los conteos
sembrados. Es la contrapartida de la lección de C7 y C8 aplicada al esquema.

```bash
docker run --rm -d --name sql-lint -e MYSQL_ROOT_PASSWORD=t mysql:8.0
docker exec -i sql-lint mysql -uroot -pt < backend/src/config/database.sql
```

### Anotado, sin corregir

`GET /schedule` responde 200 al cajero **a propósito**: necesita el horario para agendar, y
el cliente también lo lee. No puede editarlo (`PUT` da 403) ni ve esa pantalla en el menú.
Si se quisiera cerrar del todo habría que separar la lectura del horario de negocio de la
pantalla de configuración.

### Bloque 2 — Caja y cobro ✅

**Turno de caja.** Un turno pertenece a **un** día de operación y no se arrastra ni se
cierra solo. Si queda abierto de un día anterior queda **vencido**: bloquea el cobro hasta
que alguien lo cierre con conteo real, y ese cierre se registra como tardío
(`was_late_close`) conservando cuándo se abrió y cuándo se cerró de verdad.

«Vencido» **se deriva, no se guarda**: un turno abierto de un día anterior lo está por
definición. Una bandera almacenada necesitaría un proceso que la pusiera al día y podría
quedar desfasada.

*Un solo turno abierto a la vez* lo garantiza la **base**, no solo el código: una columna
generada vale 1 mientras el turno está abierto y NULL al cerrarse, con índice único encima.
MySQL admite varios NULL en un índice único, así que los turnos cerrados no chocan.

**El arqueo es solo sobre efectivo.** Una transferencia no pasa por el cajón. Verificado:
base 50.000 + 7.000 en efectivo (de un cobro mixto de 12.000) = 57.000 esperados.

**Consecutivo global y continuo.** No se usa `AUTO_INCREMENT`, que deja huecos en cada
transacción fallida: se bloquea una fila contador con `FOR UPDATE` dentro de la misma
transacción que inserta el recibo. Si algo falla, el número vuelve a quedar libre.

**El precio queda congelado en la línea del recibo.** Verificado cambiando la tarifa a
99.000 y renombrando el servicio *después* del cobro: el recibo sigue diciendo
«Lavado Básico — 15.000». Se copian también los nombres, porque renombrar un servicio no
puede cambiar lo que dice un recibo de hace un año.

**El pago es completo.** La suma de los métodos tiene que dar el total exacto, comparada
en centavos enteros. La pantalla muestra el descuadre en vivo y deshabilita el botón.

**Anular no borra.** Se marca, se guarda motivo, autor y momento, y la cita vuelve a poder
cobrarse. El consecutivo no reutiliza el número anulado.

**La cita guarda el recibo, no una bandera** (`paid_receipt_id`): un booleano puede
desincronizarse, una clave ajena no.

#### Un bug propio, encontrado por las pruebas

`String(fecha).slice(0, 10)` sobre una columna `DATE` da **«Thu Jul 30»**, no
«2026-07-30», porque mysql2 devuelve las fechas como objetos `Date`. La comparación de
turno vencido nunca era cierta. Apareció el mismo error **dos veces**: en el backend y en
la aserción de la propia prueba. Corregido con un normalizador `aISO()`.

### Coste de la suite

Las pruebas se etiquetan: `@ui` corre en los cinco navegadores, el resto **solo en
Chromium**. Un cobro mixto que no cuadra se comporta igual en WebKit; repetirlo cinco
veces multiplica el coste sin encontrar nada. Los recorridos de interfaz sí se repiten,
porque **E8 solo se reproducía fuera de Chromium**.

De **270 ejecuciones a 126**. Durante el desarrollo se usa solo Chromium (~1,5 min); la
pasada completa se hace una vez al cerrar cada bloque (~5 min).

### Pendiente de la Fase 5

Bloques 3 a 5: recibo impreso a 80 mm, reporte contable y dashboard.

---

## Qué queda sin verificar

Estado tras la Fase 4. No son hallazgos: son huecos de cobertura conocidos. Se dejan
escritos porque la lección de C7 y C8 fue justamente esa — lo que no se ejercita, no se
sabe si funciona.

| Hueco | Por qué importa |
|---|---|
| ~~Un solo navegador~~ | ✅ **Cerrado.** La suite corre en Chromium, Firefox y WebKit. Destapó **E8**, que en Chromium no aparecía. |
| ~~Sin viewport móvil~~ | ✅ **Cerrado.** Perfiles `Pixel 7` e `iPhone 14`, con user agent táctil y `hasTouch`. Obligó a que las pruebas abran la barra lateral del panel con el botón de menú, que por debajo de 1024 px está oculta. |
| **Envío real por Gmail** | Las pruebas usan un buzón desechable (mailpit). Que `MAIL_USER`/`MAIL_PASS` reales funcionen contra `smtp.gmail.com` no está comprobado desde que se revocó la App Password anterior. |
| ~~Concurrencia desde la interfaz~~ | ✅ **Cerrado.** Dos contextos de navegador reservando la misma franja a la vez con el límite en 1: exactamente una prospera, y la base lo confirma. |
| ~~Volumen de datos~~ | ✅ **Cerrado**, y destapó **E9**, ya corregido: con 150 citas la paginación permite llegar a todas. |
| ~~Acciones del admin sobre citas~~ | ✅ **Cerrado.** Cancelar desde el panel deja la cita en `cancelled`; marcar como realizada una cita futura se rechaza y el mensaje llega a la pantalla. |
| **Cifras de los informes** | Los dos informes cargan sin error, pero con la base casi vacía. No se ha validado que los totales, ingresos y agrupaciones sean correctos. |

### Cómo cerrar cada hueco

Quedan dos, y ninguno se cierra con más pruebas:

- **Envío real por Gmail** depende de credenciales vivas que no están en el entorno de
  pruebas. La forma de comprobarlo es un registro real contra la cuenta de producción.
- **Cifras de los informes** exige un juego de datos representativo con importes y
  estados variados, y decidir antes cuáles son los totales correctos. Es trabajo de
  producto, no de infraestructura de pruebas.
