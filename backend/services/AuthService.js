import bcrypt from 'bcryptjs'
import {
  authenticateUser as authAdapterLogin,
  requestPasswordResetEmail,
  completePasswordReset,
  findUserByIdentifier,
} from '@/lib/auth-adapter'
import { UserRepository } from '../repositories/UserRepository'
import { UserService } from './UserService'
import { ActivityRepository } from '../repositories/ActivityRepository'
import { stripSensitiveFields } from '../utils/apiResponse'
import { decryptPasskeyPayload } from '../utils/passkeyUtils'

export class AuthService {
  static async login(username, password) {
    if (!username || !password) throw { message: 'username & password required', status: 400 }
    const res = await authAdapterLogin(username, password)
    await ActivityRepository.addAuditLog(null, res.user, 'Login successful', {
      event_type: 'login',
      actor_role: res.user?.role || null,
    })
    return res
  }

  static async changeUsername(user, newUsername) {
    if (!newUsername || !newUsername.trim()) throw { message: 'Username is required', status: 400 }
    const trimmed = newUsername.trim()
    if (trimmed.length < 3) throw { message: 'Username must be at least 3 characters', status: 400 }
    if (trimmed.includes('@')) throw { message: 'Username cannot be an email address', status: 400 }
    if (!/^[a-zA-Z0-9_.-]+$/.test(trimmed)) throw { message: 'Username can only contain letters, numbers, underscores, dots, and hyphens', status: 400 }

    const exists = await UserRepository.checkUsernameExists(trimmed)
    if (exists) {
      if (exists.id !== user.id) throw { message: 'Username is already taken', status: 409 }
      return { success: true, user: stripSensitiveFields(user) }
    }

    const updated = await UserRepository.updateUser(user.id, { username: trimmed })
    await ActivityRepository.addAuditLog(null, user, `Username changed to ${trimmed}`, {
      event_type: 'user_username_changed',
      target_user_id: user.id,
      actor_role: user.role,
    })
    return { success: true, user: stripSensitiveFields(updated) }
  }

  static async updateProfile(user, { full_name, phone }) {
    const updateData = {}
    if (phone !== undefined) updateData.phone = phone ? String(phone).trim() : null
    if (full_name !== undefined) {
      const trimmed = String(full_name || '').trim()
      if (!trimmed) {
        updateData.first_name = null
        updateData.last_name = null
      }
      const parts = trimmed.split(/\s+/)
      if (trimmed) {
        updateData.first_name = parts[0] || null
        updateData.last_name = parts.length > 1 ? parts.slice(1).join(' ') : null
      }
    }

    const updated = await UserRepository.updateUser(user.id, updateData)
    await ActivityRepository.addAuditLog(null, user, 'Profile updated', {
      event_type: 'profile_updated',
      target_user_id: user.id,
      actor_role: user.role,
    })
    return { success: true, user: stripSensitiveFields(updated) }
  }

  static async verifyUserPasskey(user, keyFileContent) {
    if (!user?.id) throw new Error('Passkey not initialized for this user')
    const payload = decryptPasskeyPayload(keyFileContent)
    if (payload?.uid !== user.id || !payload?.key) throw new Error('Passkey does not match this account')
    let expectedHash = user.passcode_key_hash
    if (!expectedHash) {
      const fallback = await UserRepository.getFallbackPasskeyRow(user.id)
      expectedHash = fallback?.code_hash || null
    }
    if (!expectedHash) throw new Error('Passkey not initialized for this user')
    const ok = await bcrypt.compare(String(payload.key), expectedHash)
    if (!ok) throw new Error('Invalid passkey')
  }

  static async userHasPasskey(userId, passcodeKeyHash) {
    if (passcodeKeyHash) return true
    const fallback = await UserRepository.getFallbackPasskeyRow(userId)
    return Boolean(fallback?.code_hash)
  }

  static async changePassword(user, { current_password, new_password, key_file_content }) {
    void key_file_content
    if (!new_password || new_password.length < 6) throw { message: 'New password must be 6+ chars', status: 400 }
    const ok = await bcrypt.compare(current_password || '', user.password_hash)
    if (!ok) throw { message: 'Current password incorrect', status: 401 }

    await UserService.updateUserPassword(user.id, new_password, false)
    await ActivityRepository.addAuditLog(null, user, 'Password changed', {
      event_type: 'password_changed',
      target_user_id: user.id,
      actor_role: user.role,
    })
    return { success: true }
  }

  static async forgotPasswordPasskey({ username, key_file_content, new_password }) {
    if (!username || !key_file_content || !new_password) {
      throw { message: 'username, key_file_content and new_password are required', status: 400 }
    }
    if (new_password.length < 6) throw { message: 'New password must be 6+ chars', status: 400 }

    const user = await findUserByIdentifier(username)
    if (!user) throw { message: 'Invalid username or passkey file', status: 401 }

    try {
      await AuthService.verifyUserPasskey(user, key_file_content)
    } catch {
      throw { message: 'Invalid username or passkey file', status: 401 }
    }

    await UserService.updateUserPassword(user.id, new_password, false)
    await ActivityRepository.addAuditLog(null, user, 'Password reset completed via passkey', {
      event_type: 'password_reset_completed',
      target_user_id: user.id,
      actor_role: user.role,
    })
    return { success: true }
  }

  static async requestResetEmail(identifier) {
    if (!identifier || !identifier.trim()) throw { message: 'Username or email address is required', status: 400 }
    return await requestPasswordResetEmail(identifier)
  }

  static async completeReset({ user_id, email, identifier, new_password }) {
    if (!new_password || new_password.length < 6) throw { message: 'A new password (6+ chars) is required', status: 400 }
    return await completePasswordReset({ userId: user_id, email, identifier, newPassword: new_password })
  }
}
