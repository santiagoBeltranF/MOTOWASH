-- ============================================
-- MOTOWASH DATABASE SCHEMA
-- ============================================

CREATE DATABASE IF NOT EXISTS motowash_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE motowash_db;

-- Usuarios
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  role ENUM('admin', 'client') NOT NULL DEFAULT 'client',
  is_active BOOLEAN DEFAULT TRUE,
  two_fa_enabled BOOLEAN DEFAULT TRUE,
  two_fa_code VARCHAR(10),
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

-- Citas
CREATE TABLE IF NOT EXISTS appointments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  client_id INT NOT NULL,
  service_id INT NOT NULL,
  appointment_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  status ENUM('pending', 'confirmed', 'completed', 'cancelled') DEFAULT 'confirmed',
  notes TEXT,
  final_price DECIMAL(10,2),
  discount_applied DECIMAL(5,2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE RESTRICT
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

-- ============================================
-- DATOS INICIALES
-- ============================================

-- Admin por defecto — usuario: admin@motowash.com  /  password: Admin123!
--
-- El hash anterior era un valor de ejemplo copiado de un tutorial y NO
-- correspondia a ninguna contrasena conocida, asi que el admin no podia
-- iniciar sesion en una instalacion limpia. Este si es un hash real de
-- 'Admin123!' (bcrypt, 12 rondas), verificado con bcrypt.compare.
--
-- two_fa_enabled=FALSE solo para este usuario semilla, para poder entrar sin
-- depender de que MAIL_* este configurado. Los clientes que se registran
-- siguen con 2FA activo por el DEFAULT de la tabla.
--
-- ADVERTENCIA: esta contrasena es publica (esta en este archivo, en el repo).
-- Sirve para desarrollo. Cambiala en el primer login y activa el 2FA antes de
-- exponer la aplicacion a internet. Ver README.md.
INSERT INTO users (name, email, password, role, is_active, email_verified, two_fa_enabled) VALUES
('Administrador', 'admin@motowash.com', '$2a$12$XQMCX4jG5Rj/.HX5g.Tfo.msZ4UUAta/LISMtKNupGMcjjcM8/.kO', 'admin', TRUE, TRUE, FALSE);

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

-- Configuración general
INSERT INTO settings (key_name, value, label) VALUES
('business_name', 'MotoWash', 'Nombre del negocio'),
('business_phone', '+57 300 000 0000', 'Teléfono'),
('business_address', 'Calle 10 #5-20, Armenia, Quindío', 'Dirección'),
('max_appointments_per_slot', '2', 'Citas simultáneas por horario'),
('appointment_interval_minutes', '60', 'Intervalo entre citas (minutos)'),
('currency', 'COP', 'Moneda'),
('currency_symbol', '$', 'Símbolo de moneda');
