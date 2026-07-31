-- ===========================================================================
-- 005 — Turno de caja, recibos de venta y cobros
--
-- Es un RECIBO DE VENTA, no una factura: nada de DIAN ni facturación
-- electrónica. Las tablas se llaman `receipts` a propósito, para dejar libre
-- el nombre `invoices` el día que sí haga falta.
-- ===========================================================================

SET NAMES utf8mb4;

-- ---------------------------------------------------------------------------
-- Turnos de caja
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cash_shifts (
  id INT AUTO_INCREMENT PRIMARY KEY,

  -- Día de operación al que pertenece el turno. Un turno pertenece a UNO solo:
  -- no se arrastra al día siguiente.
  operation_date DATE NOT NULL,

  opened_by INT NOT NULL,
  opened_at DATETIME NOT NULL,
  opening_amount DECIMAL(12,2) NOT NULL,

  status ENUM('open','closed') NOT NULL DEFAULT 'open',

  closed_by INT NULL,
  -- Cuándo se cerró DE VERDAD. Si es de un día posterior a operation_date, el
  -- cierre fue tardío y queda registrado como tal.
  closed_at DATETIME NULL,
  was_late_close BOOLEAN NOT NULL DEFAULT FALSE,

  -- Conteo real declarado por quien cierra, y lo que la caja debería tener.
  -- El arqueo es SOLO sobre efectivo: una transferencia no pasa por el cajón.
  counted_amount  DECIMAL(12,2) NULL,
  expected_amount DECIMAL(12,2) NULL,
  difference_amount DECIMAL(12,2) NULL,
  closing_notes TEXT NULL,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- Garantiza a nivel de base que no haya dos turnos abiertos a la vez. La
  -- columna vale 1 mientras el turno esté abierto y NULL cuando se cierra, y
  -- MySQL admite varios NULL en un índice único: así los turnos cerrados no
  -- chocan entre sí. Hacerlo aquí y no solo en el código evita que dos
  -- peticiones simultáneas abran dos cajas.
  open_marker TINYINT GENERATED ALWAYS AS (CASE WHEN status = 'open' THEN 1 ELSE NULL END) STORED,
  UNIQUE KEY uq_un_solo_turno_abierto (open_marker),

  FOREIGN KEY (opened_by) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (closed_by) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE INDEX idx_cash_shifts_fecha ON cash_shifts(operation_date);
CREATE INDEX idx_cash_shifts_estado ON cash_shifts(status);

-- ---------------------------------------------------------------------------
-- Consecutivo de recibos: global y continuo
-- ---------------------------------------------------------------------------
-- Una sola fila. Se bloquea con SELECT ... FOR UPDATE dentro de la misma
-- transacción que inserta el recibo, así que el número no se salta ni se
-- repite: si la transacción se deshace, el número vuelve a quedar libre.
--
-- No se usa AUTO_INCREMENT porque deja huecos en cada transacción fallida, y
-- un consecutivo contable con huecos es justo lo que no se quiere.
CREATE TABLE IF NOT EXISTS receipt_sequence (
  id TINYINT PRIMARY KEY DEFAULT 1,
  last_number INT UNSIGNED NOT NULL DEFAULT 0,
  CHECK (id = 1)
);
INSERT IGNORE INTO receipt_sequence (id, last_number) VALUES (1, 0);

-- ---------------------------------------------------------------------------
-- Recibos
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS receipts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  receipt_number INT UNSIGNED NOT NULL UNIQUE,

  shift_id INT NOT NULL,
  appointment_id INT NULL,
  client_id INT NOT NULL,

  -- Congelados en el momento del cobro. Si mañana el cliente cambia de nombre
  -- o la moto de placa, el recibo tiene que seguir diciendo lo que decía.
  client_name VARCHAR(100) NOT NULL,
  plate VARCHAR(10) NULL,

  subtotal_amount DECIMAL(12,2) NOT NULL,
  discount_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  -- Obligatorio si hay descuento. El cajero puede descontar, nunca recargar.
  discount_reason VARCHAR(200) NULL,
  total_amount DECIMAL(12,2) NOT NULL,

  status ENUM('issued','voided') NOT NULL DEFAULT 'issued',
  -- Un cobro no se borra nunca: se anula dejando rastro.
  voided_by INT NULL,
  voided_at DATETIME NULL,
  void_reason VARCHAR(200) NULL,

  charged_by INT NOT NULL,
  issued_at DATETIME NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (shift_id) REFERENCES cash_shifts(id) ON DELETE RESTRICT,
  FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE SET NULL,
  FOREIGN KEY (client_id) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (charged_by) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (voided_by) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE INDEX idx_receipts_turno ON receipts(shift_id);
CREATE INDEX idx_receipts_fecha ON receipts(issued_at);
CREATE INDEX idx_receipts_estado ON receipts(status);
CREATE INDEX idx_receipts_placa ON receipts(plate);

-- ---------------------------------------------------------------------------
-- Líneas del recibo: el precio queda CONGELADO aquí
-- ---------------------------------------------------------------------------
-- Nada de consultar service_prices al reimprimir o al hacer el reporte. Si
-- mañana cambia la tarifa de una categoría, el historial contable no puede
-- reescribirse hacia atrás. Por eso se copian tambien los nombres: renombrar
-- un servicio no debe cambiar lo que dice un recibo de hace un año.
CREATE TABLE IF NOT EXISTS receipt_lines (
  id INT AUTO_INCREMENT PRIMARY KEY,
  receipt_id INT NOT NULL,

  service_id INT NULL,
  service_name VARCHAR(100) NOT NULL,
  category_id INT NULL,
  category_name VARCHAR(60) NULL,

  quantity INT NOT NULL DEFAULT 1,
  unit_amount DECIMAL(12,2) NOT NULL,
  line_amount DECIMAL(12,2) NOT NULL,

  FOREIGN KEY (receipt_id) REFERENCES receipts(id) ON DELETE CASCADE,
  FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE SET NULL,
  FOREIGN KEY (category_id) REFERENCES motorcycle_categories(id) ON DELETE SET NULL
);

CREATE INDEX idx_receipt_lines_recibo ON receipt_lines(receipt_id);

-- ---------------------------------------------------------------------------
-- Desglose del pago
-- ---------------------------------------------------------------------------
-- El mixto guarda las dos partes, no solo el total: sin esto el arqueo de caja
-- no puede saber cuánto entró en efectivo. La suma de las líneas tiene que dar
-- exactamente el total del recibo, y eso se valida en centavos enteros.
CREATE TABLE IF NOT EXISTS receipt_payments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  receipt_id INT NOT NULL,
  method ENUM('cash','transfer') NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  FOREIGN KEY (receipt_id) REFERENCES receipts(id) ON DELETE CASCADE
);

CREATE INDEX idx_receipt_payments_recibo ON receipt_payments(receipt_id);

-- ---------------------------------------------------------------------------
-- Enlace desde la cita
-- ---------------------------------------------------------------------------
-- Se guarda el recibo, no una bandera: un booleano puede desincronizarse, una
-- clave ajena no. Al anular un cobro se pone a NULL y la cita vuelve a poder
-- cobrarse.
ALTER TABLE appointments
  ADD COLUMN paid_receipt_id INT NULL AFTER attended_by,
  ADD CONSTRAINT fk_appointments_receipt FOREIGN KEY (paid_receipt_id) REFERENCES receipts(id) ON DELETE SET NULL;
