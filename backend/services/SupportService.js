import { v4 as uuidv4 } from 'uuid'
import { SupportRepository } from '../repositories/SupportRepository'
import { UserRepository } from '../repositories/UserRepository'
import { ProjectRepository } from '../repositories/ProjectRepository'
import { ActivityRepository } from '../repositories/ActivityRepository'
import { CLIENT_ROLES, INTERNAL_ROLES, SUPER_ADMIN, ADMIN, CLIENT_ADMIN, CLIENT_USER } from '../constants/backendRoles'

export class SupportService {
  static assertTicketAccess(user, ticket) {
    const isSuperAdmin = user.role === 'Super-Admin'
    if (isSuperAdmin) return
    if (ticket.created_by !== user.id) {
      throw { message: 'Forbidden', status: 403 }
    }
  }

  static async listTickets(user, { page, limit, from, to, projectId }) {
    if (![...INTERNAL_ROLES, ...CLIENT_ROLES].includes(user.role)) throw { message: 'Forbidden', status: 403 }
    const { tickets, schema } = await SupportRepository.getTickets(user, from, to, projectId)

    const creatorIds = [...new Set(tickets.map(t => t.created_by))]
    const clientIds = [...new Set(tickets.map(t => t.client_id).filter(Boolean))]

    const creators = creatorIds.length > 0 ? await UserRepository.getAllUsers('id, username, role') : []
    const clients = clientIds.length > 0 ? await ProjectRepository.getClientsByIds(clientIds) : []

    const creatorMap = Object.fromEntries(creators.map(u => [u.id, u]))
    const clientMap = Object.fromEntries(clients.map(c => [c.id, c.name]))

    const schemaWarnings = []
    if (!schema.hasProjectId) schemaWarnings.push('support_tickets.project_id column not found; project-level ticket filtering is disabled.')
    if (!schema.hasAssignedTo) schemaWarnings.push('support_tickets.assigned_to column not found; assignee field is unavailable in current schema.')
    if (!schema.hasPriority) schemaWarnings.push('support_tickets.priority column not found; priority field is unavailable in current schema.')
    if (!schema.hasCommentsLog) schemaWarnings.push('support_tickets.comments_log column not found; comments are stored via audit log fallback only.')

    const payload = {
      tickets: tickets.map(t => ({
        ...t,
        created_by_name: creatorMap[t.created_by]?.username || null,
        created_by_role: creatorMap[t.created_by]?.role || null,
        client_name: t.client_id ? (clientMap[t.client_id] || null) : null,
      })),
      page,
      limit,
      schema_warnings: schemaWarnings,
    }
    return payload
  }

  static async createTicket(user, { title, description, severity }) {
    if (![SUPER_ADMIN, ADMIN, CLIENT_ADMIN, CLIENT_USER].includes(user.role)) throw { message: 'Forbidden', status: 403 }
    if (!title?.trim() || !description?.trim()) throw { message: 'title and description are required', status: 400 }

    const sev = ['Low', 'Medium', 'High', 'Critical'].includes(severity) ? severity : 'Medium'
    const ticket = await SupportRepository.createTicket({
      id: uuidv4(),
      client_id: user.client_id || null,
      created_by: user.id,
      title: title.trim(),
      description: description.trim(),
      severity: sev,
      status: 'Open',
    })

    await ActivityRepository.addAuditLog(null, user, `Support ticket created: ${ticket.title}`, {
      event_type: 'support_ticket_created',
      support_ticket_id: ticket.id,
      status: ticket.status,
      severity: ticket.severity,
    })

    return { ticket }
  }

