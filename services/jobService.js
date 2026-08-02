import { api } from './api'

export const jobService = {
  async getJobsByProject(projectId) {
    return await api(`/client-projects/${projectId}/jobs`)
  },

  async createJob(projectId, payload) {
    return await api(`/client-projects/${projectId}/jobs`, {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  async updateJob(projectId, jobId, patch) {
    return await api(`/client-projects/${projectId}/jobs/${jobId}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    })
  },

  async deleteJob(projectId, jobId) {
    return await api(`/client-projects/${projectId}/jobs/${jobId}`, {
      method: 'DELETE',
    })
  },

  async addJobComment(projectId, jobId, comment, stage = 'General') {
    return await api(`/client-projects/${projectId}/jobs/${jobId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ comment, stage }),
    })
  },

  async getAssignedJobs() {
    return await api('/jobs/assigned')
  },
}
