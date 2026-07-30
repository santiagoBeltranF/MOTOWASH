# 🚀 Guía de Deploy en Hostinger

> **Nota:** ahora también existe la vía Docker. `docker compose up --build` desde la raíz
> levanta base de datos, API y frontend con nginx, sin instalar Node ni MySQL a mano —
> ver `README.md`. Esta guía de Hostinger se conserva como alternativa y sigue siendo
> válida.
>
> Dos detalles de este documento a tener en cuenta: el health check está en `/health`, no
> en `/api/health` como dice el Paso «Verificar»; y las credenciales iniciales de abajo
> corresponden al `database.sql` actualizado.

## Paso 1 — Preparar la base de datos MySQL

1. Entra al panel de Hostinger
2. Ve a **Bases de datos > MySQL**
3. Crea una nueva base de datos: `motowash_db`
4. Crea un usuario y asígnalo a esa base de datos
5. Abre **phpMyAdmin** y ejecuta el archivo `backend/src/config/database.sql`

---

## Paso 2 — Subir el Backend (Node.js)

1. En Hostinger ve a **Node.js** en el panel
2. Crea una nueva app Node.js
3. Sube la carpeta `backend/` por FTP o Git
4. Crea el archivo `.env` con tus datos reales (copia `.env.example`)
5. En la terminal SSH del servidor:

```bash
cd backend
npm install
npm start
```

O con PM2 para que no se caiga:
```bash
npm install -g pm2
pm2 start src/server.js --name motowash-api
pm2 save
pm2 startup
```

---

## Paso 3 — Subir el Frontend (React)

1. En tu PC, dentro de la carpeta `frontend/`:
```bash
# Crea el archivo .env con la URL de tu API
echo "VITE_API_URL=https://tudominio.com/api" > .env

# Genera los archivos de producción
npm install
npm run build
```

2. Sube **todo el contenido de la carpeta `dist/`** al `public_html` de Hostinger (por FTP o el administrador de archivos)

3. Crea un archivo `.htaccess` en `public_html` para que React Router funcione:

```apache
Options -MultiViews
RewriteEngine On
RewriteCond %{REQUEST_FILENAME} !-f
RewriteRule ^ index.html [QR,L]
```

---

## Paso 4 — Configurar Google App Password (correos)

1. Ve a tu cuenta de Google → Seguridad → Verificación en 2 pasos (actívala)
2. Luego ve a **Contraseñas de aplicaciones**
3. Crea una para "Correo" y copia la clave de 16 caracteres
4. Pégala en el `.env` del backend como `MAIL_PASS`

---

## Credenciales iniciales

- **Admin:** admin@motowash.com / Admin123!
- ⚠️ Cámbiala inmediatamente después del primer login

---

## Verificar que todo funciona

```
✅ https://tudominio.com          → Frontend carga
✅ https://tudominio.com/api/health → Responde { status: "ok" }
✅ Login con admin funciona
✅ Llega el correo con el código 2FA
```