  static async updateTicket(user, ticketId, { status, resolution_note }) {
    const ticket = await SupportRepository.findById(ticketId)
    if (!ticket) throw { message: 'Ticket not found', status: 404 }

    SupportService.assertTicketAccess(user, ticket)

    const isInternal = INTERNAL_ROLES.includes(user.role)
    const isCreator = ticket.created_by === user.id
    const isClientAdmin = user.role === CLIENT_ADMIN && user.client_id === ticket.client_id
    const isReopening = status === 'Open' && (ticket.status === 'Resolved' || ticket.status === 'Closed')

    if (!isInternal && !(isReopening && (isCreator || isClientAdmin))) {
      throw { message: 'Forbidden', status: 403 }
    }

    const allowedStatus = ['Open', 'In Progress', 'Resolved', 'Closed']
    const update = {}
    if (status && allowedStatus.includes(status)) update.status = status
    if (resolution_note !== undefined) update.resolution_note = resolution_note?.trim() || null
    if (status === 'Resolved' || status === 'Closed') update.resolved_at = new Date().toISOString()
    if (status === 'Open') update.resolved_at = null
    update.updated_at = new Date().toISOString()

    const updatedTicket = await SupportRepository.updateTicket(ticketId, update)
    await ActivityRepository.addAuditLog(null, user, isReopening ? `Support ticket reopened: ${ticket.title}` : `Support ticket status changed to ${status}`, {
      event_type: isReopening ? 'support_ticket_reopened' : 'support_ticket_status_changed',
      support_ticket_id: ticket.id,
      status: status || ticket.status,
    })
    return { ticket: updatedTicket }
  }

  static async getComments(user, ticketId) {
    const ticket = await SupportRepository.findById(ticketId)
    if (!ticket) throw { message: 'Ticket not found', status: 404 }

    SupportService.assertTicketAccess(user, ticket)

    const schema = await SupportRepository.getSchemaSupport()

    const { logs = [] } = await ActivityRepository.getAuditLogs(0, 500)
    const marker = `"support_ticket_id":"${ticketId}"`
    const ticketLogs = logs.filter((l) => typeof l.action_desc === 'string' && l.action_desc.includes(marker))

    const comments = schema.hasCommentsLog && Array.isArray(ticket.comments_log) ? [...ticket.comments_log] : []
    const timeline = []

    for (const entry of ticketLogs) {
      let parsed = null
      try {
        parsed = JSON.parse(entry.action_desc)
      } catch {
        parsed = null
      }

      const eventType = parsed?.event_type || 'support_ticket_event'
      const title = parsed?.desc || entry.action_desc
      const timestamp = entry.timestamp

      timeline.push({
        id: entry.id,
        type: eventType,
        title,
        username: entry.username,
        role: parsed?.actor_role || null,
        timestamp,
      })

      if (eventType === 'support_ticket_comment' && !schema.hasCommentsLog) {
        comments.push({
          id: entry.id,
          user_id: entry.user_id,
          username: entry.username,
          role: parsed?.actor_role || null,
          comment: parsed?.comment || '',
          parent_id: parsed?.parent_id || null,
          created_at: timestamp,
        })
      }
    }

    return {
      comments,
      timeline,
    }
  }

  static async addComment(user, ticketId, { comment, parent_id }) {
    if (!comment?.trim()) throw { message: 'comment text is required', status: 400 }

    const ticket = await SupportRepository.findById(ticketId)
    if (!ticket) throw { message: 'Ticket not found', status: 404 }

    SupportService.assertTicketAccess(user, ticket)

    const schema = await SupportRepository.getSchemaSupport()

    const newComment = {
      id: uuidv4(),
      user_id: user.id,
      username: user.username,
      role: user.role,
      comment: comment.trim(),
      parent_id: parent_id || null,
      created_at: new Date().toISOString(),
    }

    const updateData = {
      updated_at: new Date().toISOString(),
    }

    if (schema.hasCommentsLog) {
      const existingComments = Array.isArray(ticket.comments_log) ? ticket.comments_log : []
      updateData.comments_log = [...existingComments, newComment]
    }

    await SupportRepository.updateTicket(ticketId, updateData)

    await ActivityRepository.addAuditLog(null, user, `Comment added to ticket: ${ticket.title}`, {
      event_type: 'support_ticket_comment',
      support_ticket_id: ticket.id,
      comment: comment.trim(),
      parent_id: parent_id || null,
      actor_role: user.role,
    })
    return { comment: newComment, ticket }
  }
}
