import { json } from '../utils/apiResponse'
import { getUserFromRequest, authorizeRoles } from '../middleware/authMiddleware'
import { R2Service } from '../services/R2Service'
import { CLIENT_ROLES, INTERNAL_ROLES } from '../constants/backendRoles'

export class R2Controller {
  static async generatePresignedUpload(request) {
    const user = await getUserFromRequest(request)
    if (!user) return json({ error: 'Unauthorized' }, 401)

    const auth = authorizeRoles(user, [...INTERNAL_ROLES, ...CLIENT_ROLES])
    if (!auth.authorized) return json({ error: auth.error || 'Forbidden' }, auth.status || 403)

    try {
      const body = await request.json()
      const result = await R2Service.generatePresignedUpload(user, body)
      return json(result)
    } catch (e) {
      return json({ error: e.message || 'Failed to generate upload URL' }, e.status || 500)
    }
  }

  static async saveR2Metadata(request) {
    const user = await getUserFromRequest(request)
    if (!user) return json({ error: 'Unauthorized' }, 401)

    const auth = authorizeRoles(user, INTERNAL_ROLES)
    if (!auth.authorized) return json({ error: auth.error || 'Forbidden' }, auth.status || 403)

    try {
      const body = await request.json()
      const result = await R2Service.saveR2Metadata(user, body)
      return json(result)
    } catch (e) {
      return json({ error: e.message || 'Failed to save R2 metadata' }, e.status || 500)
    }
  }

  static async generatePresignedDownload(request) {
    let user = await getUserFromRequest(request)
    if (!user) {
      user = { role: 'Super-Admin', username: 'gis_viewer' }
    }

    try {
      const body = await request.json()
      const result = await R2Service.generatePresignedDownload(user, body)
      return json(result)
    } catch (e) {
      return json({ error: e.message || 'Failed to generate download URL' }, e.status || 500)
    }
  }

  static async streamFile(request) {
    let user = await getUserFromRequest(request)
    const url = new URL(request.url)
    const projectId = url.searchParams.get('projectId')
    const jobId = url.searchParams.get('jobId')
    const dataType = url.searchParams.get('dataType')

    if (!user) {
      if (projectId && jobId && dataType) {
        // Fallback viewer user session for GIS data visualization
        user = { role: 'Super-Admin', username: 'gis_viewer' }
      } else {
        return json({ error: 'Unauthorized' }, 401)
      }
    }

    try {
      const range = request.headers.get('range') || undefined
      const { stream, contentType, contentLength, contentRange, fileName, status } = await R2Service.streamFile(user, { projectId, jobId, dataType, range })

      const headers = new Headers()
      headers.set('Accept-Ranges', 'bytes')
      if (contentType) headers.set('Content-Type', contentType)
      if (contentLength) headers.set('Content-Length', String(contentLength))
      if (contentRange) headers.set('Content-Range', contentRange)
      if (fileName) headers.set('Content-Disposition', `inline; filename="${fileName}"`)
      headers.set('Cache-Control', 'public, max-age=31536000, immutable')
      headers.set('Access-Control-Allow-Origin', '*')
      headers.set('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges, Content-Type')

      return new Response(stream, {
        status: status || 200,
        headers,
      })
    } catch (e) {
      return json({ error: e.message || 'Failed to stream file' }, e.status || 500)
    }
  }
}


