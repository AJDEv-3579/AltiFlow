import { supabaseAdmin as sb } from '@/lib/supabase'

export class UserRepository {
  static async findById(id) {
    const { data } = await sb.from('users').select('*').eq('id', id).maybeSingle()
    return data
  }

  static async findByUsername(username) {
    const { data } = await sb.from('users').select('*').ilike('username', username.trim()).maybeSingle()
    return data
  }

  static async checkUsernameExists(username) {
    const { data } = await sb.from('users').select('id, username').ilike('username', username.trim()).maybeSingle()
    return data
  }

  static async getAllUsers(selectFields = '*') {
    const { data, error } = await sb.from('users').select(selectFields).order('created_at', { ascending: false })
    if (error) {
      const baseSelect = 'id, username, role, client_id, must_change_password, created_at, email'
      const { data: fallbackData } = await sb.from('users').select(baseSelect).order('created_at', { ascending: false })
      return fallbackData || []
    }
    return data || []
  }

  static async getUsersByClient(clientId, selectFields = '*') {
    const { data, error } = await sb.from('users').select(selectFields).eq('client_id', clientId).order('created_at', { ascending: false })
    if (error) {
      const baseSelect = 'id, username, role, client_id, must_change_password, created_at, email'
      const { data: fallbackData } = await sb.from('users').select(baseSelect).eq('client_id', clientId).order('created_at', { ascending: false })
      return fallbackData || []
    }
    return data || []
  }

  static async updateUser(id, updateData) {
    const { data, error } = await sb.from('users').update(updateData).eq('id', id).select().single()
    if (error) throw new Error(error.message)
    return data
  }

  static async deleteUser(id) {
    const { error } = await sb.from('users').delete().eq('id', id)
    if (error) throw new Error(error.message)
    return true
  }

  static async hasPasskeyColumns() {
    const { error } = await sb.from('users').select('id, passcode_key_hash').limit(1)
    return !error
  }

  static async getFallbackPasskeyRow(userId) {
    const nowIso = new Date().toISOString()
    const { data } = await sb
      .from('password_reset_codes')
      .select('*')
      .eq('user_id', userId)
      .is('consumed_at', null)
      .is('created_by', null)
      .gt('expires_at', nowIso)
      .order('created_at', { ascending: false })
      .maybeSingle()
    return data || null
  }

  static async getAdmins() {
    const { data } = await sb.from('users').select('id, username').eq('role', 'Admin').order('created_at', { ascending: true })
    return data || []
  }

  static async getPendingDeletionRequests() {
    const { data } = await sb.from('delete_requests')
      .select('id, target_user_id, requested_by, reason, status, reviewed_by, created_at, reviewed_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
    return data || []
  }

  static async getDeletionRequestById(id) {
    const { data } = await sb.from('delete_requests').select('*').eq('id', id).maybeSingle()
    return data
  }

  static async updateDeletionRequest(id, updateData) {
    const { error } = await sb.from('delete_requests').update(updateData).eq('id', id)
    if (error) throw new Error(error.message)
  }

  static async createDeletionRequest(payload) {
    const { error } = await sb.from('delete_requests').insert(payload)
    if (error) throw new Error(error.message)
  }

  static async checkPendingDeletionRequest(targetUserId) {
    const { data } = await sb.from('delete_requests')
      .select('id').eq('target_user_id', targetUserId).eq('status', 'pending').maybeSingle()
    return data
  }
}
