import { api, setToken, clearToken } from './api'

export const authService = {
  async login(username, password) {
    const res = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    })
    if (res.token) setToken(res.token)
    return res.user
  },

  async getMe() {
    const res = await api('/auth/me')
    return res.user
  },

  async updateProfile({ full_name, phone }) {
    const res = await api('/auth/update-profile', {
      method: 'POST',
      body: JSON.stringify({ full_name, phone }),
    })
    return res.user
  },

  async changeUsername(newUsername) {
    const res = await api('/auth/change-username', {
      method: 'POST',
      body: JSON.stringify({ new_username: newUsername }),
    })
    return res
  },

  async changePassword({ currentPassword, newPassword, keyFileContent }) {
    const res = await api('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({
        current_password: currentPassword,
        new_password: newPassword,
        key_file_content: keyFileContent,
      }),
    })
    return res
  },

  logout() {
    clearToken()
    if (typeof window !== 'undefined') {
      localStorage.removeItem('altiflow_ca_screen')
      localStorage.removeItem('altiflow_ca_project')
      localStorage.removeItem('altiflow_cu_screen')
      localStorage.removeItem('altiflow_cu_project')
      localStorage.removeItem('altiflow_admin_active_proj')
      localStorage.removeItem('altiflow_admin_active_client_proj')
      localStorage.removeItem('altiflow_admin_tab')
    }
  },
}
