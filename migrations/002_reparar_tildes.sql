-- ===========================================================================
-- 002 — Repara los datos iniciales con tildes doble-codificadas (E4)
--
-- ⚠️  NO ES REPETIBLE. Ejecutarla dos veces vuelve a corromper los datos.
--
-- El origen: database.sql está en UTF-8, pero MySQL lo ejecutaba con
-- character_set_client = latin1 y guardaba los bytes doble-codificados
-- («Lavado BÃ¡sico»). La causa ya está corregida —SET NAMES utf8mb4 al
-- principio del script y --character-set-server=utf8mb4 en el servicio db—,
-- así que las instalaciones nuevas nacen bien y NO deben ejecutar esto.
--
-- ANTES DE LANZARLA, comprueba si te afecta:
--
--   SELECT name FROM services WHERE name LIKE '%Ã%' OR name LIKE '%Â%';
--
-- Si no devuelve filas, tus datos están sanos: NO ejecutes este archivo.
-- ===========================================================================

SET NAMES utf8mb4;

UPDATE services SET
  name        = CONVERT(BINARY(CONVERT(name        USING latin1)) USING utf8mb4),
  description = CONVERT(BINARY(CONVERT(description USING latin1)) USING utf8mb4)
  WHERE name LIKE '%Ã%' OR description LIKE '%Ã%';

UPDATE settings SET
  value = CONVERT(BINARY(CONVERT(value USING latin1)) USING utf8mb4)
  WHERE value LIKE '%Ã%';
