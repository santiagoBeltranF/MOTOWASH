/**
 * Aritmética de dinero en centavos enteros.
 *
 * Las columnas DECIMAL de MySQL son decimal exacto, no coma flotante, y mysql2
 * las devuelve como cadena («15000.00»). El riesgo no está en la base: está en
 * JavaScript, donde `service.price * (1 - descuento / 100)` es aritmética de
 * coma flotante y puede dejar céntimos perdidos.
 *
 * Aquí todo se convierte a centavos enteros, se opera con enteros, y solo se
 * vuelve a decimal al escribir en la base.
 */

// Convierte «15000.00», 15000 o «15000» a 1500000 centavos.
// El parseo va por BigInt a propósito: pasar por Number aunque sea un instante
// reintroduce justo el problema que este módulo evita.
export const aCentavos = (valor) => {
  if (valor === null || valor === undefined || valor === '') return 0
  const texto = String(valor).trim()
  if (!/^-?\d+(\.\d+)?$/.test(texto)) {
    throw new Error(`Importe no numérico: ${JSON.stringify(valor)}`)
  }
  const negativo = texto.startsWith('-')
  const [entera, decimal = ''] = texto.replace('-', '').split('.')
  const centavos = BigInt(entera) * 100n + BigInt((decimal + '00').slice(0, 2))
  return Number(negativo ? -centavos : centavos)
}

// Vuelve a la cadena decimal que espera la columna: 1500000 -> «15000.00»
export const aDecimal = (centavos) => {
  const n = Math.trunc(centavos)
  const signo = n < 0 ? '-' : ''
  const abs = Math.abs(n)
  return `${signo}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`
}

/**
 * Aplica un descuento porcentual sobre un importe en centavos.
 * El porcentaje puede venir como número o como cadena («20.00»).
 * Redondea al centavo más cercano, con los medios hacia arriba.
 */
export const aplicarDescuentoPorcentaje = (centavos, porcentaje) => {
  const pct = aCentavos(porcentaje)            // 20.00 -> 2000
  if (pct === 0) return centavos
  // descuento = centavos * (pct / 10000), en enteros
  const descuento = Math.round((centavos * pct) / 10000)
  return centavos - descuento
}

// Suma una lista de importes en centavos. Existe para que en el Bloque 2 el
// desglose de un pago mixto se compare con el total sin pasar por decimales.
export const sumar = (...importes) => importes.reduce((t, c) => t + Math.trunc(c), 0)

// Para mostrar: 1500000 -> «$15.000»
export const formatearCOP = (centavos) => {
  const pesos = Math.trunc(Math.abs(centavos) / 100)
  const signo = centavos < 0 ? '-' : ''
  return `${signo}$${pesos.toLocaleString('es-CO')}`
}
