import { v4 as uuidv4 } from 'uuid'
import { ProjectRepository } from '../repositories/ProjectRepository'
import { UserRepository } from '../repositories/UserRepository'
import { ActivityRepository } from '../repositories/ActivityRepository'
import { CLIENT_ROLES, INTERNAL_ROLES, ADMIN, SUPER_ADMIN, CLIENT_ADMIN } from '../constants/backendRoles'

export class ProjectService {
  static async calculateSlaDeadline(clientId, uploadTs) {
    const startOfDay = new Date(uploadTs); startOfDay.setHours(0, 0, 0, 0)
    const endOfDay = new Date(uploadTs); endOfDay.setHours(23, 59, 59, 999)
    const dailyCount = await ProjectRepository.countProjectsByClientAndDate(clientId, startOfDay.toISOString(), endOfDay.toISOString())
    const total = dailyCount + 1
    let hours = 24
    if (total >= 3 && total <= 4) hours = 48
    else if (total > 4) hours = 72
    return { deadline: new Date(uploadTs.getTime() + hours * 3600000), hours, dailyCount: total }
  }

  static async listLegacyProjects(user, { page, limit, from, to }) {
    const projects = await ProjectRepository.getLegacyProjects({ user, from, to })
    const clientIds = [...new Set(projects.map(p => p.client_id).filter(Boolean))]
    const clients = await ProjectRepository.getClientsByIds(clientIds)
    const users = await UserRepository.getAllUsers('id, username')
    
    const cmap = Object.fromEntries(clients.map(c => [c.id, c]))
    const umap = Object.fromEntries(users.map(u => [u.id, u]))
    const enriched = projects.map(p => {
      const result = { ...p, client_name: cmap[p.client_id]?.name || 'Unknown' }
      if (!CLIENT_ROLES.includes(user.role)) result.assignee_name = umap[p.assigned_to]?.username || null
      return result
    })
    return { projects: enriched, page, limit }
  }

  static async createLegacyProject(user, body) {
    if (user.role !== SUPER_ADMIN) throw { message: 'Forbidden — only Super-Admin can create projects', status: 403 }
    const clientId = CLIENT_ROLES.includes(user.role) ? user.client_id : body.client_id
    if (!clientId) throw { message: 'client_id required', status: 400 }

    const title = (body.title || `Project ${new Date().toLocaleDateString()}`).trim()
    const drone_name = (body.drone_name || '').trim()
    const capture_date = body.capture_date
    const image_count = parseInt(body.image_count, 10)
    const csv_count = parseInt(body.csv_count, 10)
    const base_rover_bool = !!body.base_rover_bool
    const grid_file_bool = !!body.grid_file_bool

    if (!drone_name || !capture_date || isNaN(image_count) || isNaN(csv_count)) {
      throw { message: 'drone_name, capture_date, image_count, csv_count are required', status: 400 }
    }

    const upload_timestamp = new Date()
    const { deadline, hours, dailyCount } = await ProjectService.calculateSlaDeadline(clientId, upload_timestamp)
    let status = 'Pending'
    let assigned_to = null
    let refly_reason = null

    if ((image_count - csv_count) > 10 && !base_rover_bool) {
      status = 'Failed_Refly'
      const admins = await UserRepository.getAdmins()
      if (admins.length > 0) assigned_to = admins[0].id
      refly_reason = `Image-CSV mismatch (${image_count - csv_count}) without Base/Rover correction.`
    } else {
      const admins = await UserRepository.getAdmins()
      if (admins.length > 0) assigned_to = admins[0].id
    }

    const project = {
      id: uuidv4(), client_id: clientId, title, drone_name, capture_date,
      upload_timestamp: upload_timestamp.toISOString(),
      image_count, csv_count, base_rover_bool, grid_file_bool, status, assigned_to,
      sla_deadline: deadline.toISOString(), sla_hours: hours, sla_daily_count: dailyCount,
      refly_reason,
    }

    const data = await ProjectRepository.createLegacyProject(project)
    await ActivityRepository.addAuditLog(project.id, user, `Project created with status "${status}". SLA: ${hours}h (daily upload #${dailyCount}).`)
    return { project: data }
  }

  static async listClientProjects(user, { page, limit, from, to }) {
    const projects = await ProjectRepository.getClientProjects({ user, from, to })
    const clientIds = [...new Set(projects.map(p => p.client_id).filter(Boolean))]
    const clients = await ProjectRepository.getClientsByIds(clientIds)
    const clientMap = Object.fromEntries(clients.map(c => [c.id, c.name]))
    return {
      projects: projects.map(p => ({ ...p, client_name: clientMap[p.client_id] || null })),
      page,
      limit,
    }
  }

