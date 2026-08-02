import bcrypt from 'bcryptjs'
import { v4 as uuidv4 } from 'uuid'
import { supabaseAdmin as sb } from '@/lib/supabase'
import { createAppUser as authAdapterCreateUser } from '@/lib/auth-adapter'
import { UserRepository } from '../repositories/UserRepository'
import { ProjectRepository } from '../repositories/ProjectRepository'
import { ActivityRepository } from '../repositories/ActivityRepository'
import { stripSensitiveFields } from '../utils/apiResponse'
import { createPasskeyFile } from '../utils/passkeyUtils'
import { CLIENT_ROLES, INTERNAL_ROLES, CLIENT_ADMIN, CLIENT_USER, ADMIN, SUPER_ADMIN, DEFAULT_TEAM_PWD } from '../constants/backendRoles'

export class UserService {
  static async updateUserPassword(userId, newPassword, mustChangePassword = false) {
    const password_hash = await bcrypt.hash(newPassword, 10)
    return await UserRepository.updateUser(userId, {
      password_hash,
      must_change_password: mustChangePassword,
    })
  }

  static async savePasskeyCredential(userId, rawKey, extension) {
    if (await UserRepository.hasPasskeyColumns()) {
      await UserRepository.updateUser(userId, {
        passcode_key_hash: await bcrypt.hash(rawKey, 10),
        passcode_key_ext: extension,
        passcode_key_created_at: new Date().toISOString(),
      })
      return
    }

    const { error: consumeError } = await sb.from('password_reset_codes').update({ consumed_at: new Date().toISOString() })
      .eq('user_id', userId)
      .is('consumed_at', null)
      .is('created_by', null)
    if (consumeError) throw new Error(consumeError.message)

    const hundredYearsMs = 100 * 365 * 24 * 60 * 60 * 1000
    const expiresAt = new Date(Date.now() + hundredYearsMs)
    const { error: insertError } = await sb.from('password_reset_codes').insert({
      id: uuidv4(),
      user_id: userId,
      code_hash: await bcrypt.hash(rawKey, 10),
      expires_at: expiresAt.toISOString(),
      created_by: null,
      attempts: 0,
    })
    if (insertError) throw new Error(insertError.message)
  }

  static async listUsers(user) {
    if (INTERNAL_ROLES.includes(user.role)) {
      const [users, clients] = await Promise.all([
        UserRepository.getAllUsers('*'),
        ProjectRepository.getClients(),
      ])
      const cmap = Object.fromEntries(clients.map(c => [c.id, c.name]))
      return { users: users.map(u => ({ ...stripSensitiveFields(u), client_name: cmap[u.client_id] || null })) }
    }
    if (user.role === CLIENT_ADMIN) {
      const orgUsers = await UserRepository.getUsersByClient(user.client_id, '*')
      return { users: orgUsers.map(u => stripSensitiveFields(u)) }
    }
    throw { message: 'Forbidden', status: 403 }
  }

