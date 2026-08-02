import { json } from '../utils/apiResponse'
import { getUserFromRequest, authorizeRoles } from '../middleware/authMiddleware'
import { UserService } from '../services/UserService'
import { UserRepository } from '../repositories/UserRepository'
import { RecycleBinRepository } from '../repositories/RecycleBinRepository'
import { ActivityRepository } from '../repositories/ActivityRepository'
import { SUPER_ADMIN, INTERNAL_ROLES, CLIENT_ADMIN } from '../constants/backendRoles'

export class UserController {
  static async checkUsername(request) {
    const url = new URL(request.url)
    const usernameParam = url.searchParams.get('username')
    try {
      const res = await UserService.checkUsername(usernameParam)
      return json(res)
    } catch (e) {
      return json({ available: false, error: e.message }, e.status || 400)
    }
  }

  static async listUsers(request) {
    const user = await getUserFromRequest(request)
    const auth = authorizeRoles(user, [...INTERNAL_ROLES, CLIENT_ADMIN])
    if (!auth.authorized) return json({ error: auth.error }, auth.status)
    try {
      const res = await UserService.listUsers(user)
      return json(res)
    } catch (e) {
      return json({ error: e.message }, e.status || 500)
    }
  }

  static async createUser(request) {
    const user = await getUserFromRequest(request)
    if (!user) return json({ error: 'Unauthorized' }, 401)
    const body = await request.json().catch(() => ({}))
    try {
      const res = await UserService.createUser(user, body)
      return json(res)
    } catch (e) {
      return json({ error: e.message }, e.status || 400)
    }
  }

  static async deleteUser(request, userId) {
    const user = await getUserFromRequest(request)
    const auth = authorizeRoles(user, [SUPER_ADMIN])
    if (!auth.authorized) return json({ error: 'Forbidden — only Super-Admin can delete users' }, 403)

    const target = await UserRepository.findById(userId)
    if (!target) return json({ error: 'User not found' }, 404)
    if (target?.username === 'devbond01') return json({ error: 'Cannot delete Super-Admin' }, 400)

    await RecycleBinRepository.moveToRecycleBin({ tableName: 'users', entityType: 'user', id: userId, user })
    await ActivityRepository.addAuditLog(null, user, `User deleted: ${target.username}`, {
      event_type: 'user_deleted',
      target_user_id: target.id,
      target_username: target.username,
      actor_role: user.role,
    })
    return json({ success: true })
  }

  static async resetPassword(request, userId) {
    const user = await getUserFromRequest(request)
    const auth = authorizeRoles(user, [SUPER_ADMIN])
    if (!auth.authorized) return json({ error: 'Forbidden — only Super-Admin can reset passwords' }, 403)

    const { new_password } = await request.json().catch(() => ({}))
    try {
      const res = await UserService.resetPasswordByAdmin(user, userId, new_password)
      return json(res)
    } catch (e) {
      return json({ error: e.message }, e.status || 400)
    }
  }

  static async resetPasscode(request, userId) {
    const user = await getUserFromRequest(request)
    const auth = authorizeRoles(user, [SUPER_ADMIN])
    if (!auth.authorized) return json({ error: 'Forbidden — only Super-Admin can generate passkey files' }, 403)

    try {
      const res = await UserService.resetPasscodeByAdmin(user, userId)
      return json(res)
    } catch (e) {
      return json({ error: e.message }, e.status || 400)
    }
  }
}
