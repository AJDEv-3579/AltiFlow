import { supabaseAdmin as sb } from '@/lib/supabase'

let jobsAdvancedSchemaAvailable = null
let jobsPrioritySchemaAvailable = null

export class JobRepository {
  static async hasAdvancedSchema() {
    if (jobsAdvancedSchemaAvailable !== null) return jobsAdvancedSchemaAvailable
    const { error } = await sb
      .from('jobs')
      .select('id, sc_status, uni_status, category, capture_date, drone_name, flight_count, flights, has_logs, comments')
      .limit(1)
    jobsAdvancedSchemaAvailable = !error
    return jobsAdvancedSchemaAvailable
  }

  static async hasPrioritySchema() {
    if (jobsPrioritySchemaAvailable === true) return true
    const { error } = await sb
      .from('jobs')
      .select('id, is_priority')
      .limit(1)
    if (!error) jobsPrioritySchemaAvailable = true
    return !error
  }

  static extractPriority(j) {
    if (!j) return false
    if (j.is_priority !== undefined && j.is_priority !== null) return Boolean(j.is_priority)
    if (Array.isArray(j.flights) && j.flights[0] && j.flights[0].__is_priority !== undefined) {
      return Boolean(j.flights[0].__is_priority)
    }
    return false
  }

  static async getSelectColumns(advanced, includeUserRelations = false) {
    const priorityAvailable = await JobRepository.hasPrioritySchema()
    const basePriority = priorityAvailable ? ', is_priority' : ''
    const base = `id, project_id, title, description, status, assigned_to, created_by, created_at, updated_at${basePriority}`
    const advancedCols = 'sc_status, uni_status, category, capture_date, drone_name, flight_count, flights, has_logs, comments'
    const relations = includeUserRelations ? ', assigned_user:assigned_to(username), creator:created_by(username)' : ''
    return advanced ? `${base}, ${advancedCols}${relations}` : `${base}${relations}`
  }

  static async getJobsByProject(projectId, from, to) {
    const supportsAdvanced = await JobRepository.hasAdvancedSchema()
    const selectCols = await JobRepository.getSelectColumns(supportsAdvanced, true)
    const { data, error } = await sb
      .from('jobs')
      .select(selectCols)
      .eq('project_id', projectId)
      .order('updated_at', { ascending: false })
      .range(from, to)
    if (error) throw new Error(error.message)
    return data || []
  }

  static async getAssignedJobs(user, from, to) {
    const supportsAdvanced = await JobRepository.hasAdvancedSchema()
    const selectCols = await JobRepository.getSelectColumns(supportsAdvanced, false)
    let q = sb.from('jobs')
      .select(selectCols)
      .order('updated_at', { ascending: false })
      .range(from, to)

    if (user.role === 'Admin') q = q.eq('assigned_to', user.id)
    const { data, error } = await q
    if (error) throw new Error(error.message)
    return data || []
  }

  static async findById(id, projectId = null) {
    let q = sb.from('jobs').select('*').eq('id', id)
    if (projectId) q = q.eq('project_id', projectId)
    const { data } = await q.maybeSingle()
    return data
  }

  static async getJobsByIds(ids) {
    if (!ids || ids.length === 0) return []
    const supportsAdvanced = await JobRepository.hasAdvancedSchema()
    const selectCols = await JobRepository.getSelectColumns(supportsAdvanced, false)
    const { data, error } = await sb
      .from('jobs')
      .select(selectCols)
      .in('id', ids)
    if (error) throw new Error(error.message)
    return data || []
  }

  static async createJob(payload) {
    const { data, error } = await sb.from('jobs').insert(payload).select().single()
    if (error) throw new Error(error.message)
    return data
  }

  static async updateJob(id, projectId, updateData) {
    const { data, error } = await sb.from('jobs')
      .update({ ...updateData, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('project_id', projectId)
      .select()
      .single()
    if (error) throw new Error(error.message)
    return data
  }

  static async getJobComments(jobIds, limitPerJob = 10) {
    if (!jobIds || jobIds.length === 0) return {}
    const { data: commentRows } = await sb.from('job_comments')
      .select('id, job_id, user_id, username, stage, comment, created_at')
      .in('job_id', jobIds)
      .order('created_at', { ascending: false })

    const commentsByJob = {}
    for (const c of (commentRows || [])) {
      if (!commentsByJob[c.job_id]) commentsByJob[c.job_id] = []
      if (commentsByJob[c.job_id].length < limitPerJob) commentsByJob[c.job_id].push(c)
    }
    return commentsByJob
  }

  static async addJobComment(newRow) {
    const { error } = await sb.from('job_comments').insert(newRow)
    if (error) console.warn('[Comments] addJobComment insert error:', error.message)
    return newRow
  }
}
