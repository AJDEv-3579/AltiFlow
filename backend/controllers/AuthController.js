import { json, stripSensitiveFields } from '../utils/apiResponse'
import { getUserFromRequest } from '../middleware/authMiddleware'
import { AuthService } from '../services/AuthService'

export class AuthController {
  static async login(request) {
    const { username, password } = await request.json().catch(() => ({}))
    try {
      const { user, token, client } = await AuthService.login(username, password)
      return json({ token, user: { ...user, client } })
    } catch (e) {
      return json({ error: e.message || 'Invalid credentials' }, e.status || 401)
    }
  }

  static async me(request) {
    const user = await getUserFromRequest(request)
    if (!user) return json({ error: 'Unauthorized' }, 401)
    return json({ user: { ...stripSensitiveFields(user) } })
  }

  static async changeUsername(request) {
    const user = await getUserFromRequest(request)
    if (!user) return json({ error: 'Unauthorized' }, 401)
    const { new_username } = await request.json().catch(() => ({}))
    try {
      const res = await AuthService.changeUsername(user, new_username)
      return json(res)
    } catch (e) {
      return json({ error: e.message }, e.status || 500)
    }
  }

  static async updateProfile(request) {
    const user = await getUserFromRequest(request)
    if (!user) return json({ error: 'Unauthorized' }, 401)
    const body = await request.json().catch(() => ({}))
    try {
      const res = await AuthService.updateProfile(user, body)
      return json(res)
    } catch (e) {
      return json({ error: e.message }, e.status || 500)
    }
  }

  static async changePassword(request) {
    const user = await getUserFromRequest(request)
    if (!user) return json({ error: 'Unauthorized' }, 401)
    const body = await request.json().catch(() => ({}))
    try {
      const res = await AuthService.changePassword(user, body)
      return json(res)
    } catch (e) {
      return json({ error: e.message }, e.status || 400)
    }
  }

  static async forgotPassword(request) {
    const body = await request.json().catch(() => ({}))
    try {
      const res = await AuthService.forgotPasswordPasskey(body)
      return json(res)
    } catch (e) {
      return json({ error: e.message }, e.status || 401)
    }
  }

  static async requestResetEmail(request) {
    const { identifier } = await request.json().catch(() => ({}))
    try {
      const res = await AuthService.requestResetEmail(identifier)
      return json(res)
    } catch (e) {
      return json({ error: e.message }, e.status || 400)
    }
  }

  static async completePasswordReset(request) {
    const body = await request.json().catch(() => ({}))
    try {
      const res = await AuthService.completeReset(body)
      return json(res)
    } catch (e) {
      return json({ error: e.message }, e.status || 400)
    }
  }
}
