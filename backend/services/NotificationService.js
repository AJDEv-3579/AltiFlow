import { supabaseAdmin as sb } from '@/lib/supabase'
import { ADMIN, CLIENT_ADMIN, CLIENT_USER, SUPER_ADMIN } from '../constants/backendRoles'

const readByUser = new Map()
const markAllByUser = new Map()

function getReadSet(userId) {
  if (!readByUser.has(userId)) readByUser.set(userId, new Set())
  return readByUser.get(userId)
}

function toTs(value) {
  const ms = new Date(value || 0).getTime()
  return Number.isFinite(ms) ? ms : 0
}

function parseActionDesc(actionDesc) {
  if (typeof actionDesc !== 'string') return null
  try {
    return JSON.parse(actionDesc)
  } catch {
    return null
  }
}

export class NotificationService {
  static async list(user, { limit = 50 }) {
    const scopedJobs = await NotificationService.getScopedJobs(user)
    const notifications = []

    if (scopedJobs.length > 0) {
      const jobIds = scopedJobs.map(j => j.id)
      const { data: comments = [] } = await sb
        .from('job_comments')
        .select('id, job_id, user_id, username, stage, comment, created_at')
        .in('job_id', jobIds)
        .order('created_at', { ascending: false })
        .limit(300)

      for (const c of comments) {
        if (!c.comment?.trim()) continue
        if (String(c.stage || '').toLowerCase() === 'created') continue
        const job = scopedJobs.find(j => j.id === c.job_id)
        if (!job) continue

        notifications.push({
          id: `job-comment-${c.id}`,
          type: 'job-comment',
          title: 'New Job Card Comment',
          message: `${c.username || 'User'} commented on ${job.title || 'job card'}`,
          timestamp: c.created_at,
          target_type: 'job',
          project_id: job.project_id,
          job_id: job.id,
        })
      }

      for (const j of scopedJobs) {
        const cancelled = j.status === 'Blocked' || j.sc_status === 'Blocked' || j.uni_status === 'Blocked'
        if (!cancelled) continue

        notifications.push({
          id: `job-cancelled-${j.id}`,
          type: 'job-cancelled',
          title: 'Job Card Cancelled',
          message: `${j.title || 'Job card'} was marked as cancelled/blocked`,
          timestamp: j.updated_at || j.created_at,
          target_type: 'job',
          project_id: j.project_id,
          job_id: j.id,
        })
      }
    }

    const scopedTickets = await NotificationService.getScopedSupportTickets(user, scopedJobs)
    const supportTicketIds = scopedTickets.map(t => t.id)
    const supportEvents = supportTicketIds.length > 0
      ? await NotificationService.getSupportEvents(supportTicketIds)
      : []

    const supportEventsByTicket = supportEvents.reduce((acc, row) => {
      const parsed = parseActionDesc(row.action_desc)
      const ticketId = parsed?.support_ticket_id
      if (!ticketId) return acc
      if (!acc[ticketId]) acc[ticketId] = []
      acc[ticketId].push({ row, parsed })
      return acc
    }, {})

    for (const t of scopedTickets) {
      const ticketEvents = supportEventsByTicket[t.id] || []
      for (const ev of ticketEvents) {
        if (ev.parsed?.event_type === 'support_ticket_comment') {
          notifications.push({
            id: `support-comment-${ev.row.id}`,
            type: 'support-comment',
            title: 'New Support Ticket Comment',
            message: `${ev.row.username || 'User'} commented on support ticket ${t.title || ''}`.trim(),
            timestamp: ev.row.timestamp || t.updated_at || t.created_at,
            target_type: 'support-ticket',
            ticket_id: t.id,
            project_id: null,
          })
        }

        if (ev.parsed?.event_type === 'support_ticket_status_changed' && user.role === CLIENT_USER && t.created_by === user.id) {
          notifications.push({
            id: `support-status-${ev.row.id}`,
            type: 'support-status',
            title: 'Support Ticket Updated',
            message: `${t.title || 'Support ticket'} status changed to ${ev.parsed?.status || t.status}`,
            timestamp: ev.row.timestamp || t.updated_at || t.created_at,
            target_type: 'support-ticket',
            ticket_id: t.id,
            project_id: null,
          })
        }
      }
    }

    notifications.sort((a, b) => toTs(b.timestamp) - toTs(a.timestamp))

    const markAllTs = markAllByUser.get(user.id) || 0
    const readSet = getReadSet(user.id)
    const sliced = notifications.slice(0, Math.max(1, Math.min(200, Number(limit) || 50))).map(n => ({
      ...n,
      read: readSet.has(n.id) || toTs(n.timestamp) <= markAllTs,
    }))

    const unreadCount = sliced.filter(n => !n.read).length
    return { notifications: sliced, unread_count: unreadCount }
  }

