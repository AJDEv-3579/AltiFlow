import { v4 as uuidv4 } from 'uuid'
import { supabaseAdmin as sb } from '@/lib/supabase'
import { JobRepository } from '../repositories/JobRepository'
import { ProjectRepository } from '../repositories/ProjectRepository'
import { UserRepository } from '../repositories/UserRepository'
import { ActivityRepository } from '../repositories/ActivityRepository'
import { CLIENT_ROLES, INTERNAL_ROLES, ADMIN, SUPER_ADMIN } from '../constants/backendRoles'

export class JobService {
  static async nextJobAdminAssignee() {
    const { data: admins, error: adminErr } = await sb.from('users').select('id').eq('role', ADMIN).order('created_at', { ascending: true })
    if (adminErr || !admins || admins.length === 0) return null

    const stateKey = 'job_admin_rr_index'
    const { data: state } = await sb.from('system_state').select('value').eq('key', stateKey).maybeSingle()
    if (!state) {
      await sb.from('system_state').insert({ key: stateKey, value: 0 })
    }
    const current = state?.value ?? 0
    const idx = current % admins.length
    await sb.from('system_state').update({ value: current + 1 }).eq('key', stateKey)
    return admins[idx]
  }

  static async listJobsByProject(user, projectId, { page, limit, commentLimit, from, to }) {
    let proj = await ProjectRepository.findClientProjectById(projectId, CLIENT_ROLES.includes(user.role) ? user.client_id : null)
    if (!proj) throw { message: 'Project not found', status: 404 }

    const rawJobs = await JobRepository.getJobsByProject(projectId, from, to)
    const jobIds = rawJobs.map(j => j.id)
    const commentsByJob = await JobRepository.getJobComments(jobIds, commentLimit)

    const jobs = rawJobs.map(j => {
      const cat = j.category || 'Stand Count'
      const fallback = j.status === 'Blocked' ? 'Cancelled' : (j.status === 'Open' ? 'Pending' : j.status)
      return {
        ...j,
        is_priority: JobRepository.extractPriority(j),
        category: cat,
        sc_status: cat === 'Uniformity' ? 'Yet to Upload' : (j.sc_status || fallback),
        uni_status: cat === 'Stand Count' ? 'Yet to Upload' : (j.uni_status || fallback),
        assigned_to_name: j.assigned_user?.username || null,
        created_by_name: j.creator?.username || null,
        comments_log: commentsByJob[j.id] || [],
      }
    })
    return { jobs, page, limit, comment_limit: commentLimit }
  }

  static async listAssignedJobs(user, { page, limit, commentLimit, from, to }) {
    if (![ADMIN, SUPER_ADMIN].includes(user.role)) throw { message: 'Forbidden', status: 403 }
    const rawJobs = await JobRepository.getAssignedJobs(user, from, to)

    const projectIds = [...new Set(rawJobs.map(j => j.project_id))]
    const userIds = [...new Set(rawJobs.flatMap(j => [j.assigned_to, j.created_by]).filter(Boolean))]
    const projects = await ProjectRepository.getClientProjects({ user: { role: 'Super-Admin' }, from: 0, to: 1000 })
    const filteredProjects = projects.filter(p => projectIds.includes(p.id))
    const users = userIds.length > 0 ? await UserRepository.getAllUsers('id, username') : []
    const clientIds = [...new Set(filteredProjects.map(p => p.client_id).filter(Boolean))]
    const clients = await ProjectRepository.getClientsByIds(clientIds)
    const commentsByJob = await JobRepository.getJobComments(rawJobs.map(j => j.id), commentLimit)

    const pMap = Object.fromEntries(filteredProjects.map(p => [p.id, p]))
    const cMap = Object.fromEntries(clients.map(c => [c.id, c.name]))
    const uMap = Object.fromEntries(users.map(u => [u.id, u.username]))

    const jobs = rawJobs.map(j => {
      const p = pMap[j.project_id]
      const cat = j.category || 'Stand Count'
      const legacyStage = j.status === 'Blocked'
        ? 'Cancelled'
        : ((j.status === 'In Progress' || j.status === 'Done') ? j.status : 'Pending')
      return {
        ...j,
        is_priority: JobRepository.extractPriority(j),
        category: cat,
        sc_status: cat === 'Uniformity' ? 'Yet to Upload' : (j.sc_status || legacyStage),
        uni_status: cat === 'Stand Count' ? 'Yet to Upload' : (j.uni_status || legacyStage),
        project_name: p?.name || null,
        project_type: p?.type || null,
        client_name: p?.client_id ? (cMap[p.client_id] || null) : null,
        assigned_to_name: uMap[j.assigned_to] || null,
        created_by_name: uMap[j.created_by] || null,
        comments_log: commentsByJob[j.id] || [],
      }
    })
    return { jobs, page, limit, comment_limit: commentLimit }
  }

