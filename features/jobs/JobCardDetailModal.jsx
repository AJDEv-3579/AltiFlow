import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { Star, X, Edit3, Trash2, FileWarning, Plus, Eye, Layers } from 'lucide-react'
import GlassCard from '@/components/ui/GlassCard'
import Btn from '@/components/ui/Btn'
import { api } from '@/services/api'
import { toUiJobStage } from '@/utils/formatters'
import { useIsMobile } from '@/hooks/use-mobile'

export function JobCardDetailModal({
  job,
  project,
  orgUsers = [],
  user,
  onClose,
  onRefresh,
  isAdmin,
  canDelete,
  canRequestDelete,
  onEdit,
  onDelete,
  onRequestDelete,
  onUpdateStage,
  onOpenAddData,
  onOpenViewData,
}) {
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [commentsLog, setCommentsLog] = useState(job.comments_log || [])
  const adminAssignees = orgUsers.filter(u => ['Admin', 'Super-Admin'].includes(u.role))
  const isMobile = useIsMobile()
  const flights = Array.isArray(job.flights) ? job.flights : []
  const totalImages = flights.reduce((s, f) => s + (f.image_count || 0), 0)
  const totalCSV = flights.reduce((s, f) => s + (f.csv_rows || 0), 0)

  useEffect(() => {
    setCommentsLog(job.comments_log || [])
  }, [job.comments_log])

  function activeStage(j) {
    const stage = (j.category === 'Uniformity' ? j.uni_status : j.sc_status)
    if (stage) return toUiJobStage(stage)
    return toUiJobStage(j.status === 'Open' ? 'Pending' : j.status)
  }

  const currentStage = activeStage(job)

  async function handleAddComment(e) {
    e.preventDefault()
    if (!comment.trim()) return
    setBusy(true)
    try {
      const res = await api(`/client-projects/${project.id}/jobs/${job.id}/comments`, {
        method: 'POST',
        body: JSON.stringify({ comment: comment.trim(), stage: 'General' }),
      })
      const newComment = res.comment || {
        id: 'cmt-' + Date.now(),
        username: 'You',
        stage: 'General',
        comment: comment.trim(),
        created_at: new Date().toISOString(),
      }
      setCommentsLog(prev => [...prev, newComment])
      toast.success('Stage update comment added')
      setComment('')
      onRefresh?.()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4 pt-16 md:pt-20" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-2xl bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[82vh]"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between shrink-0 bg-zinc-900/40">
          <div className="min-w-0 flex-1 pr-4">
            <div className="text-xs text-zinc-500 font-mono truncate">{project?.name || 'Workspace'} · {job.category || 'Stand Count'}</div>
            <div className="text-lg font-bold text-zinc-100 flex items-center gap-2 mt-0.5 truncate">
              <button
                type="button"
                onClick={() => {
                  const nextVal = !job.is_priority
                  job.is_priority = nextVal
                  onUpdateStage?.(job.id, 'is_priority', nextVal)
                }}
                className={`p-1 rounded-lg transition-colors ${
                  job.is_priority ? 'text-amber-400 hover:text-amber-300' : 'text-zinc-600 hover:text-zinc-400'
                }`}
                title={job.is_priority ? 'Priority Job (click to unmark)' : 'Mark as Priority'}
              >
                <Star size={18} className={job.is_priority ? 'fill-amber-400 text-amber-400' : ''} />
              </button>
              <span className="truncate">{job.title}</span>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors shrink-0">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          {/* Status & Badges Bar */}
          <div className="flex items-center justify-between gap-3 flex-wrap bg-zinc-900/40 p-3 rounded-xl border border-zinc-800/60">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-xs px-2.5 py-1 rounded-md border font-semibold ${
                job.category === 'Uniformity'
                  ? 'bg-violet-500/10 border-violet-500/30 text-violet-300'
                  : 'bg-blue-500/10 border-blue-500/30 text-blue-300'}`}>
                {job.category || 'Stand Count'}
              </span>
              <span className="text-xs px-2.5 py-1 rounded-md border bg-zinc-900/60 border-zinc-700 text-zinc-200 font-medium">
                Stage: {currentStage}
              </span>
              {job.is_priority && (
                <span className="text-xs px-2.5 py-1 rounded-md border bg-amber-500/20 border-amber-500/40 text-amber-300 font-bold uppercase tracking-wider">
                  ★ Priority Job
                </span>
              )}
              {job.has_logs && (
                <span className="text-xs px-2.5 py-1 rounded-md border bg-emerald-500/10 border-emerald-500/30 text-emerald-300 font-medium">
                  Logs Uploaded
                </span>
              )}
            </div>

            {/* R2 GIS Action Buttons */}
            <div className="flex items-center gap-2 shrink-0">
              {['Super-Admin', 'Admin'].includes(user?.role) && (
                <button
                  type="button"
                  onClick={() => {
                    onClose?.()
                    onOpenAddData?.(job)
                  }}
                  className="px-2.5 py-1 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 hover:text-blue-300 border border-blue-500/30 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
                  title="Add Data (Field Orthomosaic / Vector Grid to Cloudflare R2)"
                >
                  <Plus size={14} />
                  <span>Add Data</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  onClose?.()
                  const win = window.open(`/gis-viewer?jobId=${job.id}`, 'altiflow_gis_workspace')
                  try {
                    const channel = new BroadcastChannel('altiflow_gis_workspace')
                    if (job.r2_data?.orthomosaic) channel.postMessage({ jobId: job.id, dataType: 'orthomosaic' })
                    if (job.r2_data?.vector_grid) channel.postMessage({ jobId: job.id, dataType: 'vector_grid' })
                    channel.close()
                  } catch (err) { console.warn(err) }
                  if (win) win.focus()
                }}
                className="px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 hover:text-emerald-300 border border-emerald-500/30 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                title="View in GIS Workspace"
              >
                <Eye size={14} />
                <span>View Data</span>
              </button>
            </div>
          </div>

          {/* Metadata Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <GlassCard className="p-3">
              <div className="text-[10px] uppercase tracking-wider text-zinc-500">{isMobile ? 'Field' : 'Field Name'}</div>
              <div className="font-semibold text-zinc-100 text-sm truncate" title={job.title}>{job.title}</div>
            </GlassCard>
            <GlassCard className="p-3">
              <div className="text-[10px] uppercase tracking-wider text-zinc-500">Drone Name</div>
              <div className="font-medium text-zinc-200 text-sm truncate" title={job.drone_name || 'N/A'}>{job.drone_name || 'N/A'}</div>
            </GlassCard>
            <GlassCard className="p-3">
              <div className="text-[10px] uppercase tracking-wider text-zinc-500">Date of Capture</div>
              <div className="font-medium text-zinc-200 text-sm">{job.capture_date ? new Date(job.capture_date + 'T00:00:00').toLocaleDateString() : 'N/A'}</div>
            </GlassCard>
            <GlassCard className="p-3">
              <div className="text-[10px] uppercase tracking-wider text-zinc-500">Uploaded Date</div>
              <div className="font-mono text-xs text-zinc-300">{new Date(job.created_at).toLocaleDateString()}</div>
            </GlassCard>
            <GlassCard className="p-3">
              <div className="text-[10px] uppercase tracking-wider text-zinc-500">Submitted By</div>
              <div className="font-medium text-zinc-300 text-sm truncate" title={job.created_by_name || 'Unknown'}>{job.created_by_name || 'Unknown'}</div>
            </GlassCard>
            <GlassCard className="p-3">
              <div className="text-[10px] uppercase tracking-wider text-zinc-500">Assigned Admin</div>
              {isAdmin && adminAssignees.length > 0 ? (
                <select
                  value={job.assigned_to || ''}
                  onChange={e => onUpdateStage?.(job.id, 'assigned_to', e.target.value || null)}
                  className="mt-1 w-full h-7 rounded-lg border border-zinc-700 bg-zinc-900 px-2 text-xs text-zinc-200 focus:outline-none cursor-pointer"
                >
                  <option value="">Unassigned</option>
                  {adminAssignees.map(u => <option key={u.id} value={u.id}>{u.username}</option>)}
                </select>
              ) : (
                <div className="font-medium text-zinc-200 text-sm truncate">{job.assigned_to_name || 'Unassigned'}</div>
              )}
            </GlassCard>
          </div>

          {/* Per-flight breakdown table */}
          {flights.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2">Flight Breakdown ({flights.length} flight{flights.length !== 1 ? 's' : ''})</div>
              <div className="rounded-xl overflow-hidden border border-zinc-800/60 bg-zinc-900/30">
                <div className="grid grid-cols-3 bg-zinc-900/80 text-[10px] uppercase tracking-wider text-zinc-500 px-4 py-2 font-semibold">
                  <span>Flight</span><span className="text-center">Images</span><span className="text-center">CSV Rows</span>
                </div>
                {flights.map((fl, i) => (
                  <div key={i} className="grid grid-cols-3 px-4 py-2.5 border-t border-zinc-800/40 text-xs">
                    <span className="text-zinc-300 font-medium">Flight {i + 1}</span>
                    <span className={`text-center font-mono ${fl.image_count != null ? 'text-blue-300' : 'text-zinc-600'}`}>
                      {fl.image_count != null ? fl.image_count.toLocaleString() : '—'}
                    </span>
                    <span className={`text-center font-mono ${fl.csv_rows != null ? 'text-emerald-300' : 'text-zinc-600'}`}>
                      {fl.csv_rows != null ? fl.csv_rows.toLocaleString() : '—'}
                    </span>
                  </div>
                ))}
                {flights.length > 1 && (
                  <div className="grid grid-cols-3 px-4 py-2.5 border-t border-zinc-700/60 bg-zinc-900/60 text-xs font-semibold">
                    <span className="text-zinc-400">Total</span>
                    <span className="text-center font-mono text-blue-300">{totalImages.toLocaleString()}</span>
                    <span className="text-center font-mono text-emerald-300">{totalCSV.toLocaleString()}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Notes / Comments */}
          {(job.comments || job.description) && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1.5">Notes & Comments</div>
              <div className="text-xs text-zinc-300 bg-zinc-900/40 rounded-xl px-4 py-3 border border-zinc-800/60 leading-relaxed whitespace-pre-wrap">
                {job.comments || job.description}
              </div>
            </div>
          )}

          {/* Timeline & Stage Comments */}
          <div>
            <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2">Pipeline Activity Log</div>
            <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
              {commentsLog.length === 0 && (
                <div className="text-xs text-zinc-600 italic">No stage updates yet.</div>
              )}
              {commentsLog.map(c => (
                <div key={c.id} className="rounded-xl border border-zinc-800/60 bg-zinc-900/30 p-3 text-xs">
                  <div className="flex items-center justify-between gap-3 text-[10px] text-zinc-500 mb-1">
                    <span className="font-semibold text-zinc-400">{c.username || 'system'} · {c.stage || 'General'}</span>
                    <span>{new Date(c.created_at).toLocaleString()}</span>
                  </div>
                  <div className="text-zinc-300 whitespace-pre-wrap">{c.comment}</div>
                </div>
              ))}
            </div>

            <form onSubmit={handleAddComment} className="mt-3 flex gap-2">
              <input
                type="text"
                value={comment}
                onChange={e => setComment(e.target.value)}
                placeholder="Add stage update comment..."
                className="flex-1 bg-zinc-900/60 border border-zinc-800 rounded-lg px-3 h-9 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600"
              />
              <Btn type="submit" size="sm" disabled={busy || !comment.trim()}>
                {busy ? 'Saving...' : 'Post Comment'}
              </Btn>
            </form>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-zinc-800 shrink-0 flex items-center justify-between bg-zinc-900/40 gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <button
              onClick={() => { onClose(); onEdit?.(job) }}
              className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 font-medium transition-colors"
            >
              <Edit3 size={14} /> Edit Job Card
            </button>
            {canDelete && (
              <button
                onClick={() => { onClose(); onDelete?.(job.id) }}
                className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 font-medium transition-colors"
              >
                <Trash2 size={14} /> Delete
              </button>
            )}
            {canRequestDelete && (
              <button
                onClick={() => { onClose(); onRequestDelete?.(job) }}
                className="flex items-center gap-1.5 text-xs text-amber-300 hover:text-amber-200 font-medium transition-colors"
              >
                <FileWarning size={14} /> Request Delete
              </button>
            )}
          </div>

          <Btn onClick={onClose} variant="ghost" size="sm">Close</Btn>
        </div>
      </motion.div>
    </div>
  )
}

export default JobCardDetailModal
