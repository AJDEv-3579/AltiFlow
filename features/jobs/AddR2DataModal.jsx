import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { X, Upload, FileText, CheckCircle2, AlertCircle, Loader2, Layers, MapPin } from 'lucide-react'
import Btn from '@/components/ui/Btn'
import { api } from '@/services/api'

const ORTHOMOSAIC_EXTS = ['.tif', '.tiff', '.png', '.jpg', '.jpeg']
const VECTOR_GRID_EXTS = ['.geojson', '.json', '.kml', '.shp', '.zip']

const MAX_ORTHO_MB = 1024
const MAX_VECTOR_MB = 200

export default function AddR2DataModal({ job, project, onClose, onDone }) {
  const [activeTab, setActiveTab] = useState('orthomosaic') // 'orthomosaic' | 'vector_grid'
  const [selectedFile, setSelectedFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [errorMessage, setErrorMessage] = useState('')

  const existingR2 = job?.r2_data || {}
  const orthoMeta = existingR2.orthomosaic
  const vectorMeta = existingR2.vector_grid

  function handleFileChange(e) {
    setErrorMessage('')
    const file = e.target.files?.[0]
    if (!file) {
      setSelectedFile(null)
      return
    }

    const lowerName = file.name.toLowerCase()
    const allowedExts = activeTab === 'orthomosaic' ? ORTHOMOSAIC_EXTS : VECTOR_GRID_EXTS
    const isValidExt = allowedExts.some(ext => lowerName.endsWith(ext))

    if (!isValidExt) {
      setErrorMessage(`Invalid file format for ${activeTab === 'orthomosaic' ? 'Field Orthomosaic' : 'Field Vector Grid'}. Allowed formats: ${allowedExts.join(', ')}`)
      setSelectedFile(null)
      return
    }

    const maxMb = activeTab === 'orthomosaic' ? MAX_ORTHO_MB : MAX_VECTOR_MB
    const fileSizeMb = file.size / (1024 * 1024)
    if (fileSizeMb > maxMb) {
      setErrorMessage(`File size (${fileSizeMb.toFixed(1)} MB) exceeds the maximum limit of ${maxMb} MB.`)
      setSelectedFile(null)
      return
    }

    setSelectedFile(file)
  }

  async function handleUpload() {
    if (!selectedFile) return
    setUploading(true)
    setProgress(0)
    setErrorMessage('')

    try {
      // 1. Request presigned upload URL from backend
      const presignedRes = await api('/r2/presigned-upload', {
        method: 'POST',
        body: JSON.stringify({
          projectId: project.id,
          jobId: job.id,
          dataType: activeTab,
          fileName: selectedFile.name,
          contentType: selectedFile.type || 'application/octet-stream',
          fileSize: selectedFile.size,
        }),
      })

      const { uploadUrl, key } = presignedRes

      // 2. Direct upload to Cloudflare R2 using XMLHttpRequest for progress tracking
      await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('PUT', uploadUrl, true)
        if (selectedFile.type) {
          xhr.setRequestHeader('Content-Type', selectedFile.type)
        }

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const percentComplete = Math.round((event.loaded / event.total) * 100)
            setProgress(percentComplete)
          }
        }

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve()
          } else {
            reject(new Error(`Cloudflare R2 upload failed with status ${xhr.status}`))
          }
        }

        xhr.onerror = () => reject(new Error('Network error during Cloudflare R2 upload.'))
        xhr.send(selectedFile)
      })

      // 3. Save metadata to database
      await api('/r2/save-metadata', {
        method: 'POST',
        body: JSON.stringify({
          projectId: project.id,
          jobId: job.id,
          dataType: activeTab,
          key,
          fileName: selectedFile.name,
          fileSize: selectedFile.size,
          contentType: selectedFile.type || 'application/octet-stream',
        }),
      })

      toast.success(`${activeTab === 'orthomosaic' ? 'Field Orthomosaic' : 'Field Vector Grid'} uploaded to Cloudflare R2!`)
      setSelectedFile(null)
      onDone?.()
      onClose?.()
    } catch (err) {
      console.error('R2 Upload error:', err)
      setErrorMessage(err.message || 'Failed to upload file to Cloudflare R2.')
      toast.error(err.message || 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
  }

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[110] flex items-center justify-center p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-lg bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/40">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400">
              <Upload size={18} />
            </div>
            <div>
              <h3 className="text-base font-bold text-zinc-100">Upload GIS Data</h3>
              <p className="text-xs text-zinc-400 truncate max-w-xs">{job?.title}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-2 p-1 bg-zinc-900/80 border border-zinc-800/80 rounded-xl">
            <button
              onClick={() => {
                setActiveTab('orthomosaic')
                setSelectedFile(null)
                setErrorMessage('')
              }}
              className={`px-3 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                activeTab === 'orthomosaic'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
              }`}
            >
              <FileText size={14} />
              Field Orthomosaic
            </button>
            <button
              onClick={() => {
                setActiveTab('vector_grid')
                setSelectedFile(null)
                setErrorMessage('')
              }}
              className={`px-3 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                activeTab === 'vector_grid'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
              }`}
            >
              <Layers size={14} />
              Vector Grid Boundary
            </button>
          </div>

          {activeMeta && (
            <div className="p-3 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 text-zinc-300">
                <CheckCircle2 size={16} className="text-emerald-400" />
                <span>
                  Existing File: <span className="font-semibold text-white">{activeMeta.fileName}</span> ({(activeMeta.fileSize / (1024 * 1024)).toFixed(2)} MB)
                </span>
              </div>
              <span className="text-[10px] text-zinc-500 font-mono">
                {activeMeta.uploadedAt ? new Date(activeMeta.uploadedAt).toLocaleDateString() : ''}
              </span>
            </div>
          )}

          <div className="border-2 border-dashed border-zinc-800 hover:border-blue-500/50 rounded-2xl p-6 text-center transition-all bg-zinc-900/30">
            <input
              type="file"
              accept={acceptExts}
              onChange={handleFileSelect}
              className="hidden"
              id="r2-file-input"
              disabled={uploading}
            />
            <label htmlFor="r2-file-input" className="cursor-pointer block space-y-2">
              <div className="w-12 h-12 mx-auto rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center">
                <Upload size={22} />
              </div>
              <div>
                <p className="text-xs font-semibold text-zinc-200">
                  {selectedFile ? selectedFile.name : `Click or drag ${activeTab === 'orthomosaic' ? 'Orthomosaic GeoTIFF (.tif, .tiff)' : 'Vector Grid (.geojson, .kml, .shp, .zip)'} file`}
                </p>
                <p className="text-[11px] text-zinc-500 mt-1">
                  {selectedFile ? `${(selectedFile.size / (1024 * 1024)).toFixed(2)} MB ready` : 'Supports Cloud Photogrammetry Datasets'}
                </p>
              </div>
            </label>
          </div>

          {errorMessage && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center gap-2 text-xs text-red-400">
              <AlertCircle size={15} />
              <span>{errorMessage}</span>
            </div>
          )}

          {uploading && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-zinc-300">
                <span className="flex items-center gap-1.5 font-medium">
                  <Loader2 size={13} className="animate-spin text-blue-400" />
                  Uploading file...
                </span>
                <span className="font-mono">{progress}%</span>
              </div>
              <div className="w-full bg-zinc-900 rounded-full h-2 overflow-hidden border border-zinc-800">
                <div
                  className="bg-blue-500 h-full transition-all duration-200"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-zinc-800 bg-zinc-900/40 flex items-center justify-end gap-3">
          <Btn variant="ghost" onClick={onClose} disabled={uploading}>
            Cancel
          </Btn>
          <Btn
            variant="primary"
            icon={Upload}
            onClick={handleUpload}
            disabled={!selectedFile || uploading}
          >
            {uploading ? `Uploading (${progress}%)` : 'Upload File'}
          </Btn>
        </div>
      </motion.div>
    </div>
  )
}
