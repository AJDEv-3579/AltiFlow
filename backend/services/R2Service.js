import { generateR2UploadUrl, generateR2DownloadUrl, getR2ObjectStream, listR2Objects } from '@/lib/r2'
import { JobRepository } from '../repositories/JobRepository'
import { ProjectRepository } from '../repositories/ProjectRepository'
import { ActivityRepository } from '../repositories/ActivityRepository'
import { CLIENT_ROLES, ADMIN, SUPER_ADMIN } from '../constants/backendRoles'

const ALLOWED_ORTHOMOSAIC_EXTS = ['.tif', '.tiff', '.png', '.jpg', '.jpeg']
const ALLOWED_VECTOR_EXTS = ['.geojson', '.json', '.kml', '.shp', '.zip']

const MAX_ORTHOMOSAIC_SIZE = 1024 * 1024 * 1024 // 1GB
const MAX_VECTOR_SIZE = 200 * 1024 * 1024 // 200MB

function sanitizeFileName(name) {
  return (name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_')
}

export class R2Service {
  static async generatePresignedUpload(user, { projectId, jobId, dataType, fileName, contentType, fileSize }) {
    // Role Permission Check: Only Owner Roles (Super-Admin, Admin) can upload
    if (![SUPER_ADMIN, ADMIN].includes(user.role)) {
      throw { message: 'Forbidden: Only Super-Admin and Admin roles can upload Job Card data.', status: 403 }
    }

    if (!projectId || !jobId) {
      throw { message: 'Missing required parameters: projectId and jobId.', status: 400 }
    }

    if (!['orthomosaic', 'vector_grid'].includes(dataType)) {
      throw { message: 'Invalid dataType. Allowed values are orthomosaic and vector_grid.', status: 400 }
    }

    if (!fileName) {
      throw { message: 'File name is required.', status: 400 }
    }

    const lowerName = fileName.toLowerCase()
    const isOrtho = dataType === 'orthomosaic'
    const allowedExts = isOrtho ? ALLOWED_ORTHOMOSAIC_EXTS : ALLOWED_VECTOR_EXTS
    const isValidExt = allowedExts.some(ext => lowerName.endsWith(ext))

    if (!isValidExt) {
      throw {
        message: `Invalid file extension for ${dataType}. Allowed extensions: ${allowedExts.join(', ')}`,
        status: 400,
      }
    }

    const maxSize = isOrtho ? MAX_ORTHOMOSAIC_SIZE : MAX_VECTOR_SIZE
    if (fileSize && fileSize > maxSize) {
      const maxMb = Math.round(maxSize / (1024 * 1024))
      throw { message: `File size exceeds the limit of ${maxMb}MB.`, status: 400 }
    }

    // Verify project exists & user access
    const proj = await ProjectRepository.findClientProjectById(
      projectId,
      CLIENT_ROLES.includes(user.role) ? user.client_id : null
    )
    if (!proj) throw { message: 'Project not found.', status: 404 }

    const job = await JobRepository.findById(jobId, projectId)
    if (!job) throw { message: 'Job Card not found.', status: 404 }

    const safeName = sanitizeFileName(fileName)
    const objectKey = `projects/${projectId}/jobs/${jobId}/${dataType}/${Date.now()}_${safeName}`

    const uploadUrl = await generateR2UploadUrl({
      key: objectKey,
      contentType: contentType || 'application/octet-stream',
      expiresIn: 1800,
    })

    return {
      uploadUrl,
      key: objectKey,
      dataType,
      fileName,
      fileSize,
      contentType,
    }
  }

  static async saveR2Metadata(user, { projectId, jobId, dataType, key, fileName, fileSize, contentType }) {
    if (!projectId || !jobId || !dataType || !key || !fileName) {
      throw { message: 'Missing required metadata parameters.', status: 400 }
    }

    if (!['orthomosaic', 'vector_grid'].includes(dataType)) {
      throw { message: 'Invalid dataType.', status: 400 }
    }

    const proj = await ProjectRepository.findClientProjectById(
      projectId,
      CLIENT_ROLES.includes(user.role) ? user.client_id : null
    )
    if (!proj) throw { message: 'Project not found.', status: 404 }

    let job = await JobRepository.findById(jobId, projectId && projectId !== 'test' ? projectId : null)
    if (!job) {
      job = await JobRepository.findById(jobId)
    }
    if (!job) throw { message: 'Job Card not found.', status: 404 }

    const targetProjectId = job.project_id || projectId

    const currentR2Data = (job && typeof job.r2_data === 'object' && job.r2_data !== null) ? job.r2_data : {}
    const updatedR2Data = {
      ...currentR2Data,
      [dataType]: {
        key,
        fileName,
        fileSize: fileSize || 0,
        contentType: contentType || '',
        uploadedAt: new Date().toISOString(),
        uploadedBy: user.username || user.id,
      },
    }

    const updatedJob = await JobRepository.updateJob(jobId, targetProjectId, { r2_data: updatedR2Data })

    await ActivityRepository.addAuditLog(projectId, user, `Dataset uploaded to R2: ${dataType} (${fileName})`, {
      event_type: 'dataset_uploaded',
      job_id: jobId,
      data_type: dataType,
      file_name: fileName,
      actor_role: user.role,
    })

    return {
      message: `${dataType === 'orthomosaic' ? 'Field Orthomosaic' : 'Field Vector Grid'} attached successfully.`,
      job: updatedJob,
      r2_data: updatedR2Data,
    }
  }

  static async generatePresignedDownload(user, { projectId, jobId, dataType = 'orthomosaic' }) {
    if (!jobId) {
      throw { message: 'Missing jobId parameter.', status: 400 }
    }

    const job = await JobRepository.findById(jobId, projectId && projectId !== 'test' ? projectId : null)
    if (!job) throw { message: 'Job Card not found.', status: 404 }

    const targetProjectId = job.project_id || projectId || ''
    const r2Data = job.r2_data || {}
    let fileMeta = r2Data[dataType]

    if (!fileMeta || !fileMeta.key) {
      try {
        const prefix = `projects/${targetProjectId}/jobs/${jobId}/${dataType}/`
        const listRes = await listR2Objects({ prefix })
        const contents = (listRes.Contents || []).sort((a, b) => (b.LastModified || 0) - (a.LastModified || 0))
        if (contents.length > 0) {
          const foundObj = contents[0]
          const foundKey = foundObj.Key
          const fileName = foundKey.split('/').pop()
          fileMeta = {
            key: foundKey,
            fileName,
            fileSize: foundObj.Size || 0,
            contentType: 'application/octet-stream',
            uploadedAt: foundObj.LastModified ? new Date(foundObj.LastModified).toISOString() : new Date().toISOString(),
          }
          const updatedR2Data = { ...r2Data, [dataType]: fileMeta }
          await JobRepository.updateJob(jobId, targetProjectId, { r2_data: updatedR2Data }).catch(e => console.warn(e))
        }
      } catch (autoErr) {
        console.warn('R2 auto-discovery notice:', autoErr.message)
      }
    }

    if (!fileMeta || !fileMeta.key) {
      throw { message: `No ${dataType === 'orthomosaic' ? 'Orthomosaic' : 'Vector Grid'} data found for this Job Card.`, status: 404 }
    }

    const downloadUrl = await generateR2DownloadUrl({
      key: fileMeta.key,
      expiresIn: 3600,
    })

    return {
      downloadUrl,
      fileName: fileMeta.fileName || `${dataType}.data`,
      contentType: fileMeta.contentType || 'application/octet-stream',
      fileSize: fileMeta.fileSize || 0,
      key: fileMeta.key,
      uploadedAt: fileMeta.uploadedAt,
    }
  }

  static async streamFile(user, { projectId, jobId, dataType, range }) {
    if (!jobId || !dataType) {
      throw { message: 'Missing required parameters: jobId and dataType.', status: 400 }
    }

    const job = await JobRepository.findById(jobId, projectId && projectId !== 'test' ? projectId : null)
    if (!job) throw { message: 'Job Card not found.', status: 404 }

    const targetProjectId = job.project_id || projectId || ''
    const r2Data = job.r2_data || {}
    let fileMeta = r2Data[dataType]

    if (!fileMeta || !fileMeta.key) {
      try {
        const prefix = `projects/${targetProjectId}/jobs/${jobId}/${dataType}/`
        const listRes = await listR2Objects({ prefix })
        const contents = (listRes.Contents || []).sort((a, b) => (b.LastModified || 0) - (a.LastModified || 0))
        if (contents.length > 0) {
          const foundObj = contents[0]
          const foundKey = foundObj.Key
          const fileName = foundKey.split('/').pop()
          fileMeta = {
            key: foundKey,
            fileName,
            fileSize: foundObj.Size || 0,
            contentType: 'application/octet-stream',
            uploadedAt: foundObj.LastModified ? new Date(foundObj.LastModified).toISOString() : new Date().toISOString(),
          }
          const updatedR2Data = { ...r2Data, [dataType]: fileMeta }
          await JobRepository.updateJob(jobId, targetProjectId, { r2_data: updatedR2Data }).catch(e => console.warn(e))
        }
      } catch (autoErr) {
        console.warn('R2 auto-discovery notice:', autoErr.message)
      }
    }

    if (!fileMeta || !fileMeta.key) {
      throw { message: `No ${dataType === 'orthomosaic' ? 'Orthomosaic' : 'Vector Grid'} data found for this Job Card.`, status: 404 }
    }

    const objectResponse = await getR2ObjectStream({ key: fileMeta.key, range })
    return {
      stream: objectResponse.Body,
      contentType: fileMeta.contentType || objectResponse.ContentType || 'application/octet-stream',
      contentLength: objectResponse.ContentLength || fileMeta.fileSize,
      contentRange: objectResponse.ContentRange,
      fileName: fileMeta.fileName,
      status: objectResponse.ContentRange ? 206 : 200,
    }
  }

  static async syncAllR2Data() {
    const { supabaseAdmin } = require('@/lib/supabase')
    const { data: jobs } = await supabaseAdmin.from('jobs').select('id, project_id, r2_data')
    if (!jobs || jobs.length === 0) return { synced: 0 }

    let updatedCount = 0

    for (const job of jobs) {
      const projId = job.project_id
      if (!projId) continue

      const currentR2 = (job.r2_data && typeof job.r2_data === 'object') ? { ...job.r2_data } : {}
      let changed = false

      for (const dataType of ['orthomosaic', 'vector_grid']) {
        if (!currentR2[dataType] || !currentR2[dataType].key) {
          try {
            const prefix = `projects/${projId}/jobs/${job.id}/${dataType}/`
            const listRes = await listR2Objects({ prefix })
            const contents = (listRes.Contents || []).sort((a, b) => (b.LastModified || 0) - (a.LastModified || 0))
            if (contents.length > 0) {
              const foundObj = contents[0]
              const foundKey = foundObj.Key
              const fileName = foundKey.split('/').pop()
              currentR2[dataType] = {
                key: foundKey,
                fileName,
                fileSize: foundObj.Size || 0,
                contentType: 'application/octet-stream',
                uploadedAt: foundObj.LastModified ? new Date(foundObj.LastModified).toISOString() : new Date().toISOString(),
                uploadedBy: 'system_sync',
              }
              changed = true
            }
          } catch (e) {
            console.warn(`[SyncR2] Job ${job.id} ${dataType} scan error:`, e.message)
          }
        }
      }

      if (changed) {
        await supabaseAdmin.from('jobs').update({ r2_data: currentR2, updated_at: new Date().toISOString() }).eq('id', job.id)
        updatedCount++
      }
    }

    return { synced: updatedCount, totalJobs: jobs.length }
  }
}

