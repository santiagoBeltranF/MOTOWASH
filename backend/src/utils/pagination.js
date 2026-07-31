// Tope duro de filas por pagina. Sin el, un `?limit=999999` obliga al servidor
// a traer la tabla entera a memoria y serializarla a JSON: basta una peticion
// para tumbar el proceso cuando la tabla crece.
export const LIMITE_MAX = 100
export const LIMITE_POR_DEFECTO = 20

// Normaliza los parametros de paginacion que llegan por query string. Todo lo
// que no sea un entero valido cae en el valor por defecto, asi que un
// `?limit=abc` o `?page=-3` ya no producen NaN ni offsets negativos.
export const parsePaginacion = ({ page, limit } = {}) => {
  const paginaNum = Math.max(1, parseInt(page, 10) || 1)
  const limiteNum = Math.min(
    Math.max(1, parseInt(limit, 10) || LIMITE_POR_DEFECTO),
    LIMITE_MAX
  )
  return { page: paginaNum, limit: limiteNum, offset: (paginaNum - 1) * limiteNum }
}

// Devuelve el fragmento `LIMIT n OFFSET m` ya interpolado.
//
// Por que interpolado y no con placeholders: db.js usa pool.execute(), es decir
// sentencias preparadas, y el protocolo de preparadas de MySQL 8 rechaza un
// Number como parametro de LIMIT — devuelve "Incorrect arguments to
// mysqld_stmt_execute". Con `LIMIT ? OFFSET ?` los cuatro endpoints paginados
// respondian 500 siempre (hallazgo C7).
//
// Es seguro porque los dos valores salen de parsePaginacion, que los fuerza a
// enteros acotados (limit 1-100, offset >= 0). Nunca llega texto del usuario a
// la consulta, asi que no hay superficie de inyeccion. Los demas parametros
// siguen yendo por placeholders.
// Envoltorio comun de las respuestas paginadas, para que las tres pantallas del
// panel puedan pintar los mismos controles sin casos especiales.
export const meta = ({ page, limit }, total) => ({
  total,
  page,
  limit,
  totalPages: Math.max(1, Math.ceil(total / limit))
})

export const sqlLimitOffset = ({ limit, offset }) => {
  if (!Number.isInteger(limit) || !Number.isInteger(offset)) {
    throw new Error('sqlLimitOffset requiere enteros producidos por parsePaginacion')
  }
  return ` LIMIT ${limit} OFFSET ${offset}`
}
