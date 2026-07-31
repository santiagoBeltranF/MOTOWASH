-- ============================================
-- MOTOWASH DATABASE SCHEMA
-- ============================================

-- OBLIGATORIO y tiene que ir lo primero.
--
-- Este archivo esta guardado en UTF-8, pero el cliente de MySQL arranca con
-- character_set_client = latin1. Sin esta linea, el servidor interpreta como
-- latin1 los bytes UTF-8 de los datos iniciales y los guarda doble-codificados
-- en columnas utf8mb4: "Lavado Básico" acababa almacenado como "Lavado BÃ¡sico"
-- y asi se mostraba a todos los clientes.
SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE DATABASE IF NOT EXISTS motowash_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE motowash_db;

-- Usuarios
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  -- email y password admiten NULL porque un INVITADO no tiene credenciales.
  -- MySQL permite varios NULL en un indice UNIQUE, asi que N invitados sin
  -- correo conviven sin chocar.
  email VARCHAR(150) NULL UNIQUE,
  password VARCHAR(255) NULL,
  phone VARCHAR(20),
  document_id VARCHAR(30),
  role ENUM('admin', 'cashier', 'client') NOT NULL DEFAULT 'client',
  -- Cliente creado desde el mostrador, sin cuenta. Convertirlo en cuenta es
  -- rellenar email/password y bajar esta bandera: el id no cambia y conserva
  -- todo su historial.
  is_guest BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  two_fa_enabled BOOLEAN DEFAULT TRUE,
  -- Guarda el hash bcrypt del codigo, no el codigo (hallazgo M6). Un hash
  -- bcrypt ocupa 60 caracteres, de ahi el ancho.
  --
  -- Para una instalacion que ya tiene datos, este archivo no se vuelve a
  -- ejecutar (solo corre con el volumen vacio). Aplicalo a mano:
  --   docker compose exec db mysql -u root -p motowash_db \
  --     -e "ALTER TABLE users MODIFY two_fa_code VARCHAR(255);"
  two_fa_code VARCHAR(255),
  two_fa_expires DATETIME,
  email_verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Servicios
