import { v4 as uuidv4 } from 'uuid'
import { RecycleBinRepository } from '../repositories/RecycleBinRepository'
import { UserRepository } from '../repositories/UserRepository'
import { ProjectRepository } from '../repositories/ProjectRepository'
import { JobRepository } from '../repositories/JobRepository'
import { ActivityRepository } from '../repositories/ActivityRepository'
import { deleteUserFromSupabaseAuth, linkUserToSupabaseAuth } from '@/lib/auth-adapter'
import { SUPER_ADMIN, CLIENT_ADMIN, CLIENT_USER, ADMIN } from '../constants/backendRoles'

export class QueueService {
  static async listRecycleBin(user) {
    if (user.role !== SUPER_ADMIN) throw { message: 'Forbidden', status: 403 }
    const items = await RecycleBinRepository.getRecycleBinItems(300)
    return { items }
  }

  static async restoreRecycleBinItem(user, id) {
    if (user.role !== SUPER_ADMIN) throw { message: 'Forbidden', status: 403 }
    const entry = await RecycleBinRepository.getEntryById(id)
    if (!entry) throw { message: 'Recycle entry not found', status: 404 }
    if (entry.restored_at) throw { message: 'Entry already restored', status: 409 }

    await RecycleBinRepository.restoreFromRecycleBin(entry, user)
    if ((entry.table_name === 'users' || entry.entity_type === 'user') && entry.payload?.email) {
      try {
        await linkUserToSupabaseAuth(entry.payload.id, { suppressErrors: true, sendInvite: false })
      } catch (authErr) {
        console.warn('[QueueService] Could not re-link restored user to Supabase Auth:', authErr.message)
      }
    }
    await ActivityRepository.addAuditLog(entry.payload?.project_id || null, user, `Recycle bin item restored: ${entry.entity_type}`, {
      event_type: 'recycle_restore',
      entity_type: entry.entity_type,
      entity_id: entry.entity_id,
      actor_role: user.role,
    })
    return { success: true }
  }

  static async deleteRecycleBinItemPermanently(user, id) {
    if (user.role !== SUPER_ADMIN) throw { message: 'Forbidden', status: 403 }
    const entry = await RecycleBinRepository.getEntryById(id)
    if (entry && (entry.table_name === 'users' || entry.entity_type === 'user')) {
      const payload = entry.payload || {}
      await deleteUserFromSupabaseAuth(payload.supabase_auth_id, payload.email)
    }
    await RecycleBinRepository.deletePermanently(id)
    if (entry) {
      await ActivityRepository.addAuditLog(entry.payload?.project_id || null, user, `Recycle bin item permanently deleted: ${entry.entity_type}`, {
        event_type: 'recycle_permanent_delete',
        entity_type: entry.entity_type,
        entity_id: entry.entity_id,
        actor_role: user.role,
      })
    }
    return { success: true }
  }

  static async listUserDeletionRequests(user) {
    if (user.role !== SUPER_ADMIN) throw { message: 'Forbidden', status: 403 }
    const data = await UserRepository.getPendingDeletionRequests()
    if (data.length === 0) return { requests: [] }

    const userIds = [...new Set(data.flatMap(r => [r.target_user_id, r.requested_by]))]
    const users = await UserRepository.getAllUsers('id, username, role, client_id')
    const filteredUsers = users.filter(u => userIds.includes(u.id))
    const clients = await ProjectRepository.getClients()

    const umap = Object.fromEntries(filteredUsers.map(u => [u.id, u]))
    const cmap = Object.fromEntries(clients.map(c => [c.id, c.name]))

    return {
      requests: data.map(r => ({
        ...r,
        target_username: umap[r.target_user_id]?.username,
        target_role: umap[r.target_user_id]?.role,
        target_client: cmap[umap[r.target_user_id]?.client_id] || null,
        requested_by_username: umap[r.requested_by]?.username,
      })),
    }
  }

