-- ===========================================================================
-- 004 — Placa, categorías de moto y precio por categoría
--
-- Un mismo lavado no cuesta igual en una scooter que en una de alto cilindraje.
-- service_prices pasa a ser el precio efectivo; services.price se queda como
-- respaldo y valor por defecto, para no romper lo que ya existe.
--
-- Se siembra el precio actual para TODAS las categorías, incluida la que nace
-- inactiva: así activarla el día de mañana es cambiar una bandera y no volver a
-- migrar. Ningún importe se mueve al aplicar esta migración.
-- ===========================================================================

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS motorcycle_categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(60)  NOT NULL UNIQUE,
  description VARCHAR(200),
  sort_order  TINYINT      NOT NULL DEFAULT 0,
  is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO motorcycle_categories (name, description, sort_order, is_active) VALUES
  ('Scooter', 'Automáticas tipo scooter',      1, TRUE),
  ('Baja',    'Hasta 150cc',                   2, TRUE),
  ('Media',   'De 151cc a 350cc',              3, FALSE),
  ('Alta',    'Más de 350cc',                  4, TRUE);

CREATE TABLE IF NOT EXISTS service_prices (
  service_id  INT NOT NULL,
  category_id INT NOT NULL,
  price       DECIMAL(10,2) NOT NULL,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (service_id, category_id),
  FOREIGN KEY (service_id)  REFERENCES services(id)              ON DELETE CASCADE,
  FOREIGN KEY (category_id) REFERENCES motorcycle_categories(id) ON DELETE CASCADE
);

-- Cada servicio arranca con su precio actual en las cuatro categorías.
INSERT IGNORE INTO service_prices (service_id, category_id, price)
  SELECT s.id, c.id, s.price FROM services s CROSS JOIN motorcycle_categories c;

ALTER TABLE appointments
  -- Se guarda normalizada: mayúsculas, sin espacios ni guiones.
  ADD COLUMN plate       VARCHAR(10) NULL AFTER service_id,
  ADD COLUMN category_id INT         NULL AFTER plate,
  -- Quién creó la cita y desde dónde. Sin esto el reporte contable no puede
  -- decir cuántas citas entraron por mostrador y cuántas por autoservicio.
  ADD COLUMN created_by  INT         NULL AFTER notes,
  ADD COLUMN source ENUM('client','panel') NOT NULL DEFAULT 'client' AFTER created_by,
  -- Marca las citas creadas por encima de max_appointments_per_slot. El panel
  -- exige confirmación explícita antes de ponerla en TRUE.
  ADD COLUMN is_overbooked BOOLEAN NOT NULL DEFAULT FALSE AFTER source,
  -- Quién atendió el lavado. NADIE LA ESCRIBE TODAVÍA: se reserva para el día
  -- que haya comisiones por lavador. No la leas esperando datos fiables.
  ADD COLUMN attended_by INT NULL AFTER is_overbooked,
  ADD CONSTRAINT fk_appointments_category    FOREIGN KEY (category_id) REFERENCES motorcycle_categories(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_appointments_created_by  FOREIGN KEY (created_by)  REFERENCES users(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_appointments_attended_by FOREIGN KEY (attended_by) REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX idx_appointments_plate ON appointments(plate);
