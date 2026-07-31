import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 15000,
  headers: {
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache'
  }
})

api.interceptors.request.use(config => {
  const token = localStorage.getItem('mw_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  res => res,
  err => {
    // Solo se cierra la sesion cuando el backend dice explicitamente que la
    // sesion ya no vale (token ausente, invalido o caducado).
    //
    // Antes se redirigia ante CUALQUIER 401, y varios endpoints usan 401 para
    // errores normales del usuario: credenciales incorrectas, codigo de 2FA
    // equivocado, contrasena actual incorrecta. La recarga borraba el mensaje
    // antes de que llegara a verse, incluido el aviso de intentos restantes.
    if (err.response?.status === 401 && err.response?.data?.code === 'SESION_INVALIDA') {
      localStorage.removeItem('mw_token')
      sessionStorage.removeItem('mw_pending_2fa')
      window.location.href = '/login'
    }
    // Cualquier otro error, 401 incluido, se propaga para que la pantalla lo
    // muestre con su propio toast.
    return Promise.reject(err)
  }
)

export default api