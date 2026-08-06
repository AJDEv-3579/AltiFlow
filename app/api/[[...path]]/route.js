import { json, handleOptionsRequest } from '@/backend/utils/apiResponse'
import { ensureSeed, HealthController } from '@/backend/controllers/HealthController'
import { AuthController } from '@/backend/controllers/AuthController'
import { UserController } from '@/backend/controllers/UserController'
import { ProjectController } from '@/backend/controllers/ProjectController'
import { JobController } from '@/backend/controllers/JobController'
import { SupportController } from '@/backend/controllers/SupportController'
import { ActivityController } from '@/backend/controllers/ActivityController'
import { QueueController } from '@/backend/controllers/QueueController'
import { AnalyticsController } from '@/backend/controllers/AnalyticsController'
import { PushTokenController } from '@/backend/controllers/PushTokenController'
import { AuthMigrationController } from '@/backend/controllers/AuthMigrationController'
import { NotificationController } from '@/backend/controllers/NotificationController'
import { R2Controller } from '@/backend/controllers/R2Controller'

export async function OPTIONS() { return handleOptionsRequest() }

async function handleRoute(request, context) {
  const { path = [] } = await context.params
  const route = `/${path.join('/')}`
  const method = request.method

  try {
    await ensureSeed()
    const seedError = HealthController.getSeedError()
    if (seedError && route !== '/health') {
      return json({
        error: 'Database connection failed',
        details: seedError,
        help: 'Please configure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local and execute supabase/schema.sql in your Supabase SQL Editor.'
      }, 500)
    }

    // Health & System
    if ((route === '/' || route === '/root') && method === 'GET') return json({ message: 'Altiflow API online', service: 'altiflow', backend: 'supabase' })
    if (route === '/health' && method === 'GET') return HealthController.getHealth(request)

    // Auth
    if (route === '/auth/login' && method === 'POST') return AuthController.login(request)
    if (route === '/auth/me' && method === 'GET') return AuthController.me(request)
    if (route === '/auth/change-username' && method === 'POST') return AuthController.changeUsername(request)
    if (route === '/auth/update-profile' && method === 'POST') return AuthController.updateProfile(request)
    if (route === '/auth/change-password' && method === 'POST') return AuthController.changePassword(request)
    if (route === '/auth/forgot-password' && method === 'POST') return AuthController.forgotPassword(request)
    if (route === '/auth/request-reset-email' && method === 'POST') return AuthController.requestResetEmail(request)
    if (route === '/auth/complete-password-reset' && method === 'POST') return AuthController.completePasswordReset(request)

    // Clients
    if (route === '/clients' && method === 'GET') return ProjectController.listClients(request)
    if (route === '/clients' && method === 'POST') return ProjectController.createClient(request)
    if (route.startsWith('/clients/') && method === 'DELETE') return ProjectController.deleteClient(request, route.split('/')[2])

    // Users
    if (route === '/users/check-username' && method === 'GET') return UserController.checkUsername(request)
    if (route === '/users' && method === 'GET') return UserController.listUsers(request)
    if (route === '/users' && method === 'POST') return UserController.createUser(request)
    if (route.startsWith('/users/') && route.endsWith('/request-deletion') && method === 'POST') return QueueController.requestUserDeletion(request, route.split('/')[2])
    if (route.match(/^\/users\/[^/]+\/reset-password$/) && method === 'POST') return UserController.resetPassword(request, route.split('/')[2])
    if (route.match(/^\/users\/[^/]+\/reset-passcode$/) && method === 'POST') return UserController.resetPasscode(request, route.split('/')[2])
    if (route.startsWith('/users/') && method === 'DELETE') return UserController.deleteUser(request, route.split('/')[2])

    // Deletion Queue & Recycle Bin
    if (route === '/deletion-requests' && method === 'GET') return QueueController.listUserDeletionRequests(request)
    if (route.startsWith('/deletion-requests/') && method === 'PATCH') return QueueController.resolveUserDeletionRequest(request, route.split('/')[2])
    if (route === '/recycle-bin' && method === 'GET') return QueueController.listRecycleBin(request)
    if (route.match(/^\/recycle-bin\/[^/]+\/restore$/) && method === 'POST') return QueueController.restoreItem(request, route.split('/')[2])
    if (route.match(/^\/recycle-bin\/[^/]+$/) && method === 'DELETE') return QueueController.deletePermanently(request, route.split('/')[2])
    if (route === '/entity-delete-requests' && method === 'POST') return QueueController.createEntityDeleteRequest(request)
    if (route === '/entity-delete-requests' && method === 'GET') return QueueController.listEntityDeleteRequests(request)
    if (route.match(/^\/entity-delete-requests\/[^/]+$/) && method === 'PATCH') return QueueController.resolveEntityDeleteRequest(request, route.split('/')[2])

    // Push Tokens
    if (route === '/push-tokens' && method === 'POST') return PushTokenController.registerToken(request)
    if (route.match(/^\/push-tokens\/[^/]+$/) && method === 'DELETE') return PushTokenController.deleteToken(request, route.split('/')[2])

    // Notifications
    if (route === '/notifications' && method === 'GET') return NotificationController.list(request)
    if (route === '/notifications/mark-read' && method === 'POST') return NotificationController.markRead(request)
    if (route === '/notifications/mark-all-read' && method === 'POST') return NotificationController.markAllRead(request)

    // User Projects
    if (route.match(/^\/projects\/[^/]+\/assign-users$/) && method === 'POST') return ProjectController.assignUsers(request, route.split('/')[2])
    if (route.match(/^\/projects\/[^/]+\/assigned-users$/) && method === 'GET') return ProjectController.getAssignedUsers(request, route.split('/')[2])

    // Support Tickets
    if (route === '/support-tickets' && method === 'GET') return SupportController.listTickets(request)
    if (route === '/support-tickets' && method === 'POST') return SupportController.createTicket(request)
    if (route.match(/^\/support-tickets\/[^/]+\/comments$/) && method === 'GET') return SupportController.getComments(request, route.split('/')[2])
    if (route.match(/^\/support-tickets\/[^/]+\/comments$/) && method === 'POST') return SupportController.addComment(request, route.split('/')[2])
    if (route.match(/^\/support-tickets\/[^/]+$/) && method === 'PATCH') return SupportController.updateTicket(request, route.split('/')[2])
    if (route.match(/^\/support-tickets\/[^/]+$/) && method === 'DELETE') return SupportController.deleteTicket(request, route.split('/')[2])

    // Projects & Activity
    if (route === '/projects' && method === 'GET') return ProjectController.listLegacyProjects(request)
    if (route === '/projects' && method === 'POST') return ProjectController.createLegacyProject(request)
    if (route.match(/^\/projects\/[^/]+\/activity-log$/) && method === 'GET') return ActivityController.getProjectActivityLog(request, route.split('/')[2])
    if (route === '/audit-logs' && method === 'GET') return ActivityController.listAuditLogs(request)
    if (route === '/analytics' && method === 'GET') return AnalyticsController.getAnalytics(request)
    if (route === '/jobs-assigned' && method === 'GET') return JobController.listAssignedJobs(request)

    // Client Projects & Jobs
    if (route === '/client-projects' && method === 'GET') return ProjectController.listClientProjects(request)
    if (route === '/client-projects' && method === 'POST') return ProjectController.createClientProject(request)
    if (route.match(/^\/client-projects\/[^/]+\/jobs$/) && method === 'GET') return JobController.listProjectJobs(request, route.split('/')[2])
    if (route.match(/^\/client-projects\/[^/]+\/jobs$/) && method === 'POST') return JobController.createJob(request, route.split('/')[2])
    if (route.match(/^\/client-projects\/[^/]+\/jobs\/[^/]+\/comments$/) && method === 'POST') {
      const parts = route.split('/')
      return JobController.addJobComment(request, parts[2], parts[4])
    }
    if (route.match(/^\/client-projects\/[^/]+\/jobs\/[^/]+$/) && method === 'PATCH') {
      const parts = route.split('/')
      return JobController.updateJob(request, parts[2], parts[4])
    }
    if (route.match(/^\/client-projects\/[^/]+\/jobs\/[^/]+$/) && method === 'DELETE') {
      const parts = route.split('/')
      return JobController.deleteJob(request, parts[2], parts[4])
    }
    if (route.match(/^\/client-projects\/[^/]+$/) && method === 'PATCH') return ProjectController.updateClientProject(request, route.split('/')[2])
    if (route.match(/^\/client-projects\/[^/]+$/) && method === 'DELETE') return ProjectController.deleteClientProject(request, route.split('/')[2])

    // Auth Migration Admin Routes
    if (route === '/admin/auth-migration/status' && method === 'GET') return AuthMigrationController.getStatus(request)
    if (route.match(/^\/admin\/auth-migration\/link-user\/[^/]+$/) && method === 'POST') return AuthMigrationController.linkUser(request, route.split('/')[4])
    if (route.match(/^\/admin\/auth-migration\/send-invite\/[^/]+$/) && method === 'POST') return AuthMigrationController.sendInvite(request, route.split('/')[4])
    if (route === '/admin/auth-migration/migrate-all' && method === 'POST') return AuthMigrationController.migrateAll(request)

    // Cloudflare R2 Integration
    if (route === '/r2/presigned-upload' && method === 'POST') return R2Controller.generatePresignedUpload(request)
    if (route === '/r2/save-metadata' && method === 'POST') return R2Controller.saveR2Metadata(request)
    if (route === '/r2/presigned-download' && method === 'POST') return R2Controller.generatePresignedDownload(request)
    if (route === '/r2/stream-file' && method === 'GET') return R2Controller.streamFile(request)

    if (route === '/r2/sync-all' && (method === 'POST' || method === 'GET')) {
      const { R2Service } = require('@/backend/services/R2Service')
      const result = await R2Service.syncAllR2Data()
      return json(result)
    }

    // Standalone GIS Workbench API
    if (route === '/test-gis/jobs' && method === 'GET') {
      const { supabaseAdmin } = require('@/lib/supabase')
      const { data: jobs } = await supabaseAdmin.from('jobs').select('*').order('created_at', { ascending: false })
      return json({ jobs: jobs || [] })
    }
    if (route === '/test-gis/tiles' && method === 'GET') {
      const { TestGISTileService } = require('@/backend/services/TestGISTileService')
      return TestGISTileService.renderTile(request)
    }




    return json({ error: `Route ${route} not found` }, 404)
  } catch (e) {
    console.error('API Error:', e)
    return json({ error: 'Internal server error', detail: e.message }, 500)
  }
}

export const GET = handleRoute
export const POST = handleRoute
export const PUT = handleRoute
export const DELETE = handleRoute
export const PATCH = handleRoute
