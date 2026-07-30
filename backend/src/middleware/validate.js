import { validationResult } from 'express-validator'

// Sin esto, las cadenas de express-validator anotan los errores en la request y
// nadie los lee: el controlador sigue como si nada. Era el hallazgo C3 — habia
// validadores declarados en /auth/register desde el principio, pero ninguna
// ruta estaba realmente validada.
//
// La respuesta mantiene `message` en la raiz porque es lo que el frontend
// muestra en todas sus pantallas (`err.response?.data?.message`). `errors` va
// aparte, con el detalle por campo, para quien lo necesite.
export const validar = (req, res, next) => {
  const resultado = validationResult(req)
  if (resultado.isEmpty()) return next()

  const errores = resultado.array()
  return res.status(400).json({
    message: errores[0].msg,
    errors: errores.map(e => ({ campo: e.path, mensaje: e.msg }))
  })
}
