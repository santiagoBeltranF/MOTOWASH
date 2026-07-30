# 🏍️ MotoWash — Sistema de Agendamiento Profesional

Sistema de gestión para lavadero de motos con panel administrativo y portal de clientes.
Negocio ubicado en Armenia, Quindío (zona horaria `America/Bogota`, UTC−5).

---

## 🐳 Levantar con Docker (recomendado)

Requiere Docker Engine con el plugin `compose`. No hace falta instalar Node ni MySQL.

```bash
# 1. Copia la plantilla de variables y cambia al menos las tres contraseñas
cp .env.example .env

# 2. Genera un JWT_SECRET propio y pégalo en el .env
#    (en Windows/PowerShell funciona igual con node instalado; si no,
#     invéntate una cadena larga y aleatoria)
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

# 3. Levanta todo
docker compose up --build
```

Cuando termine:

| Servicio | URL | Notas |
|---|---|---|
| Frontend | http://localhost:8080 | nginx sirviendo el build de Vite |
| API (vía nginx) | http://localhost:8080/api | Mismo origen que el frontend, sin CORS |
| Health check | http://localhost:8080/health | Responde `{"status":"ok"}`. **No cuelga de `/api`** |
| API directa | http://localhost:3000 | Solo para depurar, se salta nginx |
| MySQL | `localhost:3307` | 3307 para no chocar con un MySQL local |

Los puertos se cambian desde el `.env` (`FRONTEND_PORT_HOST`, `BACKEND_PORT_HOST`, `DB_PORT_HOST`).

### Comandos útiles

```bash
docker compose up -d --build     # levantar en segundo plano
docker compose logs -f backend   # seguir los logs del API
docker compose ps                # estado y salud de los servicios
docker compose down              # parar (los datos se conservan)
docker compose down -v           # parar y BORRAR la base de datos
```

---

## 🔑 Credenciales iniciales

| | |
|---|---|
| Usuario | `admin@motowash.com` |
| Contraseña | `Admin123!` |

> ⚠️ Esta contraseña está en el repositorio (`backend/src/config/database.sql`), así que
> es pública. Sirve para desarrollo. **Cámbiala antes de exponer la aplicación a internet.**

El usuario semilla trae el **2FA desactivado** a propósito, para poder entrar sin tener
configurado el envío de correo. Los clientes que se registran sí llevan 2FA activo.

### Cómo cambiar la contraseña del admin

No hay pantalla de cambio de contraseña todavía, así que se hace por base de datos:

```bash
# 1. Genera el hash de la contraseña nueva
docker compose exec backend node -e "console.log(require('bcryptjs').hashSync('TU_PASSWORD_NUEVA', 12))"

# 2. Aplícalo (pega el hash del paso anterior)
docker compose exec db mysql -u root -p motowash_db \
  -e "UPDATE users SET password='EL_HASH_DEL_PASO_1' WHERE email='admin@motowash.com';"
```

### Cómo activar el 2FA del admin

Requiere `MAIL_USER` y `MAIL_PASS` configurados en el `.env` (ver más abajo):

```bash
docker compose exec db mysql -u root -p motowash_db \
  -e "UPDATE users SET two_fa_enabled=TRUE WHERE email='admin@motowash.com';"
```

---

## 🗄️ Entrar a la base de datos

```bash
# Cliente MySQL dentro del contenedor (pide la MYSQL_ROOT_PASSWORD del .env)
docker compose exec db mysql -u root -p motowash_db

# Con el usuario de la aplicación
docker compose exec db mysql -u motowash -p motowash_db

# Desde un cliente externo (DBeaver, Workbench, TablePlus...)
#   host: 127.0.0.1    puerto: 3307
#   usuario: motowash  base: motowash_db
```

Un volcado rápido:

```bash
docker compose exec db mysqldump -u root -p motowash_db > respaldo.sql
```

### Sobre el esquema inicial

`backend/src/config/database.sql` se monta en `/docker-entrypoint-initdb.d/` y crea las
8 tablas más los datos iniciales (1 admin, 5 servicios, 7 días de horario, 7 ajustes).

**Ese script solo se ejecuta la primera vez**, cuando el volumen `db_data` está vacío.
Si modificas el esquema, hay que recrear el volumen:

```bash
docker compose down -v && docker compose up --build
```

`DB_NAME` del `.env` debe coincidir con el `CREATE DATABASE` del script. Si no coinciden,
el script crea una segunda base sobre la que el usuario de la aplicación no tiene
permisos, y el backend arranca contra una base vacía.

---

## ⚙️ Variables de entorno

Todo se configura desde el `.env` de la raíz — ver `.env.example`, que documenta cada
variable. Cuatro merecen atención:

**`VITE_API_URL`** — se inyecta en tiempo de **build**, no de runtime. Vite la incrusta
literalmente en el bundle, así que la imagen del frontend queda atada a ese valor.
Cambiarla exige reconstruir (`docker compose build frontend`); reiniciar el contenedor no
sirve de nada. Por defecto es `/api`, relativo, porque nginx hace de proxy al backend
desde el mismo origen; solo necesitas una URL absoluta si sirves el API desde otro host.

