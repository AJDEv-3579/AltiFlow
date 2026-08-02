import { api } from './api'

export const userService = {
  async getUsers() {
    return await api('/users')
  },

  async createUser(payload) {
    return await api('/users', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  async getClients() {
    return await api('/clients')
  },

  async createClient(name) {
    return await api('/clients', {
      method: 'POST',
      body: JSON.stringify({ name }),
    })
  },

  async getDeletionRequests() {
    return await api('/deletion-requests')
  },

  async requestDeleteEntity(payload) {
    return await api('/entity-delete-requests', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  async getRecycleBin() {
    return await api('/recycle-bin')
  },

  async restoreRecycleItem(id) {
    return await api(`/recycle-bin/${id}/restore`, { method: 'POST' })
  },
}