  static async createJob(user, projectId, body) {
    const proj = await ProjectRepository.findClientProjectById(projectId, CLIENT_ROLES.includes(user.role) ? user.client_id : null)
    if (!proj) throw { message: 'Project not found', status: 404 }

    const { title, capture_date, drone_name, category, flight_count, flights, has_logs, comments, assigned_to } = body
    if (!title?.trim()) throw { message: 'Title required', status: 400 }

    const VALID_CATS = ['Stand Count', 'Uniformity']
    if (category && !VALID_CATS.includes(category)) throw { message: 'Invalid category', status: 400 }

    let assigneeId = null
    if (CLIENT_ROLES.includes(user.role)) {
      const rrAdmin = await JobService.nextJobAdminAssignee()
      assigneeId = rrAdmin?.id || null
    } else {
      if (assigned_to) {
        assigneeId = assigned_to
      } else {
        const rrAdmin = await JobService.nextJobAdminAssignee()
        assigneeId = rrAdmin?.id || null
      }
    }

    if (assigneeId) {
      const assignee = await UserRepository.findById(assigneeId)
      if (!assignee || ![ADMIN, SUPER_ADMIN].includes(assignee.role)) throw { message: 'assigned_to must be an Admin user', status: 400 }
    }

    const targetCategory = VALID_CATS.includes(category) ? category : 'Stand Count'
    const existingJobs = await JobRepository.getJobsByProject(projectId, 0, 500)
    if (existingJobs.some(j => (j.title || '').trim().toLowerCase() === title.trim().toLowerCase() && (j.category || 'Stand Count') === targetCategory)) {
      throw { message: `A field named "${title.trim()}" already exists in the ${targetCategory} category.`, status: 409 }
    }

    const supportsAdvanced = await JobRepository.hasAdvancedSchema()
    const supportsPriority = await JobRepository.hasPrioritySchema()

    const insertPayload = {
      id: uuidv4(),
      project_id: projectId,
      title: title.trim(),
      assigned_to: assigneeId,
      status: 'Open',
      created_by: user.id,
    }

    if (supportsPriority) insertPayload.is_priority = body.is_priority === true
    if (supportsAdvanced) {
      insertPayload.capture_date = capture_date || null
      insertPayload.drone_name = drone_name?.trim() || null
      insertPayload.category = targetCategory
      insertPayload.flight_count = flight_count || 1
      insertPayload.flights = Array.isArray(flights) ? flights : []
      insertPayload.has_logs = has_logs === true
      insertPayload.comments = comments?.trim() || null
    } else {
      insertPayload.description = comments?.trim() || null
    }

    const job = await JobRepository.createJob(insertPayload)
    await JobRepository.addJobComment({
      id: uuidv4(),
      job_id: job.id,
      user_id: user?.id || null,
      username: user?.username || 'system',
      stage: 'Created',
      comment: 'Job card created',
      created_at: new Date().toISOString(),
    })

    if (comments?.trim()) {
      await JobRepository.addJobComment({
        id: uuidv4(),
        job_id: job.id,
        user_id: user?.id || null,
        username: user?.username || 'system',
        stage: 'Created',
        comment: comments.trim(),
        created_at: new Date().toISOString(),
      })
    }

    await ActivityRepository.addAuditLog(projectId, user, `Job card created: ${job.title}`, {
      event_type: 'job_created',
      job_id: job.id,
      category: job.category || targetCategory,
      is_priority: JobRepository.extractPriority(job),
      actor_role: user.role,
    })

    return { job }
  }

