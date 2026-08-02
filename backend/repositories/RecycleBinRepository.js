import { supabaseAdmin as sb } from '@/lib/supabase'

export class RecycleBinRepository {
  static async moveToRecycleBin({ tableName, entityType, id, user, scope = null }) {
    let fetchQuery = sb.from(tableName).select('*').eq('id', id)
    if (scope?.field && scope?.value !== undefined) fetchQuery = fetchQuery.eq(scope.field, scope.value)
    const { data: row, error: fetchError } = await fetchQuery.maybeSingle()
    if (fetchError) throw new Error(fetchError.message)
    if (!row) return { ok: false, reason: 'not_found' }

    const { error: binError } = await sb.from('recycle_bin').insert({
      id: crypto.randomUUID(),
      entity_type: entityType,
      table_name: tableName,
      entity_id: row.id,
      payload: row,
      deleted_by: user?.id || null,
      deleted_by_username: user?.username || 'system',
    })
    if (binError) throw new Error(binError.message)

    let deleteQuery = sb.from(tableName).delete().eq('id', id)
    if (scope?.field && scope?.value !== undefined) deleteQuery = deleteQuery.eq(scope.field, scope.value)
    const { error: deleteError } = await deleteQuery
    if (deleteError) throw new Error(deleteError.message)

    return { ok: true, row }
  }

  static async restoreFromRecycleBin(entry, user) {
    const tableName = entry.table_name
    const payload = { ...(entry.payload || {}) }
    if (!payload.id) throw new Error('Invalid recycle bin payload')

    const { error: restoreError } = await sb.from(tableName).upsert(payload, { onConflict: 'id' })
    if (restoreError) throw new Error(restoreError.message)

    await sb.from('recycle_bin').update({
      restored_at: new Date().toISOString(),
      restored_by: user?.id || null,
      restored_by_username: user?.username || 'system',
    }).eq('id', entry.id)
  }

  static async getRecycleBinItems(limit = 300) {
    const { data, error } = await sb.from('recycle_bin')
      .select('id, entity_type, table_name, entity_id, payload, deleted_by, deleted_by_username, deleted_at, restored_by, restored_by_username, restored_at')
      .order('deleted_at', { ascending: false })
      .limit(limit)
    if (error) throw new Error(error.message)
    return data || []
  }

  static async getEntryById(id) {
    const { data } = await sb.from('recycle_bin').select('*').eq('id', id).maybeSingle()
    return data
  }

  static async deletePermanently(id) {
    const { error } = await sb.from('recycle_bin').delete().eq('id', id)
    if (error) throw new Error(error.message)
    return true
  }

  // --- Entity Delete Requests ---
  static async createEntityDeleteRequest(payload) {
    const { error } = await sb.from('entity_delete_requests').insert(payload)
    if (error) throw new Error(error.message)
    return true
  }

  static async checkPendingEntityDeleteRequest(entityType, entityId) {
    const { data } = await sb.from('entity_delete_requests')
      .select('id')
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .eq('status', 'pending')
      .maybeSingle()
    return data
  }

  static async getPendingEntityDeleteRequests(user) {
    let q = sb.from('entity_delete_requests')
      .select('id, entity_type, entity_id, table_name, client_id, requested_by, requested_by_username, requested_by_role, target_role, reason, status, reviewed_by, reviewed_by_username, reviewed_at, created_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
    if (user.role === 'Super-Admin') {
      q = q.eq('target_role', 'Super-Admin')
    } else if (user.role === 'Client-Admin') {
      q = q.eq('target_role', 'Client-Admin').eq('client_id', user.client_id)
    } else {
      q = q.eq('requested_by', user.id)
    }
    const { data, error } = await q
    if (error) throw new Error(error.message)
    return data || []
  }

  static async getEntityDeleteRequestById(id) {
    const { data } = await sb.from('entity_delete_requests').select('*').eq('id', id).maybeSingle()
    return data
  }

  static async updateEntityDeleteRequest(id, updateData) {
    const { error } = await sb.from('entity_delete_requests').update(updateData).eq('id', id)
    if (error) throw new Error(error.message)
  }
}
