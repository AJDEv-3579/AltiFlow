import { json } from '../utils/apiResponse'
import { getUserFromRequest } from '../middleware/authMiddleware'
import { NotificationService } from '../services/NotificationService'

export class NotificationController {
  static async list(request) {
    const user = await getUserFromRequest(request)
    if (!user) return json({ error: 'Unauthorized' }, 401)

    try {
      const url = new URL(request.url)
      const limit = Number(url.searchParams.get('limit') || 50)
      const payload = await NotificationService.list(user, { limit })
      return json(payload)
    } catch (e) {
      return json({ error: e.message }, e.status || 500)
    }
  }

  static async markRead(request) {
    const user = await getUserFromRequest(request)
    if (!user) return json({ error: 'Unauthorized' }, 401)

    const body = await request.json().catch(() => ({}))
    try {
      const res = await NotificationService.markRead(user, body.notification_id)
      return json(res)
    } catch (e) {
      return json({ error: e.message }, e.status || 400)
    }
  }

  static async markAllRead(request) {
    const user = await getUserFromRequest(request)
    if (!user) return json({ error: 'Unauthorized' }, 401)

    try {
      const res = await NotificationService.markAllRead(user)
      return json(res)
    } catch (e) {
      return json({ error: e.message }, e.status || 400)
    }
  }
}

export default NotificationController
