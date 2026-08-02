import { supabaseAdmin as sb } from '@/lib/supabase'

export class ProjectRepository {
  // --- Clients ---
  static async getClients() {
    const { data } = await sb.from('clients').select('id, name, logo_url, created_at').order('created_at', { ascending: false })
    return data || []
  }

  static async getClientsByIds(ids) {
    if (!ids || ids.length === 0) return []
    const { data } = await sb.from('clients').select('id, name').in('id', ids)
    return data || []
  }

  static async createClient(payload) {
    const { data, error } = await sb.from('clients').insert(payload).select().single()
    if (error) throw new Error(error.message)
    return data
  }

  // --- Client Projects ---
  static async getClientProjects({ user, from, to }) {
    let q = sb.from('client_projects')
      .select('id, client_id, name, type, start_date, end_date, head, created_by, created_at, updated_at')
      .order('created_at', { ascending: false })
      .range(from, to)

    if (user.role === 'Client-User') {
      const { data: assignments } = await sb.from('user_projects').select('project_id').eq('user_id', user.id)
      const ids = (assignments || []).map(a => a.project_id)
      if (ids.length === 0) return []
      q = q.in('id', ids)
    } else if (user.role === 'Client-Admin') {
      q = q.eq('client_id', user.client_id)
    }

    const { data, error } = await q
    if (error) throw new Error(error.message)
    return data || []
  }

  static async findClientProjectById(id, clientId = null) {
    let q = sb.from('client_projects').select('*').eq('id', id)
    if (clientId) q = q.eq('client_id', clientId)
    const { data } = await q.maybeSingle()
    return data
  }

  static async createClientProject(payload) {
    const { data, error } = await sb.from('client_projects').insert(payload).select().single()
    if (error) throw new Error(error.message)
    return data
  }

  static async updateClientProject(id, updateData) {
    const { data, error } = await sb.from('client_projects').update(updateData).eq('id', id).select().single()
    if (error) throw new Error(error.message)
    return data
  }

  // --- Legacy Projects ---
  static async getLegacyProjects({ user, from, to }) {
    let q = sb.from('projects')
      .select('id, client_id, title, drone_name, capture_date, upload_timestamp, image_count, csv_count, base_rover_bool, grid_file_bool, status, assigned_to, sla_deadline, sla_hours, sla_daily_count, refly_reason, issue_note, issue_photo, refly_resolved, delivery_confirmed, delivery_confirmed_at, created_at')
      .order('upload_timestamp', { ascending: false })
      .range(from, to)

    if (user.role === 'Client-Admin') {
      q = q.eq('client_id', user.client_id)
    } else if (user.role === 'Admin') {
      const { data: assignments } = await sb.from('user_projects').select('project_id').eq('user_id', user.id)
      const ids = (assignments || []).map(a => a.project_id)
      if (ids.length > 0) {
        q = q.or(`assigned_to.eq.${user.id},id.in.(${ids.map(id => `"${id}"`).join(',')})`)
      } else {
        q = q.eq('assigned_to', user.id)
      }
    } else if (user.role === 'Client-User') {
      const { data: assignments } = await sb.from('user_projects').select('project_id').eq('user_id', user.id)
      const ids = (assignments || []).map(a => a.project_id)
      if (ids.length === 0) return []
      q = q.in('id', ids)
    }

    const { data, error } = await q
    if (error) throw new Error(error.message)
    return data || []
  }

  static async createLegacyProject(payload) {
    const { data, error } = await sb.from('projects').insert(payload).select().single()
    if (error) throw new Error(error.message)
    return data
  }

  static async updateLegacyProject(id, updateData) {
    const { data, error } = await sb.from('projects').update(updateData).eq('id', id).select().single()
    if (error) throw new Error(error.message)
    return data
  }

  static async countProjectsByClientAndDate(clientId, startIso, endIso) {
    const { count } = await sb.from('projects')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', clientId)
      .gte('upload_timestamp', startIso)
      .lte('upload_timestamp', endIso)
    return count || 0
  }

  // --- User Projects Assignments ---
  static async getAssignedUserIds(projectId) {
    const { data } = await sb.from('user_projects').select('user_id').eq('project_id', projectId)
    return (data || []).map(r => r.user_id)
  }

  static async assignUsersToProject(projectId, userIds) {
    await sb.from('user_projects').delete().eq('project_id', projectId)
    if (userIds.length > 0) {
      const { error } = await sb.from('user_projects').insert(
        userIds.map(uid => ({ id: crypto.randomUUID(), user_id: uid, project_id: projectId }))
      )
      if (error) throw error
    }
  }
}
