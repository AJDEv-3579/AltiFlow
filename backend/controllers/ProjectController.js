import { json } from '../utils/apiResponse'
import { getPagination } from '../utils/pagination'
import { getUserFromRequest, authorizeRoles } from '../middleware/authMiddleware'
import { ProjectService } from '../services/ProjectService'
import { ProjectRepository } from '../repositories/ProjectRepository'
import { RecycleBinRepository } from '../repositories/RecycleBinRepository'
import { ActivityRepository } from '../repositories/ActivityRepository'
import { SUPER_ADMIN, INTERNAL_ROLES, CLIENT_ROLES } from '../constants/backendRoles'

export class ProjectController {
  static async listClients(request) {
    const user = await getUserFromRequest(request)
    const auth = authorizeRoles(user, INTERNAL_ROLES)
    if (!auth.authorized) return json({ error: auth.error }, auth.status)
    const clients = await ProjectRepository.getClients()
    return json({ clients })
  }

  static async createClient(request) {
    const user = await getUserFromRequest(request)
    const auth = authorizeRoles(user, [SUPER_ADMIN])
    if (!auth.authorized) return json({ error: auth.error }, auth.status)
    const { name, logo_url } = await request.json().catch(() => ({}))
    if (!name) return json({ error: 'name required' }, 400)

    const client = await ProjectRepository.createClient({ id: crypto.randomUUID(), name, logo_url: logo_url || '' })
    await ActivityRepository.addAuditLog(null, user, `Client created: ${client.name}`, {
      event_type: 'client_created',
      target_client_id: client.id,
      actor_role: user.role,
    })
    return json({ client })
  }

  static async deleteClient(request, clientId) {
    const user = await getUserFromRequest(request)
    const auth = authorizeRoles(user, [SUPER_ADMIN])
    if (!auth.authorized) return json({ error: auth.error }, auth.status)

    const moved = await RecycleBinRepository.moveToRecycleBin({ tableName: 'clients', entityType: 'client', id: clientId, user })
    if (!moved.ok) return json({ error: 'Client not found' }, 404)
    await ActivityRepository.addAuditLog(null, user, `Client deleted: ${moved.row?.name || clientId}`, {
      event_type: 'client_deleted',
      target_client_id: moved.row?.id || clientId,
      actor_role: user.role,
    })
    return json({ success: true })
  }

  static async listLegacyProjects(request) {
    const user = await getUserFromRequest(request)
    if (!user) return json({ error: 'Unauthorized' }, 401)
    const pagination = getPagination(request, { defaultLimit: 50, maxLimit: 200 })
    try {
      const res = await ProjectService.listLegacyProjects(user, pagination)
      return json(res)
    } catch (e) {
      return json({ error: e.message }, e.status || 500)
    }
  }

  static async createLegacyProject(request) {
    const user = await getUserFromRequest(request)
    if (!user) return json({ error: 'Unauthorized' }, 401)
    const body = await request.json().catch(() => ({}))
    try {
      const res = await ProjectService.createLegacyProject(user, body)
      return json(res)
    } catch (e) {
      return json({ error: e.message }, e.status || 400)
    }
  }

  static async listClientProjects(request) {
    const user = await getUserFromRequest(request)
    const auth = authorizeRoles(user, [...CLIENT_ROLES, ...INTERNAL_ROLES])
    if (!auth.authorized) return json({ error: auth.error }, auth.status)
    const pagination = getPagination(request, { defaultLimit: 50, maxLimit: 200 })
    try {
      const res = await ProjectService.listClientProjects(user, pagination)
      return json(res)
    } catch (e) {
      return json({ error: e.message }, e.status || 500)
    }
  }

  static async createClientProject(request) {
    const user = await getUserFromRequest(request)
    if (!user) return json({ error: 'Unauthorized' }, 401)
    const body = await request.json().catch(() => ({}))
    try {
      const res = await ProjectService.createClientProject(user, body)
      return json(res, 201)
    } catch (e) {
      return json({ error: e.message }, e.status || 400)
    }
  }

  static async updateClientProject(request, projectId) {
    const user = await getUserFromRequest(request)
    if (!user) return json({ error: 'Unauthorized' }, 401)
    const body = await request.json().catch(() => ({}))
    try {
      const res = await ProjectService.updateClientProject(user, projectId, body)
      return json(res)
    } catch (e) {
      return json({ error: e.message }, e.status || 400)
    }
  }

  static async deleteClientProject(request, projectId) {
    const user = await getUserFromRequest(request)
    const auth = authorizeRoles(user, [SUPER_ADMIN])
    if (!auth.authorized) return json({ error: auth.error }, auth.status)

    const moved = await RecycleBinRepository.moveToRecycleBin({ tableName: 'client_projects', entityType: 'client_project', id: projectId, user })
    if (!moved.ok) return json({ error: 'Project not found' }, 404)
    await ActivityRepository.addAuditLog(projectId, user, `Project deleted: ${moved.row?.name || projectId}`, {
      event_type: 'project_deleted',
      project_kind: 'client_project',
      actor_role: user.role,
    })
    return json({ success: true })
  }

  static async assignUsers(request, projectId) {
    const user = await getUserFromRequest(request)
    if (!user) return json({ error: 'Unauthorized' }, 401)
    const { user_ids } = await request.json().catch(() => ({}))
    try {
      const res = await ProjectService.assignUsers(user, projectId, user_ids)
      return json(res)
    } catch (e) {
      return json({ error: e.message }, e.status || 400)
    }
  }

  static async getAssignedUsers(request, projectId) {
    const user = await getUserFromRequest(request)
    if (!user) return json({ error: 'Unauthorized' }, 401)
    const userIds = await ProjectRepository.getAssignedUserIds(projectId)
    return json({ user_ids: userIds })
  }
}
