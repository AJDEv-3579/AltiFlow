import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { Star, X } from 'lucide-react'
import GlassCard from '@/components/ui/GlassCard'
import Btn from '@/components/ui/Btn'
import { api } from '@/services/api'
import { getJobPipelineStage } from '@/utils/formatters'
import { useIsMobile } from '@/hooks/use-mobile'

export function JobDetailsModal({ job, onClose, onRefresh, isAdmin = false }) {
  const [comment, setComment] = useState('')
  const [commentStage, setCommentStage] = useState('General')
  const [busy, setBusy] = useState(false)
  const [commentsLog, setCommentsLog] = useState(job.comments_log || [])
  const isMobile = useIsMobile()

  useEffect(() => {
    setCommentsLog(job.comments_log || [])
  }, [job.comments_log])

  const stage = getJobPipelineStage(job)
  const flights = Array.isArray(job.flights) ? job.flights : []
  const totalImages = flights.reduce((s, f) => s + (f.image_count || 0), 0)
  const totalCSV = flights.reduce((s, f) => s + (f.csv_rows || 0), 0)

  async function handleAddComment(e) {
    e.preventDefault()
    if (!comment.trim()) return
    setBusy(true)
    try {
      const res = await api(`/client-projects/${job.project_id}/jobs/${job.id}/comments`, {
        method: 'POST',
        body: JSON.stringify({
          comment: comment.trim(),
          stage: commentStage,
        }),
      })
      const newComment = res.comment || {
        id: 'cmt-' + Date.now(),
        username: 'You',
        stage: commentStage,
        comment: comment.trim(),
        created_at: new Date().toISOString(),
      }
      setCommentsLog(prev => [...prev, newComment])
      toast.success('Pipeline comment added')
      setComment('')
      onRefresh?.()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 pt-16 md:pt-20" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-2xl bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[82vh]"
      >
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between shrink-0 bg-zinc-900/40">
          <div className="min-w-0 flex-1 pr-4">
            <div className="text-xs text-zinc-500 font-mono truncate">{job.client_name || 'Client Workspace'} · {job.project_name || 'Project'}</div>
            <div className="text-lg font-bold text-zinc-100 flex items-center gap-2 mt-0.5 truncate">
              <Star
                size={18}
                className={`shrink-0 ${job.is_priority ? 'text-amber-400 fill-amber-400' : 'text-zinc-600'}`}
                title={job.is_priority ? 'Priority Job' : 'Standard Job'}
              />
              <span className="truncate">{job.title}</span>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors shrink-0">
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          {/* Status & Badges Bar */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs px-2.5 py-1 rounded-md border font-semibold ${
              job.category === 'Uniformity'
                ? 'bg-violet-500/10 border-violet-500/30 text-violet-300'
                : 'bg-blue-500/10 border-blue-500/30 text-blue-300'}`}>
              {job.category || 'Stand Count'}
            </span>
            <span className="text-xs px-2.5 py-1 rounded-md border bg-zinc-900/60 border-zinc-700 text-zinc-200 font-medium">
              Stage: {stage}
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

          {/* Core Info Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <GlassCard className="p-3">
              <div className="text-[10px] uppercase tracking-wider text-zinc-500">{isMobile ? 'Field' : 'Field Name'}</div>
              <div className="font-semibold text-zinc-100 text-sm truncate" title={job.title}>{job.title}</div>
            </GlassCard>
            <GlassCard className="p-3">
              <div className="text-[10px] uppercase tracking-wider text-zinc-500">Category</div>
              <div className="font-semibold text-zinc-200 text-sm">{job.category || 'Stand Count'}</div>
            </GlassCard>
            <GlassCard className="p-3">
              <div className="text-[10px] uppercase tracking-wider text-zinc-500">Priority</div>
              <div className={job.is_priority ? 'font-bold text-amber-400 text-sm' : 'text-zinc-400 text-sm'}>
                {job.is_priority ? '★ High Priority' : 'Standard'}
              </div>
            </GlassCard>
            <GlassCard className="p-3">
              <div className="text-[10px] uppercase tracking-wider text-zinc-500">Drone Name</div>
              <div className="font-medium text-zinc-200 text-sm truncate" title={job.drone_name || 'N/A'}>{job.drone_name || 'N/A'}</div>
            </GlassCard>
            <GlassCard className="p-3">
              <div className="text-[10px] uppercase tracking-wider text-zinc-500">Date of Capture</div>
              <div className="font-medium text-zinc-200 text-sm">{job.capture_date || 'N/A'}</div>
            </GlassCard>
            <GlassCard className="p-3">
              <div className="text-[10px] uppercase tracking-wider text-zinc-500">Assigned Admin</div>
              <div className="font-medium text-zinc-200 text-sm truncate" title={job.assigned_to_name || 'Unassigned'}>{job.assigned_to_name || 'Unassigned'}</div>
            </GlassCard>
            <GlassCard className="p-3 col-span-2 sm:col-span-3">
              <div className="text-[10px] uppercase tracking-wider text-zinc-500">Created Timestamp</div>
              <div className="font-mono text-xs text-zinc-300">{job.created_at ? new Date(job.created_at).toLocaleString() : 'N/A'}</div>
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

          {/* Comments / Notes */}
          {(job.comments || job.description) && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1.5">Notes & Comments</div>
              <div className="text-xs text-zinc-300 bg-zinc-900/40 rounded-xl px-4 py-3 border border-zinc-800/60 leading-relaxed whitespace-pre-wrap">
                {job.comments || job.description}
              </div>
            </div>
          )}

          {/* Pipeline Comment Timeline */}
          <div>
            <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2">Pipeline Activity Log</div>
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {commentsLog.length === 0 && (
                <div className="text-xs text-zinc-600 italic">No timeline entries recorded yet.</div>
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
                placeholder="Add a stage update comment..."
                className="flex-1 bg-zinc-900/60 border border-zinc-800 rounded-lg px-3 h-9 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600"
              />
              <Btn type="submit" size="sm" disabled={busy || !comment.trim()}>
                {busy ? 'Saving...' : 'Post Comment'}
              </Btn>
            </form>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-zinc-800 shrink-0 flex items-center justify-between bg-zinc-900/40">
          <div className="text-xs text-zinc-500">
            ID: <span className="font-mono text-zinc-400">{job.id?.slice(0, 8)}</span>
          </div>
          <Btn onClick={onClose} variant="ghost" size="sm">Close</Btn>
        </div>
      </motion.div>
    </div>
  )
}

export default JobDetailsModal
