# Migraciones

`backend/src/config/database.sql` solo se ejecuta en el **primer** arranque, con el volumen
vacío. Todo cambio de esquema posterior vive aquí, numerado, y se aplica a mano sobre una
base que ya tiene datos.

```bash
docker compose exec -T db mysql -u root -p"$MYSQL_ROOT_PASSWORD" motowash_db < migrations/003_rol_cajero_e_invitados.sql
```

Se aplican **en orden** y **una sola vez**. Haz un volcado antes:
`docker compose exec db mysqldump -u root -p motowash_db > respaldo.sql`

| Archivo | Qué hace | Repetible |
|---|---|---|
| `001_indice_citas_y_2fa.sql` | Índice compuesto de citas (M8) y `two_fa_code` a 255 (M6) | Sí |
| `002_reparar_tildes.sql` | Repara los datos iniciales doble-codificados (E4) | **NO** |
| `003_rol_cajero_e_invitados.sql` | Rol `cashier` y clientes invitados | Sí |
| `004_placa_y_categorias.sql` | Placa, categorías de moto y precio por categoría | Sí |

«Repetible» significa que volver a ejecutarla no rompe nada. `002` **corrompe los datos si
se ejecuta dos veces**: lleva su propia comprobación previa, léela antes de lanzarla.

Una instalación nueva no necesita ninguna: `database.sql` ya trae el esquema final.
