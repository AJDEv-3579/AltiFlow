import { json } from '../utils/apiResponse'
import { getUserFromRequest, authorizeRoles } from '../middleware/authMiddleware'
import { getMigrationStatus, linkUserToSupabaseAuth, migrateAllUsersToSupabaseAuth } from '@/lib/auth-adapter'
import { SUPER_ADMIN } from '../constants/backendRoles'

export class AuthMigrationController {
  static async getStatus(request) {
    const user = await getUserFromRequest(request)
    const auth = authorizeRoles(user, [SUPER_ADMIN])
    if (!auth.authorized) return json({ error: 'Forbidden — Super-Admin only' }, 403)
    const status = await getMigrationStatus()
    return json(status)
  }

  static async linkUser(request, userId) {
    const user = await getUserFromRequest(request)
    const auth = authorizeRoles(user, [SUPER_ADMIN])
    if (!auth.authorized) return json({ error: 'Forbidden — Super-Admin only' }, 403)
    const { send_invite = false } = await request.json().catch(() => ({}))
    const result = await linkUserToSupabaseAuth(userId, {
      suppressErrors: false,
      sendInvite: Boolean(send_invite),
    }).catch(e => ({ ok: false, error: e.message }))
    return json(result)
  }

  static async sendInvite(request, userId) {
    const user = await getUserFromRequest(request)
    const auth = authorizeRoles(user, [SUPER_ADMIN])
    if (!auth.authorized) return json({ error: 'Forbidden — Super-Admin only' }, 403)
    const result = await linkUserToSupabaseAuth(userId, {
      suppressErrors: false,
      sendInvite: true,
    }).catch(e => ({ ok: false, error: e.message }))
    return json(result)
  }

  static async migrateAll(request) {
    const user = await getUserFromRequest(request)
    const auth = authorizeRoles(user, [SUPER_ADMIN])
    if (!auth.authorized) return json({ error: 'Forbidden — Super-Admin only' }, 403)
    const { send_invites = false, dry_run = false } = await request.json().catch(() => ({}))
    const result = await migrateAllUsersToSupabaseAuth({
      sendInvites: Boolean(send_invites),
      dryRun: Boolean(dry_run),
    }).catch(e => ({ ok: false, error: e.message }))
    return json(result)
  }
}
