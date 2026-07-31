import { create } from 'zustand'
import api from '../utils/api'

// El token temporal del 2FA se guarda en sessionStorage, no en memoria.
//
// Antes vivia solo en el estado de Zustand: bastaba pulsar F5 en la pantalla
// del codigo —algo natural, por ejemplo para volver a mirar el correo— para que
// se perdiera. A partir de ahi el codigo correcto se rechazaba una y otra vez y
// no habia forma de salir del bucle.
//
// Se elige sessionStorage sobre localStorage porque muere al cerrar la pestana:
// en un equipo compartido no queda un identificador de 2FA a medias reutilizable.
// Y sobre "detectar y devolver al login" porque eso arregla el sintoma pero no
// el caso real: quien recarga quiere continuar donde estaba, no empezar de cero.
// El aviso claro se mantiene igualmente para cuando el estado si sea invalido.
const CLAVE_2FA = 'mw_pending_2fa'

export const useAuthStore = create((set, get) => ({
  user: null,
  token: localStorage.getItem('mw_token'),
  pending2FA: sessionStorage.getItem(CLAVE_2FA),
  loading: true,

  init: async () => {
    const token = localStorage.getItem('mw_token')
    if (!token) { set({ loading: false }); return }
    try {
      const res = await api.get('/auth/me')
      set({ user: res.data.user, loading: false })
    } catch {
      localStorage.removeItem('mw_token')
      set({ user: null, token: null, loading: false })
    }
  },

  login: async (email, password) => {
    const res = await api.post('/auth/login', { email, password })
    if (res.data.requires2FA) {
      sessionStorage.setItem(CLAVE_2FA, res.data.tempToken)
      set({ pending2FA: res.data.tempToken })
      return { requires2FA: true }
    }
    localStorage.setItem('mw_token', res.data.token)
    set({ user: res.data.user, token: res.data.token })
    return { requires2FA: false, user: res.data.user }
  },

  verify2FA: async (code) => {
    const tempToken = get().pending2FA || sessionStorage.getItem(CLAVE_2FA)
    // Si no hay token temporal no tiene sentido llamar al servidor: se avisa
    // aqui con un mensaje que se entienda y la pantalla devuelve al login.
    if (!tempToken) {
      const err = new Error('sin token temporal de 2FA')
      err.sesion2FAPerdida = true
      throw err
    }
    const res = await api.post('/auth/verify-2fa', { tempToken, code })
    localStorage.setItem('mw_token', res.data.token)
    sessionStorage.removeItem(CLAVE_2FA)
    set({ user: res.data.user, token: res.data.token, pending2FA: null })
    return { user: res.data.user }
  },

  descartar2FA: () => {
    sessionStorage.removeItem(CLAVE_2FA)
    set({ pending2FA: null })
  },

  // Refresca los datos del usuario en memoria tras editar el perfil, para que
  // la cabecera y el avatar no sigan mostrando el nombre anterior.
  setUser: (user) => set({ user }),

  logout: () => {
    localStorage.removeItem('mw_token')
    sessionStorage.removeItem(CLAVE_2FA)
    set({ user: null, token: null, pending2FA: null })
    window.location.href = '/login'
  }
}))
