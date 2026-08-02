import { supabaseAdmin as sb } from '@/lib/supabase'

export class ActivityRepository {
  static async addAuditLog(projectId, user, desc, meta = {}) {
    const actionDesc = (typeof desc === 'string' && meta && Object.keys(meta).length > 0)
      ? JSON.stringify({ desc, ...meta })
      : desc

    const payload = {
      id: crypto.randomUUID(),
      project_id: projectId || null,
      user_id: user?.id || null,
      username: user?.username || 'system',
      action_desc: actionDesc,
    }

    const { error } = await sb.from('audit_logs').insert(payload)
    if (error && String(error.message || '').toLowerCase().includes('foreign key')) {
      const { error: retryError } = await sb.from('audit_logs').insert({ ...payload, project_id: null })
      if (retryError) throw retryError
      return
    }
    if (error) throw error
  }

  static async getAuditLogs(from, to) {
    const { data } = await sb.from('audit_logs')
      .select('id, project_id, user_id, username, action_desc, timestamp')
      .order('timestamp', { ascending: false })
      .range(from, to)
    return data || []
  }

  static async getAuditLogsByProject(projectId, from, to) {
    const { data } = await sb.from('audit_logs')
      .select('id, project_id, user_id, username, action_desc, timestamp')
      .eq('project_id', projectId)
      .order('timestamp', { ascending: false })
      .range(from, to)
    return data || []
  }
}