  static async createClientProject(user, body) {
    if (![CLIENT_ADMIN, SUPER_ADMIN].includes(user.role)) throw { message: 'Forbidden', status: 403 }
    const { name, type, start_date, end_date, head, client_id } = body
    const clientId = user.role === CLIENT_ADMIN ? user.client_id : client_id
    if (!clientId) throw { message: 'client_id is required', status: 400 }
    if (!type || !start_date || !head) throw { message: 'Project category and project admin are required', status: 400 }

    const project = await ProjectRepository.createClientProject({
      id: uuidv4(),
      client_id: clientId,
      name: (name || '').trim() || `${type} - ${head}`,
      type,
      start_date,
      end_date: end_date || null,
      head: head.trim(),
      created_by: user.id,
    })
    await ActivityRepository.addAuditLog(project.id, user, `Project created: ${project.name}`, {
      event_type: 'project_created',
      project_kind: 'client_project',
      client_id: project.client_id,
      actor_role: user.role,
    })
    return { project }
  }

  static async updateClientProject(user, projectId, body) {
    if (![CLIENT_ADMIN, ADMIN, SUPER_ADMIN].includes(user.role)) throw { message: 'Forbidden', status: 403 }
    const existing = await ProjectRepository.findClientProjectById(projectId, user.role === CLIENT_ADMIN ? user.client_id : null)
    if (!existing) throw { message: 'Project not found', status: 404 }

    const update = {}
    if (body.name !== undefined) {
      const v = String(body.name || '').trim()
      update.name = v || `${existing.type} - ${existing.head}`
    }
    if (body.type !== undefined) {
      const v = String(body.type || '').trim()
      if (!v) throw { message: 'type cannot be empty', status: 400 }
      update.type = v
    }
    if (body.start_date !== undefined) {
      const v = String(body.start_date || '').trim()
      if (!v) throw { message: 'start_date cannot be empty', status: 400 }
      update.start_date = v
    }
    if (body.end_date !== undefined) {
      update.end_date = body.end_date || null
    }
    if (body.head !== undefined) {
      const v = String(body.head || '').trim()
      if (!v) throw { message: 'head cannot be empty', status: 400 }
      update.head = v
    }

    if (Object.keys(update).length === 0) throw { message: 'No valid fields to update', status: 400 }
    const project = await ProjectRepository.updateClientProject(projectId, { ...update, updated_at: new Date().toISOString() })
    await ActivityRepository.addAuditLog(project.id, user, `Project updated: ${project.name}`, {
      event_type: 'project_updated',
      project_kind: 'client_project',
      actor_role: user.role,
    })
    return { project }
  }

  static async assignUsers(user, projectId, userIds) {
    if (!Array.isArray(userIds)) throw { message: 'user_ids array required', status: 400 }
    let project = await ProjectRepository.findClientProjectById(projectId)
    let isClientProj = true
    if (!project) {
      const legacy = await ProjectRepository.getLegacyProjects({ user: { role: 'Super-Admin' }, from: 0, to: 1 })
      project = legacy.find(p => p.id === projectId)
      isClientProj = false
    }
    if (!project) throw { message: 'Project not found', status: 404 }

    if (user.role === CLIENT_ADMIN) {
      const orgUsers = await UserRepository.getUsersByClient(user.client_id)
      const validIds = new Set(orgUsers.filter(u => u.role === 'Client-User').map(u => u.id))
      if (project.client_id !== user.client_id) throw { message: 'Forbidden', status: 403 }
      if (!userIds.every(id => validIds.has(id))) throw { message: 'One or more users are not in your organization or assignable', status: 400 }
    } else {
      if (!INTERNAL_ROLES.includes(user.role)) throw { message: 'Forbidden', status: 403 }
      if (!isClientProj && user.role === ADMIN) throw { message: 'Forbidden — only Super-Admin can assign users', status: 403 }
    }

    await ProjectRepository.assignUsersToProject(projectId, userIds)
    await ActivityRepository.addAuditLog(projectId, user, `Team assignment changed (${userIds.length} assignees)`, {
      event_type: 'team_assignment_changed',
      assigned_user_ids: userIds,
      actor_role: user.role,
    })
    return { success: true }
  }
}