  static async updateJob(user, projectId, jobId, body) {
    const proj = await ProjectRepository.findClientProjectById(projectId, CLIENT_ROLES.includes(user.role) ? user.client_id : null)
    if (!proj) throw { message: 'Project not found', status: 404 }

    const currentJob = await JobRepository.findById(jobId, projectId)
    if (!currentJob) throw { message: 'Job not found', status: 404 }

    const allowed = {}
    const STAGE_VALS = ['Pending', 'In Progress', 'Done', 'Blocked', 'Cancelled']
    const hasScStatus = Object.prototype.hasOwnProperty.call(currentJob, 'sc_status')
    const hasUniStatus = Object.prototype.hasOwnProperty.call(currentJob, 'uni_status')
    const hasComments = Object.prototype.hasOwnProperty.call(currentJob, 'comments')
    const hasLogs = Object.prototype.hasOwnProperty.call(currentJob, 'has_logs')
    const hasCategory = Object.prototype.hasOwnProperty.call(currentJob, 'category')

    const toDbStage = (stage) => (stage === 'Cancelled' ? 'Blocked' : stage)
    const statusFromStage = (stage) => {
      if (stage === 'Pending') return 'Open'
      if (stage === 'Cancelled') return 'Blocked'
      return stage
    }

    if (body.status && ['Open', 'In Progress', 'Done', 'Blocked'].includes(body.status)) allowed.status = body.status
    if (body.sc_status && STAGE_VALS.includes(body.sc_status)) {
      if (hasScStatus) allowed.sc_status = toDbStage(body.sc_status)
      allowed.status = statusFromStage(body.sc_status)
    }
    if (body.uni_status && STAGE_VALS.includes(body.uni_status)) {
      if (hasUniStatus) allowed.uni_status = toDbStage(body.uni_status)
      allowed.status = statusFromStage(body.uni_status)
    }

    const newTitle = body.title ? body.title.trim() : currentJob.title
    const newCategory = body.category && ['Stand Count', 'Uniformity'].includes(body.category) ? body.category : (currentJob.category || 'Stand Count')
    if (body.title || body.category) {
      const existingJobs = await JobRepository.getJobsByProject(projectId, 0, 500)
      const isDup = existingJobs.some(j => j.id !== jobId && (j.title || '').trim().toLowerCase() === newTitle.toLowerCase() && (j.category || 'Stand Count') === newCategory)
      if (isDup) throw { message: `A field named "${newTitle}" already exists in the ${newCategory} category.`, status: 409 }
    }

    if (body.title) allowed.title = body.title.trim()
    if (body.capture_date !== undefined) allowed.capture_date = body.capture_date || null
    if (body.drone_name !== undefined) allowed.drone_name = body.drone_name?.trim() || null
    if (body.flight_count !== undefined) allowed.flight_count = Math.max(1, Math.min(10, Number(body.flight_count) || 1))
    if (body.flights !== undefined && Array.isArray(body.flights)) allowed.flights = body.flights
    if (body.comments !== undefined && hasComments) allowed.comments = body.comments?.trim() || null
    if (body.has_logs !== undefined && hasLogs) allowed.has_logs = body.has_logs === true

    const supportsPriority = await JobRepository.hasPrioritySchema()
    if (body.is_priority !== undefined) {
      if (supportsPriority) {
        allowed.is_priority = body.is_priority === true
      } else {
        const rawFlights = allowed.flights || currentJob.flights
        const currentFlights = Array.isArray(rawFlights) && rawFlights.length > 0 ? [...rawFlights] : [{ image_count: null, csv_rows: null }]
        currentFlights[0] = { ...currentFlights[0], __is_priority: body.is_priority === true }
        allowed.flights = currentFlights
      }
    }

    if (body.assigned_to !== undefined) {
      if (![ADMIN, SUPER_ADMIN].includes(user.role)) throw { message: 'Only Admin can reassign jobs', status: 403 }
      if (body.assigned_to) {
        const assignee = await UserRepository.findById(body.assigned_to)
        if (!assignee || ![ADMIN, SUPER_ADMIN].includes(assignee.role)) throw { message: 'assigned_to must be an Admin user', status: 400 }
        allowed.assigned_to = body.assigned_to
      } else {
        allowed.assigned_to = null
      }
    }
    if (body.category && hasCategory && ['Stand Count', 'Uniformity'].includes(body.category)) allowed.category = body.category

    const job = await JobRepository.updateJob(jobId, projectId, allowed)

    const changeFlags = {
      title_changed: allowed.title !== undefined && allowed.title !== currentJob.title,
      assignment_changed: allowed.assigned_to !== undefined && allowed.assigned_to !== currentJob.assigned_to,
      category_changed: allowed.category !== undefined && allowed.category !== currentJob.category,
      priority_changed: allowed.is_priority !== undefined,
      stage_changed: allowed.sc_status !== undefined || allowed.uni_status !== undefined || allowed.status !== undefined,
      cancelled: allowed.status === 'Blocked' || allowed.sc_status === 'Blocked' || allowed.uni_status === 'Blocked',
    }

    await ActivityRepository.addAuditLog(projectId, user, `Job card updated: ${job.title}`, {
      event_type: 'job_updated',
      job_id: job.id,
      actor_role: user.role,
      ...changeFlags,
      next_status: job.status,
      next_sc_status: job.sc_status,
      next_uni_status: job.uni_status,
      next_is_priority: JobRepository.extractPriority(job),
    })

    if (body.pipeline_comment?.trim()) {
      await JobRepository.addJobComment({
        id: uuidv4(),
        job_id: jobId,
        user_id: user?.id || null,
        username: user?.username || 'system',
        stage: body.pipeline_stage || 'General',
        comment: body.pipeline_comment.trim(),
        created_at: new Date().toISOString(),
      })

      await ActivityRepository.addAuditLog(projectId, user, `Pipeline comment added: ${job.title}`, {
        event_type: 'pipeline_comment_added',
        job_id: job.id,
        pipeline_stage: body.pipeline_stage || 'General',
        actor_role: user.role,
      })
    }
    return { job }
  }

  static async addComment(user, projectId, jobId, { comment, stage }) {
    const proj = await ProjectRepository.findClientProjectById(projectId, CLIENT_ROLES.includes(user.role) ? user.client_id : null)
    if (!proj) throw { message: 'Project not found', status: 404 }
    if (!comment?.trim()) throw { message: 'comment required', status: 400 }

    const added = await JobRepository.addJobComment({
      id: uuidv4(),
      job_id: jobId,
      user_id: user?.id || null,
      username: user?.username || 'system',
      stage: stage || 'General',
      comment: comment.trim(),
      created_at: new Date().toISOString(),
    })
    await ActivityRepository.addAuditLog(projectId, user, `Job comment added: ${jobId}`, {
      event_type: 'job_comment_added',
      job_id: jobId,
      stage: stage || 'General',
      actor_role: user.role,
    })
    return { ok: true, comment: added }
  }
}
