import { api } from './api'

export const ticketService = {
  async getTickets() {
    return await api('/support-tickets')
  },

  async createTicket(payload) {
    return await api('/support-tickets', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  async updateTicketStatus(id, status) {
    return await api(`/support-tickets/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    })
  },

  async getTicketComments(ticketId) {
    return await api(`/support-tickets/${ticketId}/comments`)
  },

  async postTicketComment(ticketId, comment, parentId = null) {
    return await api(`/support-tickets/${ticketId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ comment, parent_id: parentId }),
    })
  },

  async deleteTicket(id) {
    return await api(`/support-tickets/${id}`, { method: 'DELETE' })
  },
}
