import { api } from './api'

export const notificationService = {
  async list(limit = 40) {
    return await api(`/notifications?limit=${limit}&refresh=1`)
  },

  async markRead(notificationId) {
    return await api('/notifications/mark-read', {
      method: 'POST',
      body: JSON.stringify({ notification_id: notificationId }),
    })
  },

  async markAllRead() {
    return await api('/notifications/mark-all-read', {
      method: 'POST',
      body: JSON.stringify({}),
    })
  },
}

export default notificationService
