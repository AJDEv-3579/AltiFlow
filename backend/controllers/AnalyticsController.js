import { json } from '../utils/apiResponse'
import { getUserFromRequest, authorizeRoles } from '../middleware/authMiddleware'
import { AnalyticsService } from '../services/AnalyticsService'
import { INTERNAL_ROLES } from '../constants/backendRoles'

export class AnalyticsController {
  static async getAnalytics(request) {
    const user = await getUserFromRequest(request)
    const auth = authorizeRoles(user, INTERNAL_ROLES)
    if (!auth.authorized) return json({ error: auth.error }, auth.status)
    try {
      const res = await AnalyticsService.getAnalytics(user)
      return json(res)
    } catch (e) {
      return json({ error: e.message }, e.status || 500)
    }
  }
}
