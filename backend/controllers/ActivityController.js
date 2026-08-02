import { json } from '../utils/apiResponse'
import { getPagination } from '../utils/pagination'
import { getCachedList, setCachedList } from '../utils/listCache'
import { getUserFromRequest } from '../middleware/authMiddleware'
import { ActivityService } from '../services/ActivityService'

export class ActivityController {
  static async listAuditLogs(request) {
    const user = await getUserFromRequest(request)
    if (!user) return json({ error: 'Unauthorized' }, 401)
    const pagination = getPagination(request, { defaultLimit: 100, maxLimit: 300 })
    const bypassCache = pagination.url.searchParams.get('refresh') === '1'
    const cacheKey = `audit-logs:${user.role}:${user.id}:${pagination.page}:${pagination.limit}`

    if (!bypassCache) {
      const cached = getCachedList(cacheKey)
      if (cached) return json(cached)
    }

    try {
      const res = await ActivityService.listAuditLogs(user, pagination)
      const payload = { logs: res.logs, page: pagination.page, limit: pagination.limit }
      setCachedList(cacheKey, payload)
      return json(payload)
    } catch (e) {
      return json({ error: e.message }, e.status || 500)
    }
  }

  static async getProjectActivityLog(request, projectId) {
    const user = await getUserFromRequest(request)
    if (!user) return json({ error: 'Unauthorized' }, 401)
    try {
      const res = await ActivityService.getProjectActivityLog(user, projectId)
      return json(res)
    } catch (e) {
      return json({ error: e.message }, e.status || 400)
    }
  }
}
