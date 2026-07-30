# 🏍️ MotoWash — Sistema de Agendamiento Profesional

Sistema completo de gestión para lavadero de motos con panel administrativo y portal de clientes.

## 📁 Estructura del Proyecto

```
motowash/
├── frontend/          # React + Tailwind CSS (Vite)
│   ├── src/
│   │   ├── pages/
│   │   │   ├── auth/          # Login, Verificación 2FA
│   │   │   ├── admin/         # Dashboard, Servicios, Horarios, Citas, Promociones, Clientes, Reportes
│   │   │   └── client/        # Agendar, Mis Citas, Perfil
│   │   ├── components/
│   │   │   ├── admin/         # Componentes del panel admin
│   │   │   ├── client/        # Componentes del portal cliente
│   │   │   ├── shared/        # Calendario, Modal, etc.
│   │   │   └── ui/            # Button, Input, Badge, Card, Table...
│   │   ├── hooks/             # useAuth, useServices, useAppointments...
│   │   ├── store/             # Zustand stores
│   │   └── utils/             # api.js, helpers, constants
│   └── public/
│
└── backend/           # Node.js + Express + MySQL
    └── src/
        ├── routes/            # auth, services, appointments, promotions, reports
        ├── controllers/       # Lógica de negocio
        ├── middleware/        # auth, roles, errorHandler, rateLimiter
        ├── models/            # Queries MySQL
        ├── services/          # email (Nodemailer), 2FA, promotions
        ├── config/            # database, env
        └── utils/             # helpers, validators
```

## 🚀 Tecnologías

### Frontend
- React 18 + React Router 6
- Tailwind CSS
- Zustand (estado global)
- Axios
- Lucide React (íconos)
- React Hot Toast (notificaciones)
- date-fns (fechas)

### Backend
- Node.js + Express
- MySQL2
- JWT + bcrypt (autenticación)
- Nodemailer (correos)
- node-otp / speakeasy (2FA)
- express-rate-limit
- helmet + cors
- express-validator

## ⚙️ Variables de Entorno

### Backend (.env)
```env
PORT=3000
NODE_ENV=production

# Base de datos
DB_HOST=localhost
DB_PORT=3306
DB_NAME=motowash_db
DB_USER=tu_usuario
DB_PASSWORD=tu_password

# JWT
JWT_SECRET=tu_clave_secreta_muy_larga
JWT_EXPIRES_IN=7d

# Correo (Gmail)
MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
MAIL_USER=tucorreo@gmail.com
MAIL_PASS=tu_app_password_de_google
MAIL_FROM=MotoWash <tucorreo@gmail.com>

# Frontend URL
FRONTEND_URL=https://tudominio.com
```

### Frontend (.env)
```env
VITE_API_URL=https://tudominio.com/api
```

## 🗄️ Base de Datos

Ejecutar en orden:
1. `backend/src/config/database.sql` — Crear tablas
2. `backend/src/config/seed.sql` — Datos iniciales

## 📦 Instalación

```bash
# Backend
cd backend
npm install
npm run dev        # desarrollo
npm start          # producción

# Frontend
cd frontend
npm install
npm run dev        # desarrollo
npm run build      # producción (genera /dist)
```

## 🌐 Deploy en Hostinger

1. Subir carpeta `frontend/dist` al public_html
2. Subir carpeta `backend` al servidor Node.js
3. Configurar MySQL en el panel de Hostinger
4. Agregar variables de entorno
5. Iniciar con PM2: `pm2 start src/server.js --name motowash`

## 🔐 Seguridad
- JWT con expiración
- 2FA por correo electrónico
- Rate limiting en login (5 intentos)
- Helmet para headers HTTP
- Bcrypt para contraseñas
- Validación de inputs en backend
- CORS configurado por dominio
