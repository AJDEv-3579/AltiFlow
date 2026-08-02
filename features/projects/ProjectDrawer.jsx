import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { X, Trash2, FileWarning, ShieldAlert, Camera, CheckCircle2 } from 'lucide-react'
import GlassCard from '@/components/ui/GlassCard'
import Btn from '@/components/ui/Btn'
import SLAClock from '@/components/ui/SLAClock'
import { STATUS_COLORS } from '@/constants/statuses'
import { api } from '@/services/api'

export function ProjectDrawer({ project, onClose, role, onChanged }) {
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [photo, setPhoto] = useState(null)
  const [logs, setLogs] = useState([])

  useEffect(() => {
    if (!project) return
    if (role === 'Client-Admin') return
    api(`/projects/${project.id}`).then(r => setLogs(r.audit_logs || [])).catch(() => {})
  }, [project, role])

  if (!project) return null

  async function handlePhoto(e) {
    const f = e.target.files?.[0]
    if (!f) return
    const r = new FileReader()
    r.onload = () => setPhoto(r.result)
    r.readAsDataURL(f)
  }

  async function resolveRefly() {
    if (!note || !photo) {
      toast.error('Add a note and corrective photo.')
      return
    }
    setBusy(true)
    try {
      await api(`/projects/${project.id}/issue-note`, {
        method: 'POST',
        body: JSON.stringify({ note, photo_data_url: photo }),
      })
      toast.success('Refly resolved. Card unlocked → Pending.')
      onChanged()
      onClose()
    } catch (e) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function confirmDelivery() {
    setBusy(true)
    try {
      await api(`/projects/${project.id}/confirm-delivery`, { method: 'POST' })
      toast.success('Delivery confirmed.')
      onChanged()
      onClose()
    } catch (e) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function deleteLegacyProject() {
    if (role !== 'Super-Admin') return
    if (!confirm('Delete this project card? It can be restored from Bin.')) return
    setBusy(true)
    try {
      await api(`/projects/${project.id}`, { method: 'DELETE' })
      toast.success('Project moved to Bin')
      onChanged()
      onClose()
    } catch (e) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function requestLegacyProjectDelete() {
    if (role !== 'Admin') return
    const reason = window.prompt('Reason for delete request (required):', '')
    if (!reason || !reason.trim()) return
    setBusy(true)
    try {
      await api('/entity-delete-requests', {
        method: 'POST',
        body: JSON.stringify({ entity_type: 'project', entity_id: project.id, reason: reason.trim() }),
      })
      toast.success('Delete request submitted to Super Admin')
    } catch (e) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  const locked = project.status === 'Failed_Refly' && !project.refly_resolved
  const statusConfig = STATUS_COLORS[project.status] || STATUS_COLORS['Pending']

  return (
    <div className="fixed inset-0 z-50 flex" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 28 }}
        onClick={e => e.stopPropagation()}
        className="ml-auto w-full max-w-lg h-full glass-strong border-l border-zinc-800/80 overflow-y-auto relative"
      >
        <div className="sticky top-0 z-10 glass-strong border-b border-zinc-800/60 px-5 py-4 flex items-center justify-between">
          <div>
            <div className="text-xs text-zinc-500">{project.client_name}</div>
            <div className="font-semibold text-zinc-100">{project.title}</div>
          </div>
          <div className="flex items-center gap-2">
            {role === 'Super-Admin' && (
              <button onClick={deleteLegacyProject} className="p-2 hover:bg-red-500/10 text-red-300 rounded-lg" title="Delete project card">
                <Trash2 size={14} />
              </button>
            )}
            {role === 'Admin' && (
              <button onClick={requestLegacyProjectDelete} className="p-2 hover:bg-amber-500/10 text-amber-300 rounded-lg" title="Request project delete">
                <FileWarning size={14} />
              </button>
            )}
            <button onClick={onClose} className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-zinc-200 transition-colors">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="p-5 space-y-5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`px-2 py-1 rounded-md text-xs ${statusConfig.text} ${statusConfig.border} border bg-zinc-900/40`}>
              {project.status.replace('_', ' ')}
            </span>
            <SLAClock deadline={project.sla_deadline} />
            <span className="text-xs text-zinc-500">
              SLA window: <span className="font-mono text-zinc-300">{project.sla_hours}h</span>
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <GlassCard className="p-3">
              <div className="text-[10px] uppercase tracking-wider text-zinc-500">Drone</div>
              <div className="font-medium text-zinc-200">{project.drone_name}</div>
            </GlassCard>
            <GlassCard className="p-3">
              <div className="text-[10px] uppercase tracking-wider text-zinc-500">Capture Date</div>
              <div className="font-medium text-zinc-200">{project.capture_date}</div>
            </GlassCard>
            <GlassCard className="p-3">
              <div className="text-[10px] uppercase tracking-wider text-zinc-500">Image Count</div>
              <div className="font-mono text-zinc-200">{project.image_count}</div>
            </GlassCard>
            <GlassCard className="p-3">
              <div className="text-[10px] uppercase tracking-wider text-zinc-500">CSV Count</div>
              <div className="font-mono text-zinc-200">{project.csv_count}</div>
            </GlassCard>
            <GlassCard className="p-3">
              <div className="text-[10px] uppercase tracking-wider text-zinc-500">Base/Rover</div>
              <div className={project.base_rover_bool ? 'text-emerald-300' : 'text-red-300'}>
                {project.base_rover_bool ? 'Present' : 'Missing'}
              </div>
            </GlassCard>
            <GlassCard className="p-3">
              <div className="text-[10px] uppercase tracking-wider text-zinc-500">Grid File</div>
              <div className={project.grid_file_bool ? 'text-emerald-300' : 'text-zinc-500'}>
                {project.grid_file_bool ? 'Yes' : 'No'}
              </div>
            </GlassCard>
          </div>

          {!['Client-Admin', 'Client-User'].includes(role) && project.refly_reason && (
            <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4">
              <div className="flex items-center gap-2 text-red-300 mb-1">
                <ShieldAlert size={14} /> Refly Trigger
              </div>
              <div className="text-sm text-zinc-300">{project.refly_reason}</div>
              {project.assignee_name && (
                <div className="text-xs text-zinc-500 mt-1">Auto-assigned to {project.assignee_name} (round-robin)</div>
              )}
            </div>
          )}

          {locked && role === 'Admin' && (
            <GlassCard className="p-4 space-y-3">
              <div className="flex items-center gap-2 text-amber-300">
                <FileWarning size={14} /> Resolve Refly
              </div>
              <textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                rows={3}
                placeholder="Describe corrective action (e.g., reflight planned, base station error fixed)…"
                className="w-full bg-zinc-900/60 border border-zinc-800 rounded-lg p-3 text-sm text-zinc-100 focus:outline-none focus:border-zinc-600"
              />
              <div>
                <input type="file" accept="image/*" id="reflyphoto" onChange={handlePhoto} className="hidden" />
                <label htmlFor="reflyphoto" className="cursor-pointer inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm text-zinc-200">
                  <Camera size={14} /> Upload corrective photo
                </label>
                {photo && <img src={photo} alt="" className="mt-3 rounded-lg max-h-40 border border-zinc-800" />}
              </div>
              <Btn variant="success" disabled={busy} onClick={resolveRefly} icon={CheckCircle2}>Unlock & resolve</Btn>
            </GlassCard>
          )}

          {project.refly_resolved && project.issue_note && !['Client-Admin', 'Client-User'].includes(role) && (
            <GlassCard className="p-4">
              <div className="flex items-center gap-2 text-emerald-300 mb-2">
                <CheckCircle2 size={14} /> Refly resolved
              </div>
              <div className="text-sm text-zinc-300">{project.issue_note}</div>
              {project.issue_photo && <img src={project.issue_photo} alt="" className="mt-3 rounded-lg max-h-40 border border-zinc-800" />}
            </GlassCard>
          )}

          {['Client-Admin', 'Client-User'].includes(role) && project.status === 'Delivery' && !project.delivery_confirmed && (
            <Btn variant="success" size="lg" onClick={confirmDelivery} disabled={busy} icon={CheckCircle2}>Confirm Delivery</Btn>
          )}
          {['Client-Admin', 'Client-User'].includes(role) && project.delivery_confirmed && (
            <div className="text-sm text-emerald-300 flex items-center gap-2">
              <CheckCircle2 size={14} /> Delivery confirmed
            </div>
          )}

          {role !== 'Client-Admin' && (
            <div>
              <div className="text-[11px] uppercase tracking-wider text-zinc-500 mb-2">
                {role === 'Client-User' ? 'Job Card Log' : 'Audit Trail'}
              </div>
              <div className="space-y-2">
                {logs.length === 0 && <div className="text-xs text-zinc-600">No events yet.</div>}
                {logs.map(l => (
                  <div key={l.id} className="text-xs text-zinc-400 flex gap-2 items-start">
                    <div className="w-1 h-1 rounded-full bg-zinc-600 mt-1.5 shrink-0" />
                    <div className="flex-1">
                      <div>{l.action_desc}</div>
                      <div className="text-[10px] text-zinc-600">{new Date(l.timestamp).toLocaleString()} · {l.username}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  )
}

export default ProjectDrawer
