import { supabaseAdmin as sb } from '@/lib/supabase'

export class SupportRepository {
  static schemaSupport = null

  static async checkColumn(columnName) {
    const { error } = await sb.from('support_tickets').select(`id, ${columnName}`).limit(1)
    return !error
  }

  static async getSchemaSupport() {
    if (SupportRepository.schemaSupport) return SupportRepository.schemaSupport

    const [hasProjectId, hasAssignedTo, hasPriority, hasCommentsLog] = await Promise.all([
      SupportRepository.checkColumn('project_id'),
      SupportRepository.checkColumn('assigned_to'),
      SupportRepository.checkColumn('priority'),
      SupportRepository.checkColumn('comments_log'),
    ])

    SupportRepository.schemaSupport = {
      hasProjectId,
      hasAssignedTo,
      hasPriority,
      hasCommentsLog,
    }

    return SupportRepository.schemaSupport
  }

  static async getTickets(user, from, to, projectId = null) {
    const schema = await SupportRepository.getSchemaSupport()

    const baseCols = ['id', 'client_id', 'created_by', 'title', 'description', 'severity', 'status', 'resolution_note', 'created_at', 'updated_at', 'resolved_at']
    if (schema.hasProjectId) baseCols.push('project_id')
    if (schema.hasAssignedTo) baseCols.push('assigned_to')
    if (schema.hasPriority) baseCols.push('priority')
    if (schema.hasCommentsLog) baseCols.push('comments_log')

    let q = sb.from('support_tickets')
      .select(baseCols.join(', '))
      .order('created_at', { ascending: false })
      .range(from, to)

    if (projectId && schema.hasProjectId) {
      q = q.eq('project_id', projectId)
    }

    if (user.role !== 'Super-Admin') {
      q = q.eq('created_by', user.id)
    }
    const { data, error } = await q
    if (error) throw new Error(error.message)
    return { tickets: data || [], schema }
  }

  static async findById(id) {
    const { data } = await sb.from('support_tickets').select('*').eq('id', id).maybeSingle()
    return data
  }

  static async createTicket(payload) {
    const { data, error } = await sb.from('support_tickets').insert(payload).select().single()
    if (error) throw new Error(error.message)
    return data
  }

  static async updateTicket(id, updateData) {
    const { data, error } = await sb.from('support_tickets').update(updateData).eq('id', id).select().single()
    if (error) throw new Error(error.message)
    return data
  }
}
