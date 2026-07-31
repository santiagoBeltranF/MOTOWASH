-- ===========================================================================
-- 003 — Rol de cajero y clientes invitados
--
-- Un INVITADO es un usuario real con is_guest = TRUE y sin credenciales:
-- password NULL y, si no lo dio, email NULL. Se crea desde el mostrador para
-- atender a quien llega sin cuenta.
--
-- Que sea un usuario real y no unos campos sueltos en la cita es lo que hace
-- que el historial, la placa y los reportes funcionen igual que con un cliente
-- registrado. Convertirlo a cuenta normal es rellenar email y password y bajar
-- la bandera: el id NO cambia, así que no se pierde nada de su historial.
--
-- email sigue siendo UNIQUE. MySQL admite varios NULL en un índice único, así
-- que N invitados sin correo conviven sin chocar entre sí.
-- ===========================================================================

SET NAMES utf8mb4;

ALTER TABLE users
  MODIFY role ENUM('admin','cashier','client') NOT NULL DEFAULT 'client',
  MODIFY email    VARCHAR(150) NULL,
  MODIFY password VARCHAR(255) NULL,
  ADD COLUMN is_guest    BOOLEAN     NOT NULL DEFAULT FALSE AFTER role,
  ADD COLUMN document_id VARCHAR(30) NULL     AFTER phone;

CREATE INDEX idx_users_role  ON users(role);
CREATE INDEX idx_users_phone ON users(phone);
