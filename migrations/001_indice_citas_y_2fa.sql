-- ===========================================================================
-- 001 — Índice compuesto de citas (M8) y ancho de two_fa_code (M6)
--
-- Vienen de la Fase 3, donde se documentaron como pasos manuales sueltos. Se
-- recogen aquí para que exista un solo sitio donde mirar.
--
-- Ambas son operaciones online en MySQL 8: no bloquean escrituras ni obligan a
-- parar la aplicación.
-- ===========================================================================

SET NAMES utf8mb4;

-- La consulta de cupos filtra por fecha Y hora; con solo idx_appointments_date
-- MySQL recorría todas las citas del día para comparar la hora.
-- Si el índice ya existe, MySQL responde error 1061 y no ocurre nada más.
CREATE INDEX idx_appointments_date_time ON appointments(appointment_date, start_time);

-- El código 2FA se guarda hasheado y un hash bcrypt ocupa 60 caracteres.
-- OBLIGATORIA: sin ella el hash no cabe y el 2FA deja de funcionar.
ALTER TABLE users MODIFY two_fa_code VARCHAR(255);