  static async resolveUserDeletionRequest(user, id, action) {
    if (user.role !== SUPER_ADMIN) throw { message: 'Forbidden', status: 403 }
    if (!['approve', 'reject'].includes(action)) throw { message: 'action must be approve or reject', status: 400 }

    const req = await UserRepository.getDeletionRequestById(id)
    if (!req || req.status !== 'pending') throw { message: 'Request not found or already resolved', status: 404 }

    await UserRepository.updateDeletionRequest(id, {
      status: action === 'approve' ? 'approved' : 'rejected',
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    })

    await ActivityRepository.addAuditLog(null, user, `User delete request ${action}d`, {
      event_type: action === 'approve' ? 'delete_request_approved' : 'delete_request_rejected',
      request_type: 'user_delete',
      request_id: id,
      target_user_id: req.target_user_id,
      actor_role: user.role,
    })

    if (action === 'approve') {
      const target = await UserRepository.findById(req.target_user_id)
      if (target?.username === 'devbond01') throw { message: 'Cannot delete Super-Admin', status: 400 }
      await RecycleBinRepository.moveToRecycleBin({ tableName: 'users', entityType: 'user', id: req.target_user_id, user })
    }
    return { success: true }
  }

  static async requestUserDeletion(user, targetId, reason) {
    if (user.role !== CLIENT_ADMIN) throw { message: 'Forbidden', status: 403 }
    const target = await UserRepository.findById(targetId)
    if (!target || target.client_id !== user.client_id || target.role !== CLIENT_USER) {
      throw { message: 'User not found in your organization', status: 404 }
    }
    const existing = await UserRepository.checkPendingDeletionRequest(targetId)
    if (existing) throw { message: 'Deletion already requested for this user', status: 409 }

    await UserRepository.createDeletionRequest({
      id: uuidv4(),
      target_user_id: targetId,
      requested_by: user.id,
      reason: reason || null,
      status: 'pending',
    })
    await ActivityRepository.addAuditLog(null, user, `User delete request created for ${target.username}`, {
      event_type: 'delete_request_created',
      request_type: 'user_delete',
      target_user_id: target.id,
      actor_role: user.role,
    })
    return { success: true }
  }

  static async resolveEntityScope(entityType, entityId) {
    if (entityType === 'job') {
      const job = await JobRepository.findById(entityId)
      if (!job) return null
      const project = await ProjectRepository.findClientProjectById(job.project_id)
      if (!project) return null
      return { tableName: 'jobs', entityType, id: entityId, client_id: project.client_id, scope: { field: 'project_id', value: job.project_id } }
    }
    if (entityType === 'client_project') {
      const project = await ProjectRepository.findClientProjectById(entityId)
      if (!project) return null
      return { tableName: 'client_projects', entityType, id: entityId, client_id: project.client_id, scope: null }
    }
    return null
  }

  static async createEntityDeleteRequest(user, { entity_type, entity_id, reason }) {
    if (![CLIENT_USER, CLIENT_ADMIN, ADMIN].includes(user.role)) throw { message: 'Forbidden', status: 403 }
    if (!entity_type || !entity_id) throw { message: 'entity_type and entity_id are required', status: 400 }

    const resolved = await QueueService.resolveEntityScope(entity_type, entity_id)
    if (!resolved) throw { message: 'Entity not found', status: 404 }

    const targetRole = user.role === CLIENT_USER ? CLIENT_ADMIN : SUPER_ADMIN
    if (user.role === CLIENT_USER && resolved.client_id !== user.client_id) throw { message: 'Forbidden', status: 403 }
    if (user.role === CLIENT_ADMIN && resolved.client_id !== user.client_id) throw { message: 'Forbidden', status: 403 }

    const existing = await RecycleBinRepository.checkPendingEntityDeleteRequest(entity_type, entity_id)
    if (existing) throw { message: 'Delete request already pending for this item', status: 409 }

    await RecycleBinRepository.createEntityDeleteRequest({
      id: uuidv4(),
      entity_type,
      entity_id,
      table_name: resolved.tableName,
      client_id: resolved.client_id || null,
      requested_by: user.id,
      requested_by_username: user.username,
      requested_by_role: user.role,
      target_role: targetRole,
      reason: (reason || '').trim() || null,
    })
    await ActivityRepository.addAuditLog(resolved.scope?.value || null, user, `Entity delete request created: ${entity_type}`, {
      event_type: 'delete_request_created',
      request_type: 'entity_delete',
      entity_type,
      entity_id,
      actor_role: user.role,
    })
    return { success: true }
  }

