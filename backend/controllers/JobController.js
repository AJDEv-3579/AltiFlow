import { json } from '../utils/apiResponse'
import { getPagination, parsePositiveInt } from '../utils/pagination'
import { getCachedList, setCachedList, invalidateCachedLists } from '../utils/listCache'
import { getUserFromRequest, authorizeRoles } from '../middleware/authMiddleware'
import { JobService } from '../services/JobService'
import { RecycleBinRepository } from '../repositories/RecycleBinRepository'
import { ActivityRepository } from '../repositories/ActivityRepository'
import { CLIENT_ROLES, INTERNAL_ROLES, CLIENT_ADMIN, SUPER_ADMIN } from '../constants/backendRoles'

export class JobController {
  static async listProjectJobs(request, projectId) {
    const user = await getUserFromRequest(request)
    const auth = authorizeRoles(user, [...CLIENT_ROLES, ...INTERNAL_ROLES])
    if (!auth.authorized) return json({ error: auth.error }, auth.status)

    const pagination = getPagination(request, { defaultLimit: 500, maxLimit: 1000 })
    const commentLimit = parsePositiveInt(pagination.url.searchParams.get('comment_limit'), 10, 1, 50)
    const bypassCache = pagination.url.searchParams.get('refresh') === '1'
    const cacheKey = `jobs-by-project:${projectId}:${user.role}:${user.id}:${pagination.page}:${pagination.limit}:${commentLimit}`

    if (!bypassCache) {
      const cached = getCachedList(cacheKey)
      if (cached) return json(cached)
    }

    try {
      const payload = await JobService.listJobsByProject(user, projectId, { ...pagination, commentLimit })
      setCachedList(cacheKey, payload)
      return json(payload)
    } catch (e) {
      return json({ error: e.message }, e.status || 500)
    }
  }

  static async listAssignedJobs(request) {
    const user = await getUserFromRequest(request)
    if (!user) return json({ error: 'Unauthorized' }, 401)
    const pagination = getPagination(request, { defaultLimit: 500, maxLimit: 1000 })
    const commentLimit = parsePositiveInt(pagination.url.searchParams.get('comment_limit'), 10, 1, 50)
    const bypassCache = pagination.url.searchParams.get('refresh') === '1'
    const cacheKey = `jobs-assigned:${user.role}:${user.id}:${pagination.page}:${pagination.limit}:${commentLimit}`

    if (!bypassCache) {
      const cached = getCachedList(cacheKey)
      if (cached) return json(cached)
    }

    try {
      const payload = await JobService.listAssignedJobs(user, { ...pagination, commentLimit })
      setCachedList(cacheKey, payload)
      return json(payload)
    } catch (e) {
      return json({ error: e.message }, e.status || 500)
    }
  }

  static async createJob(request, projectId) {
    const user = await getUserFromRequest(request)
    const auth = authorizeRoles(user, [...CLIENT_ROLES, ...INTERNAL_ROLES])
    if (!auth.authorized) return json({ error: auth.error }, auth.status)

    const body = await request.json().catch(() => ({}))
    try {
      const res = await JobService.createJob(user, projectId, body)
      invalidateCachedLists('jobs-by-project:')
      invalidateCachedLists('jobs-assigned:')
      return json(res, 201)
    } catch (e) {
      return json({ error: e.message }, e.status || 400)
    }
  }

  static async updateJob(request, projectId, jobId) {
    const user = await getUserFromRequest(request)
    const auth = authorizeRoles(user, [...CLIENT_ROLES, ...INTERNAL_ROLES])
    if (!auth.authorized) return json({ error: auth.error }, auth.status)

    const body = await request.json().catch(() => ({}))
    try {
      const res = await JobService.updateJob(user, projectId, jobId, body)
      invalidateCachedLists('jobs-by-project:')
      invalidateCachedLists('jobs-assigned:')
      return json(res)
    } catch (e) {
      return json({ error: e.message }, e.status || 400)
    }
  }

  static async deleteJob(request, projectId, jobId) {
    const user = await getUserFromRequest(request)
    const auth = authorizeRoles(user, [CLIENT_ADMIN, SUPER_ADMIN])
    if (!auth.authorized) return json({ error: auth.error }, auth.status)

    const moved = await RecycleBinRepository.moveToRecycleBin({
      tableName: 'jobs',
      entityType: 'job',
      id: jobId,
      user,
      scope: { field: 'project_id', value: projectId },
    })
    if (!moved.ok) return json({ error: 'Job not found' }, 404)
    await ActivityRepository.addAuditLog(projectId, user, `Job card deleted: ${moved.row?.title || jobId}`, {
      event_type: 'job_deleted',
      job_id: moved.row?.id || jobId,
      actor_role: user.role,
    })
    invalidateCachedLists('jobs-by-project:')
    invalidateCachedLists('jobs-assigned:')
    return json({ ok: true })
  }

  static async addJobComment(request, projectId, jobId) {
    const user = await getUserFromRequest(request)
    const auth = authorizeRoles(user, [...CLIENT_ROLES, ...INTERNAL_ROLES])
    if (!auth.authorized) return json({ error: auth.error }, auth.status)

    const body = await request.json().catch(() => ({}))
    try {
      const res = await JobService.addComment(user, projectId, jobId, body)
      invalidateCachedLists('jobs-by-project:')
      invalidateCachedLists('jobs-assigned:')
      return json(res)
    } catch (e) {
      return json({ error: e.message }, e.status || 400)
    }
  }
}