CREATE TABLE IF NOT EXISTS services (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  price DECIMAL(10,2) NOT NULL,
  duration_minutes INT NOT NULL DEFAULT 60,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Configuración de horarios por día
CREATE TABLE IF NOT EXISTS schedule_config (
  id INT AUTO_INCREMENT PRIMARY KEY,
  day_of_week TINYINT NOT NULL COMMENT '0=Domingo, 1=Lunes ... 6=Sábado',
  is_open BOOLEAN DEFAULT TRUE,
  open_time TIME NOT NULL DEFAULT '08:00:00',
  close_time TIME NOT NULL DEFAULT '18:00:00',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_day (day_of_week)
);

-- Configuración general del negocio
CREATE TABLE IF NOT EXISTS settings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  key_name VARCHAR(100) NOT NULL UNIQUE,
  value TEXT NOT NULL,
  label VARCHAR(150),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Categorias de moto. Un mismo lavado no cuesta igual en una scooter que en
-- una de alto cilindraje.
CREATE TABLE IF NOT EXISTS motorcycle_categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(60) NOT NULL UNIQUE,
  description VARCHAR(200),
  sort_order TINYINT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Precio efectivo por servicio y categoria. services.price se conserva como
-- respaldo y valor por defecto.
CREATE TABLE IF NOT EXISTS service_prices (
  service_id INT NOT NULL,
  category_id INT NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (service_id, category_id),
  FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE,
  FOREIGN KEY (category_id) REFERENCES motorcycle_categories(id) ON DELETE CASCADE
);

-- Citas
CREATE TABLE IF NOT EXISTS appointments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  client_id INT NOT NULL,
  service_id INT NOT NULL,
  -- Normalizada: mayusculas, sin espacios ni guiones.
  plate VARCHAR(10),
  category_id INT,
  appointment_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  status ENUM('pending', 'confirmed', 'completed', 'cancelled') DEFAULT 'confirmed',
  notes TEXT,
  final_price DECIMAL(10,2),
  discount_applied DECIMAL(5,2) DEFAULT 0,
  created_by INT,
  source ENUM('client','panel') NOT NULL DEFAULT 'client',
  -- Creada por encima de max_appointments_per_slot. El panel exige confirmacion
  -- explicita antes de ponerla en TRUE; el autoservicio nunca puede.
  is_overbooked BOOLEAN NOT NULL DEFAULT FALSE,
  -- Quien atendio el lavado. NADIE LA ESCRIBE TODAVIA: reservada para el dia
  -- que haya comisiones por lavador.
  attended_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE RESTRICT,
  FOREIGN KEY (category_id) REFERENCES motorcycle_categories(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (attended_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Promociones
CREATE TABLE IF NOT EXISTS promotions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(150) NOT NULL,
  description TEXT,
  discount_percent DECIMAL(5,2) NOT NULL,
  starts_at DATETIME NOT NULL,
  ends_at DATETIME NOT NULL,
  applies_to ENUM('all', 'specific') DEFAULT 'all',
  is_active BOOLEAN DEFAULT TRUE,
  email_sent BOOLEAN DEFAULT FALSE,
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Servicios específicos de una promoción
CREATE TABLE IF NOT EXISTS promotion_services (
  promotion_id INT NOT NULL,
  service_id INT NOT NULL,
  PRIMARY KEY (promotion_id, service_id),
  FOREIGN KEY (promotion_id) REFERENCES promotions(id) ON DELETE CASCADE,
  FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE
);

-- Log de correos enviados
CREATE TABLE IF NOT EXISTS email_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  recipient_email VARCHAR(150) NOT NULL,
  subject VARCHAR(255),
  type ENUM('2fa', 'appointment_confirm', 'appointment_cancel', 'promotion', 'welcome') NOT NULL,
  status ENUM('sent', 'failed') DEFAULT 'sent',
  sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- ÍNDICES
-- ============================================
CREATE INDEX idx_appointments_date ON appointments(appointment_date);
CREATE INDEX idx_appointments_client ON appointments(client_id);
CREATE INDEX idx_appointments_status ON appointments(status);
CREATE INDEX idx_promotions_dates ON promotions(starts_at, ends_at);

-- Indice compuesto para la consulta de cupos, que filtra por fecha Y hora
-- (appointmentController: comprobacion de disponibilidad al agendar y al
-- reagendar). Con solo idx_appointments_date, MySQL filtraba por dia y luego
-- recorria todas las citas de ese dia para comparar la hora.
--
-- OJO: este archivo solo se ejecuta en el PRIMER arranque, con el volumen
-- vacio. Para aplicarlo sobre una instalacion que ya tiene datos, sin
-- perderlos:
--
--   docker compose exec db mysql -u root -p motowash_db \
--     -e "CREATE INDEX idx_appointments_date_time ON appointments(appointment_date, start_time);"
--
-- Es una operacion online en MySQL 8 (ALGORITHM=INPLACE por defecto para
-- anadir un indice secundario): no bloquea escrituras ni requiere parar la
-- aplicacion. Si el indice ya existe, MySQL responde con error 1061 y no pasa
-- nada mas.
CREATE INDEX idx_appointments_date_time ON appointments(appointment_date, start_time);
CREATE INDEX idx_appointments_plate ON appointments(plate);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_phone ON users(phone);

-- ============================================
-- DATOS INICIALES
-- ============================================

-- El usuario administrador NO se crea aqui a proposito.
--
-- Antes iba como INSERT en este archivo, con el hash bcrypt escrito al lado de
-- la contrasena en claro dentro de un comentario. Eso metia una credencial en
-- el repositorio: cualquiera que viera el codigo tenia acceso al panel.
--
-- Ahora lo crea src/config/bootstrapAdmin.js en el arranque, leyendo
-- ADMIN_EMAIL y ADMIN_PASSWORD del entorno y hasheando en runtime. Es
-- idempotente: si el usuario ya existe, no lo toca. Ver README.md.

-- Servicios por defecto
INSERT INTO services (name, description, price, duration_minutes) VALUES
('Lavado Básico', 'Lavado exterior completo con agua a presión', 15000, 60),
('Lavado Completo', 'Lavado exterior + limpieza de motor y cadena', 25000, 90),
('Lavado + Encerado', 'Lavado completo + encerado y pulido', 40000, 120),
('Lavado Express', 'Lavado rápido exterior básico', 10000, 30),
('Detallado Profesional', 'Limpieza profunda de todos los componentes', 60000, 180);

-- Horario por defecto (Lunes a Sábado 8am-6pm, Domingo cerrado)
INSERT INTO schedule_config (day_of_week, is_open, open_time, close_time) VALUES
(0, FALSE, '08:00:00', '18:00:00'),
(1, TRUE,  '08:00:00', '18:00:00'),
(2, TRUE,  '08:00:00', '18:00:00'),
(3, TRUE,  '08:00:00', '18:00:00'),
(4, TRUE,  '08:00:00', '18:00:00'),
(5, TRUE,  '08:00:00', '18:00:00'),
(6, TRUE,  '08:00:00', '14:00:00');

-- Categorias de moto. «Media» nace inactiva: si el negocio la pide, se activa
-- desde la aplicacion sin necesidad de migrar.
INSERT INTO motorcycle_categories (name, description, sort_order, is_active) VALUES
('Scooter', 'Automáticas tipo scooter', 1, TRUE),
('Baja',    'Hasta 150cc',              2, TRUE),
('Media',   'De 151cc a 350cc',         3, FALSE),
('Alta',    'Más de 350cc',             4, TRUE);

-- Cada servicio arranca con su precio actual en las cuatro categorias, tambien
-- en la inactiva, para que activarla no requiera migracion.
INSERT INTO service_prices (service_id, category_id, price)
  SELECT s.id, c.id, s.price FROM services s CROSS JOIN motorcycle_categories c;

-- Configuración general
INSERT INTO settings (key_name, value, label) VALUES
('business_name', 'MotoWash', 'Nombre del negocio'),
('business_phone', '+57 300 000 0000', 'Teléfono'),
('business_address', 'Calle 10 #5-20, Armenia, Quindío', 'Dirección'),
('max_appointments_per_slot', '2', 'Citas simultáneas por horario'),
('appointment_interval_minutes', '60', 'Intervalo entre citas (minutos)'),
('currency', 'COP', 'Moneda'),
('currency_symbol', '$', 'Símbolo de moneda');