  static async listEntityDeleteRequests(user) {
    const requests = await RecycleBinRepository.getPendingEntityDeleteRequests(user)

    const jobIds = requests.filter(r => r.entity_type === 'job' || r.table_name === 'jobs').map(r => r.entity_id)
    let jobMap = {}
    if (jobIds.length > 0) {
      const jobRows = await JobRepository.getJobsByIds(jobIds)
      jobMap = Object.fromEntries(jobRows.map(j => [j.id, j]))
    }

    const enrichedRequests = requests.map(r => {
      const job = (r.entity_type === 'job' || r.table_name === 'jobs') ? jobMap[r.entity_id] : null
      const jcId = `JC-${(r.entity_id || '').slice(0, 6).toUpperCase()}`
      const fieldName = job?.title || 'Field Plot'
      const category = job?.category || 'Stand Count'
      return {
        ...r,
        job_card_id: jcId,
        field_name: fieldName,
        category: category,
        display_title: job ? `${jcId} • ${fieldName} • ${category}` : `${r.entity_type} • ${jcId}`,
      }
    })
    return { requests: enrichedRequests }
  }

  static async resolveEntityDeleteRequest(user, id, action) {
    if (!['approve', 'reject'].includes(action)) throw { message: 'action must be approve or reject', status: 400 }

    const req = await RecycleBinRepository.getEntityDeleteRequestById(id)
    if (!req || req.status !== 'pending') throw { message: 'Request not found or already resolved', status: 404 }

    if (user.role === SUPER_ADMIN) {
      if (req.target_role !== SUPER_ADMIN) throw { message: 'Forbidden', status: 403 }
    } else if (user.role === CLIENT_ADMIN) {
      if (req.target_role !== CLIENT_ADMIN || req.client_id !== user.client_id) throw { message: 'Forbidden', status: 403 }
    } else {
      throw { message: 'Forbidden', status: 403 }
    }

    if (action === 'approve') {
      const resolved = await QueueService.resolveEntityScope(req.entity_type, req.entity_id)
      if (!resolved) throw { message: 'Entity no longer exists', status: 409 }
      if (user.role === CLIENT_ADMIN && resolved.client_id !== user.client_id) throw { message: 'Forbidden', status: 403 }
      await RecycleBinRepository.moveToRecycleBin({
        tableName: resolved.tableName,
        entityType: req.entity_type,
        id: req.entity_id,
        user,
        scope: resolved.scope,
      })
    }

    await RecycleBinRepository.updateEntityDeleteRequest(id, {
      status: action === 'approve' ? 'approved' : 'rejected',
      reviewed_by: user.id,
      reviewed_by_username: user.username,
      reviewed_at: new Date().toISOString(),
    })

    await ActivityRepository.addAuditLog(req.entity_type === 'job' ? req.entity_id : null, user, `Entity delete request ${action}d: ${req.entity_type}`, {
      event_type: action === 'approve' ? 'delete_request_approved' : 'delete_request_rejected',
      request_type: 'entity_delete',
      request_id: id,
      entity_type: req.entity_type,
      entity_id: req.entity_id,
      actor_role: user.role,
    })

    return { success: true }
  }
}