**`FRONTEND_URL`** — es el origen que el backend permite por CORS. Tiene que ser la URL
**pública real** desde la que el navegador carga el frontend (`http://localhost:8080`),
nunca el nombre del servicio de Compose (`http://frontend`), que solo existe dentro de la
red interna de Docker.

**`TRUST_PROXY_HOPS`** — número de proxies entre el cliente y Express. Con este Compose
solo hay nginx, así que es `1`. Sin esto, el backend vería la IP de nginx en todas las
peticiones y el límite de 5 intentos de login se aplicaría **globalmente a todos los
usuarios juntos**. No lo pongas en `true`: eso haría confiar en toda la cadena de
`X-Forwarded-For` y cualquiera podría falsear su IP para saltarse el límite.

**`TZ`** — `America/Bogota` en los tres servicios. Dejarlo en UTC descuadra en 5 horas la
expiración de promociones y las validaciones de horario de las citas.

### Correo (opcional para desarrollo)

Si `MAIL_USER` / `MAIL_PASS` quedan vacías, la aplicación levanta igual, pero fallan el
registro de nuevos clientes y el 2FA. `MAIL_PASS` es una **App Password** de 16 caracteres
generada en https://myaccount.google.com/apppasswords (requiere verificación en dos pasos
activa), no la contraseña de la cuenta de Google.

---

## 🧱 Arquitectura de los contenedores

```
navegador
    │
    ▼  :8080
┌─────────────────┐
│    frontend     │  nginx: sirve el estático de Vite
│  nginx:alpine   │  + proxy /api y /health hacia el backend
└────────┬────────┘  + fallback a index.html (React Router)
         │ red interna de Compose
         ▼  backend:3000
┌─────────────────┐
│     backend     │  Node 20 alpine, usuario no-root, npm ci
│    Express 4    │  espera a que la BD esté sana antes de servir
└────────┬────────┘
         │
         ▼  db:3306
┌─────────────────┐
│       db        │  MySQL 8, volumen db_data
│    mysql:8.0    │  healthcheck con mysqladmin ping
└─────────────────┘
```

El fallback a `index.html` en nginx es lo que hace que un F5 en `/admin/citas` funcione:
sin él, nginx buscaría un archivo con ese nombre en disco y devolvería 404.

### ⚠️ Sobre escalar réplicas del backend

`node-cron` corre **dentro del proceso de Express** (`backend/src/server.js`), desactivando
promociones vencidas cada 5 minutos. Con una sola réplica está bien.

**Si algún día haces `docker compose up --scale backend=N`, el job se duplica**: correrá N
veces cada 5 minutos. El `UPDATE` es idempotente, así que no corrompe datos, pero multiplica
escrituras y logs. La salida sería extraerlo a un servicio propio o tomar un lock en base.

Hay un segundo problema con varias réplicas: los tokens temporales de 2FA y los registros
pendientes viven en `Map` en memoria del proceso, así que una petición de verificación
puede llegar a una réplica que no los tiene.

---

## 💻 Desarrollo sin Docker

```bash
# Backend  — necesita un MySQL corriendo y backend/.env (ver backend/.env.example)
cd backend && npm install && npm run dev

# Frontend — ver frontend/.env.example
cd frontend && npm install && npm run dev
```

En este modo Vite hace de proxy de `/api` hacia `localhost:3000` (`vite.config.js`) y el
frontend queda en http://localhost:5173.

---

## 📁 Estructura

```
motowash/
├── docker-compose.yml
├── .env.example              # variables de Compose
├── backend/
│   ├── Dockerfile
│   ├── .env.example
│   └── src/
│       ├── config/           # db.js (pool mysql2), database.sql (esquema + seeds)
│       ├── controllers/      # auth, appointments, services, promotions, settings, reports
│       ├── middleware/       # auth.js (JWT + roles), errorHandler.js
│       ├── routes/           # index.js — todas las rutas
│       ├── services/         # emailService.js (nodemailer)
│       ├── utils/            # logger.js (winston)
│       └── server.js
└── frontend/
    ├── Dockerfile
    ├── nginx.conf
    ├── .env.example
    └── src/
        ├── pages/            # auth/ (login, 2FA, registro), admin/, client/
        ├── store/            # authStore.js (Zustand)
        ├── utils/            # api.js (axios)
        └── assets/css/
```

## 🚀 Tecnologías

**Backend** — Node 20, Express 4, MySQL 8 (`mysql2`, SQL crudo sin ORM), JWT + bcryptjs,
2FA por código enviado con nodemailer, `node-cron`, winston, helmet, express-rate-limit.

**Frontend** — React 18, Vite 5, Tailwind 3, React Router 6, Zustand, axios, lucide-react,
react-hot-toast, date-fns.

---

## 📦 Otros despliegues

`DEPLOY.md` conserva la guía de despliegue en Hostinger (Node + phpMyAdmin + `.htaccess`)
como alternativa a Docker.
