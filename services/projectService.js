import { api } from './api'

export const projectService = {
  async getProjects() {
    return await api('/projects')
  },

  async getClientProjects() {
    return await api('/client-projects')
  },

  async getProjectById(id) {
    return await api(`/projects/${id}`)
  },

  async createProject(payload) {
    return await api('/client-projects', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  async updateProjectInfo(id, payload) {
    return await api(`/client-projects/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    })
  },

  async deleteProject(id) {
    return await api(`/client-projects/${id}`, { method: 'DELETE' })
  },

  async getAssignedUsers(projectId) {
    return await api(`/projects/${projectId}/assigned-users`)
  },

  async assignUsers(projectId, userIds) {
    return await api(`/projects/${projectId}/assign-users`, {
      method: 'POST',
      body: JSON.stringify({ user_ids: userIds }),
    })
  },

  async getProjectActivityLogs(projectId, filters = {}) {
    const query = new URLSearchParams(filters).toString()
    return await api(`/projects/${projectId}/activity-log?${query}`)
  },

  async getAuditLogs() {
    return await api('/audit-logs')
  },
}
