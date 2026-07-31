// Lectura del buzon de pruebas (mailpit). Los flujos de registro y 2FA mandan
// un codigo de 6 digitos por correo, asi que sin esto no se pueden recorrer.
const MAILPIT = process.env.MAILPIT_URL || 'http://localhost:8025'

export const vaciarBuzon = async () => {
  await fetch(`${MAILPIT}/api/v1/messages`, { method: 'DELETE' })
}

// Espera a que llegue un correo para `destinatario` y devuelve su codigo de 6
// digitos. Sondea porque el envio es asincrono respecto a la respuesta HTTP.
export const esperarCodigo = async (destinatario, { timeoutMs = 15_000 } = {}) => {
  const limite = Date.now() + timeoutMs
  while (Date.now() < limite) {
    const r = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent('to:' + destinatario)}`)
    if (r.ok) {
      const { messages = [] } = await r.json()
      if (messages.length) {
        const detalle = await (await fetch(`${MAILPIT}/api/v1/message/${messages[0].ID}`)).json()
        const m = (detalle.HTML || detalle.Text || '').match(/(?:class="code">\s*)?(\d{6})/)
        if (m) return m[1]
      }
    }
    await new Promise(r => setTimeout(r, 400))
  }
  throw new Error(`No llego ningun correo con codigo a ${destinatario} en ${timeoutMs}ms`)
}

export const contarCorreos = async (destinatario) => {
  const r = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent('to:' + destinatario)}`)
  if (!r.ok) return 0
  const { messages = [] } = await r.json()
  return messages.length
}
