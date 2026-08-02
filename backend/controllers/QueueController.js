import { json } from '../utils/apiResponse'
import { getUserFromRequest } from '../middleware/authMiddleware'
import { QueueService } from '../services/QueueService'

export class QueueController {
  static async listRecycleBin(request) {
    const user = await getUserFromRequest(request)
    if (!user) return json({ error: 'Unauthorized' }, 401)
    try {
      const res = await QueueService.listRecycleBin(user)
      return json(res)
    } catch (e) {
      return json({ error: e.message }, e.status || 500)
    }
  }

  static async restoreItem(request, itemId) {
    const user = await getUserFromRequest(request)
    if (!user) return json({ error: 'Unauthorized' }, 401)
    try {
      const res = await QueueService.restoreRecycleBinItem(user, itemId)
      return json(res)
    } catch (e) {
      return json({ error: e.message }, e.status || 400)
    }
  }

  static async deletePermanently(request, itemId) {
    const user = await getUserFromRequest(request)
    if (!user) return json({ error: 'Unauthorized' }, 401)
    try {
      const res = await QueueService.deleteRecycleBinItemPermanently(user, itemId)
      return json(res)
    } catch (e) {
      return json({ error: e.message }, e.status || 400)
    }
  }

  static async listUserDeletionRequests(request) {
    const user = await getUserFromRequest(request)
    if (!user) return json({ error: 'Unauthorized' }, 401)
    try {
      const res = await QueueService.listUserDeletionRequests(user)
      return json(res)
    } catch (e) {
      return json({ error: e.message }, e.status || 500)
    }
  }

  static async resolveUserDeletionRequest(request, requestId) {
    const user = await getUserFromRequest(request)
    if (!user) return json({ error: 'Unauthorized' }, 401)
    const { action } = await request.json().catch(() => ({}))
    try {
      const res = await QueueService.resolveUserDeletionRequest(user, requestId, action)
      return json(res)
    } catch (e) {
      return json({ error: e.message }, e.status || 400)
    }
  }

  static async requestUserDeletion(request, targetUserId) {
    const user = await getUserFromRequest(request)
    if (!user) return json({ error: 'Unauthorized' }, 401)
    const { reason } = await request.json().catch(() => ({}))
    try {
      const res = await QueueService.requestUserDeletion(user, targetUserId, reason)
      return json(res)
    } catch (e) {
      return json({ error: e.message }, e.status || 400)
    }
  }

  static async createEntityDeleteRequest(request) {
    const user = await getUserFromRequest(request)
    if (!user) return json({ error: 'Unauthorized' }, 401)
    const body = await request.json().catch(() => ({}))
    try {
      const res = await QueueService.createEntityDeleteRequest(user, body)
      return json(res, 201)
    } catch (e) {
      return json({ error: e.message }, e.status || 400)
    }
  }

  static async listEntityDeleteRequests(request) {
    const user = await getUserFromRequest(request)
    if (!user) return json({ error: 'Unauthorized' }, 401)
    try {
      const res = await QueueService.listEntityDeleteRequests(user)
      return json(res)
    } catch (e) {
      return json({ error: e.message }, e.status || 500)
    }
  }

  static async resolveEntityDeleteRequest(request, requestId) {
    const user = await getUserFromRequest(request)
    if (!user) return json({ error: 'Unauthorized' }, 401)
    const { action } = await request.json().catch(() => ({}))
    try {
      const res = await QueueService.resolveEntityDeleteRequest(user, requestId, action)
      return json(res)
    } catch (e) {
      return json({ error: e.message }, e.status || 400)
    }
  }
}
