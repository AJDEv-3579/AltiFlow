import { json } from '../utils/apiResponse'
import { getPagination } from '../utils/pagination'
import { getCachedList, setCachedList, invalidateCachedLists } from '../utils/listCache'
import { getUserFromRequest, authorizeRoles } from '../middleware/authMiddleware'
import { SupportService } from '../services/SupportService'
import { RecycleBinRepository } from '../repositories/RecycleBinRepository'
import { ActivityRepository } from '../repositories/ActivityRepository'
import { SUPER_ADMIN } from '../constants/backendRoles'

export class SupportController {
  static async listTickets(request) {
    const user = await getUserFromRequest(request)
    if (!user) return json({ error: 'Unauthorized' }, 401)
    const pagination = getPagination(request, { defaultLimit: 50, maxLimit: 200 })
    const projectId = pagination.url.searchParams.get('project_id') || null
    const bypassCache = pagination.url.searchParams.get('refresh') === '1'
    const cacheKey = `support-tickets:${user.role}:${user.id}:${user.client_id || 'none'}:${projectId || 'all'}:${pagination.page}:${pagination.limit}`

    if (!bypassCache) {
      const cached = getCachedList(cacheKey)
      if (cached) return json(cached)
    }

    try {
      const payload = await SupportService.listTickets(user, { ...pagination, projectId })
      setCachedList(cacheKey, payload)
      return json(payload)
    } catch (e) {
      return json({ error: e.message }, e.status || 500)
    }
  }

  static async createTicket(request) {
    const user = await getUserFromRequest(request)
    if (!user) return json({ error: 'Unauthorized' }, 401)
    const body = await request.json().catch(() => ({}))
    try {
      const res = await SupportService.createTicket(user, body)
      invalidateCachedLists('support-tickets:')
      return json(res, 201)
    } catch (e) {
      return json({ error: e.message }, e.status || 400)
    }
  }

  static async updateTicket(request, ticketId) {
    const user = await getUserFromRequest(request)
    if (!user) return json({ error: 'Unauthorized' }, 401)
    const body = await request.json().catch(() => ({}))
    try {
      const res = await SupportService.updateTicket(user, ticketId, body)
      invalidateCachedLists('support-tickets:')
      return json(res)
    } catch (e) {
      return json({ error: e.message }, e.status || 400)
    }
  }

  static async deleteTicket(request, ticketId) {
    const user = await getUserFromRequest(request)
    const auth = authorizeRoles(user, [SUPER_ADMIN])
    if (!auth.authorized) return json({ error: auth.error }, auth.status)

    const moved = await RecycleBinRepository.moveToRecycleBin({ tableName: 'support_tickets', entityType: 'support_ticket', id: ticketId, user })
    if (!moved.ok) return json({ error: 'Ticket not found' }, 404)
    await ActivityRepository.addAuditLog(null, user, `Support ticket deleted: ${moved.row?.title || ticketId}`, {
      event_type: 'support_ticket_deleted',
      support_ticket_id: moved.row?.id || ticketId,
      actor_role: user.role,
    })
    invalidateCachedLists('support-tickets:')
    return json({ success: true })
  }

  static async getComments(request, ticketId) {
    const user = await getUserFromRequest(request)
    if (!user) return json({ error: 'Unauthorized' }, 401)
    try {
      const res = await SupportService.getComments(user, ticketId)
      return json(res)
    } catch (e) {
      return json({ error: e.message }, e.status || 400)
    }
  }

  static async addComment(request, ticketId) {
    const user = await getUserFromRequest(request)
    if (!user) return json({ error: 'Unauthorized' }, 401)
    const body = await request.json().catch(() => ({}))
    try {
      const res = await SupportService.addComment(user, ticketId, body)
      invalidateCachedLists('support-tickets:')
      return json(res, 201)
    } catch (e) {
      return json({ error: e.message }, e.status || 400)
    }
  }
}