  static async markRead(user, notificationId) {
    if (!notificationId) throw { message: 'notification_id is required', status: 400 }
    getReadSet(user.id).add(notificationId)
    return { ok: true }
  }

  static async markAllRead(user) {
    markAllByUser.set(user.id, Date.now())
    getReadSet(user.id).clear()
    return { ok: true }
  }

  static async getScopedJobs(user) {
    let jobs = []

    if (user.role === SUPER_ADMIN) {
      const { data = [] } = await sb
        .from('jobs')
        .select('id, project_id, title, status, sc_status, uni_status, assigned_to, created_by, created_at, updated_at')
        .order('updated_at', { ascending: false })
        .limit(1000)
      jobs = data
    } else if (user.role === ADMIN) {
      const { data = [] } = await sb
        .from('jobs')
        .select('id, project_id, title, status, sc_status, uni_status, assigned_to, created_by, created_at, updated_at')
        .eq('assigned_to', user.id)
        .order('updated_at', { ascending: false })
        .limit(1000)
      jobs = data
    } else if (user.role === CLIENT_ADMIN) {
      const { data: projectRows = [] } = await sb
        .from('client_projects')
        .select('id')
        .eq('client_id', user.client_id)
      const projectIds = projectRows.map(p => p.id)
      if (projectIds.length === 0) return []

      const { data = [] } = await sb
        .from('jobs')
        .select('id, project_id, title, status, sc_status, uni_status, assigned_to, created_by, created_at, updated_at')
        .in('project_id', projectIds)
        .order('updated_at', { ascending: false })
        .limit(1000)
      jobs = data
    } else if (user.role === CLIENT_USER) {
      const { data = [] } = await sb
        .from('jobs')
        .select('id, project_id, title, status, sc_status, uni_status, assigned_to, created_by, created_at, updated_at')
        .eq('created_by', user.id)
        .order('updated_at', { ascending: false })
        .limit(1000)
      jobs = data
    }

    return jobs || []
  }

  static async getScopedSupportTickets(user, scopedJobs) {
    const { data: tickets = [] } = await sb
      .from('support_tickets')
      .select('id, client_id, created_by, title, status, created_at, updated_at')
      .order('updated_at', { ascending: false })
      .limit(600)

    if (user.role === SUPER_ADMIN) return tickets

    if (user.role === ADMIN) {
      return tickets.filter(t => t.created_by === user.id)
    }

    if (user.role === CLIENT_ADMIN) {
      return tickets.filter(t => t.client_id === user.client_id)
    }

    if (user.role === CLIENT_USER) {
      return tickets.filter(t => t.created_by === user.id)
    }

    return []
  }

  static async getSupportEvents(ticketIds) {
    if (!ticketIds || ticketIds.length === 0) return []
    const { data: rows = [] } = await sb
      .from('audit_logs')
      .select('id, username, action_desc, timestamp')
      .order('timestamp', { ascending: false })
      .limit(1200)

    const idSet = new Set(ticketIds)
    return rows.filter((r) => {
      const parsed = parseActionDesc(r.action_desc)
      return Boolean(parsed?.support_ticket_id && idSet.has(parsed.support_ticket_id))
    })
  }
}

export default NotificationService
