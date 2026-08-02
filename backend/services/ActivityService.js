import { ActivityRepository } from '../repositories/ActivityRepository'
import { ProjectRepository } from '../repositories/ProjectRepository'
import { JobRepository } from '../repositories/JobRepository'
import { UserRepository } from '../repositories/UserRepository'
import { CLIENT_ROLES, INTERNAL_ROLES } from '../constants/backendRoles'

export class ActivityService {
  static async listAuditLogs(user, { from, to }) {
    if (!INTERNAL_ROLES.includes(user.role)) throw { message: 'Forbidden', status: 403 }
    const logs = await ActivityRepository.getAuditLogs(from, to)
    return { logs }
  }

  static async getProjectActivityLog(user, projectId) {
    let proj = await ProjectRepository.findClientProjectById(projectId, CLIENT_ROLES.includes(user.role) ? user.client_id : null)
    if (!proj) throw { message: 'Project not found or access denied', status: 404 }

    const projectJobs = await JobRepository.getJobsByProject(projectId, 0, 500)
    const jobIds = projectJobs.map(j => j.id)
    const jobById = Object.fromEntries(projectJobs.map(j => [j.id, j]))

    const commentsByJob = await JobRepository.getJobComments(jobIds, 500)
    const allComments = Object.values(commentsByJob).flat()

    const allUserIds = [
      ...new Set([
        ...allComments.map(c => c.user_id).filter(Boolean),
        ...projectJobs.map(j => j.created_by).filter(Boolean),
      ])
    ]

    const userRows = allUserIds.length > 0 ? await UserRepository.getAllUsers('id, username, role, client_id') : []
    const userMap = Object.fromEntries(userRows.map(u => [u.id, u]))

    const CLIENT_ROLE_VALUES = ['Client-Admin', 'Client-User']
    const logs = []
    const seen = new Set()

    for (const c of allComments) {
      if (seen.has(c.id)) continue
      const u = userMap[c.user_id]
      if (!u || !CLIENT_ROLE_VALUES.includes(u.role)) continue
      if (u.client_id !== proj.client_id) continue
      const job = jobById[c.job_id]
      seen.add(c.id)
      logs.push({
        id: c.id,
        username: c.username || u.username,
        role: u.role,
        activity_type: c.stage === 'Created' ? 'Job Created' : 'Comment',
        action_desc: c.stage === 'Created'
          ? `Created job card: ${job?.title || c.job_id} [${job?.category || 'Stand Count'}]`
          : `${c.comment}`,
        field_name: job?.title || null,
        category: job?.category || null,
        job_card_id: c.job_id,
        timestamp: c.created_at,
      })
    }

    for (const j of projectJobs) {
      if (!j.created_by) continue
      const creatorKey = `created-${j.id}`
      if (seen.has(creatorKey)) continue
      const u = userMap[j.created_by]
      if (!u || !CLIENT_ROLE_VALUES.includes(u.role)) continue
      if (u.client_id !== proj.client_id) continue
      seen.add(creatorKey)
      logs.push({
        id: creatorKey,
        username: u.username,
        role: u.role,
        activity_type: 'Job Created',
        action_desc: `Uploaded field data for ${j.title} [${j.category || 'Stand Count'}]`,
        field_name: j.title,
        category: j.category || 'Stand Count',
        job_card_id: j.id,
        timestamp: j.created_at,
      })
    }

    logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    return { logs, project_id: projectId }
  }
}
