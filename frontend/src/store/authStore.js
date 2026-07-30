import { create } from 'zustand'
import api from '../utils/api'

export const useAuthStore = create((set, get) => ({
  user: null,
  token: localStorage.getItem('mw_token'),
  pending2FA: null,
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
      set({ pending2FA: res.data.tempToken })
      return { requires2FA: true }
    }
    localStorage.setItem('mw_token', res.data.token)
    set({ user: res.data.user, token: res.data.token })
    return { requires2FA: false }
  },

  verify2FA: async (code) => {
    const res = await api.post('/auth/verify-2fa', { tempToken: get().pending2FA, code })
    localStorage.setItem('mw_token', res.data.token)
    set({ user: res.data.user, token: res.data.token, pending2FA: null })
  },

  logout: () => {
    localStorage.removeItem('mw_token')
    set({ user: null, token: null })
    window.location.href = '/login'
  }
}))