  static async createUser(user, body) {
    const { username, role, client_id, password, email, first_name, last_name, phone } = body
    if (!username || !role) throw { message: 'Username & Role are required', status: 400 }

    if (user.role === CLIENT_ADMIN) {
      if (!CLIENT_ROLES.includes(role)) throw { message: 'Client-Admin can only create Client-User or Client-Admin accounts', status: 403 }
    } else if (!INTERNAL_ROLES.includes(user.role)) {
      throw { message: 'Forbidden', status: 403 }
    }
    if (user.role === ADMIN) throw { message: 'Forbidden — only Super-Admin can create users', status: 403 }

    const usernameVal = username.trim()
    if (usernameVal.length < 3) throw { message: 'Username must be at least 3 characters long', status: 400 }
    if (!/^[a-zA-Z0-9_.-]+$/.test(usernameVal)) throw { message: 'Username can only contain letters, numbers, underscores, dots, and hyphens', status: 400 }

    const exists = await UserRepository.checkUsernameExists(usernameVal)
    if (exists) throw { message: `Username '${usernameVal}' is already taken`, status: 409 }

    const firstNameVal = (first_name || '').trim()
    const lastNameVal = (last_name || '').trim()
    if (!firstNameVal) throw { message: 'First Name is required', status: 400 }
    if (!lastNameVal) throw { message: 'Last Name is required', status: 400 }

    const isClientRole = CLIENT_ROLES.includes(role)
    const emailVal = (email || '').trim()
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

    if (isClientRole) {
      if (!emailVal) throw { message: 'Email address is required for Client roles', status: 400 }
      if (!emailRegex.test(emailVal)) throw { message: 'Please enter a valid email address', status: 400 }
    } else if (emailVal && !emailRegex.test(emailVal)) {
      throw { message: 'Please enter a valid email address', status: 400 }
    }

    const assignedClientId = user.role === CLIENT_ADMIN ? (user.client_id || user.client?.id) : (isClientRole ? (client_id || null) : null)
    if (isClientRole && !assignedClientId) {
      throw { message: 'Client Organization selection is required for Client roles', status: 400 }
    }

    const pwd = password || DEFAULT_TEAM_PWD
    const result = await authAdapterCreateUser({
      id: uuidv4(),
      username: usernameVal,
      email: emailVal || null,
      first_name: firstNameVal,
      last_name: lastNameVal,
      phone: (phone || '').trim() || null,
      password: pwd,
      role,
      client_id: assignedClientId,
      must_change_password: true,
    })

    await ActivityRepository.addAuditLog(null, user, `User created: ${result.user.username}`, {
      event_type: 'user_created',
      target_user_id: result.user.id,
      target_role: result.user.role,
      target_client_id: result.user.client_id || null,
      actor_role: user.role,
    })

    return { user: result.user, default_password: result.default_password }
  }

  static async resetPasswordByAdmin(requestingUser, targetId, newPassword) {
    if (requestingUser.role !== SUPER_ADMIN) throw { message: 'Forbidden — only Super-Admin can reset passwords', status: 403 }
    const password = (newPassword || DEFAULT_TEAM_PWD).trim()
    if (password.length < 6) throw { message: 'Password must be 6+ chars', status: 400 }

    const target = await UserRepository.findById(targetId)
    if (!target) throw { message: 'User not found', status: 404 }
    if (target.username === 'devbond01') throw { message: 'Cannot reset Super-Admin root account through this action', status: 400 }

    await UserService.updateUserPassword(targetId, password, true)
    await ActivityRepository.addAuditLog(null, requestingUser, `User password reset: ${target.username}`, {
      event_type: 'user_password_reset',
      target_user_id: target.id,
      target_username: target.username,
      actor_role: requestingUser.role,
    })
    return { success: true, username: target.username, temporary_password: password }
  }

  static async resetPasscodeByAdmin(requestingUser, targetId) {
    if (requestingUser.role !== SUPER_ADMIN) throw { message: 'Forbidden — only Super-Admin can generate passkey files', status: 403 }
    const target = await UserRepository.findById(targetId)
    if (!target) throw { message: 'User not found', status: 404 }

    const generated = createPasskeyFile(targetId)
    await UserService.savePasskeyCredential(targetId, generated.rawKey, generated.extension)

    await ActivityRepository.addAuditLog(null, requestingUser, `User passkey regenerated: ${target.username}`, {
      event_type: 'user_passkey_regenerated',
      target_user_id: target.id,
      target_username: target.username,
      actor_role: requestingUser.role,
    })

    return {
      success: true,
      username: target.username,
      passkey_file: {
        file_name: generated.file_name,
        file_content: generated.file_content,
      },
    }
  }

  static async checkUsername(usernameParam) {
    const trimmed = (usernameParam || '').trim()
    if (!trimmed) throw { message: 'Username query parameter is required', status: 400 }
    const existing = await UserRepository.checkUsernameExists(trimmed)
    return { available: !existing, username: trimmed, exists: Boolean(existing) }
  }
}
