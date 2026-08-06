import React, { useState, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import {
  Upload, FileText, Plus, ClipboardList, Star, Camera, FileCheck, Eye, Layers,
} from 'lucide-react'
import GlassCard from '@/components/ui/GlassCard'
import Btn from '@/components/ui/Btn'
import TextInput from '@/components/ui/TextInput'
import { api } from '@/services/api'
import { toUiJobStage } from '@/utils/formatters'
import AddFieldJobModal from './AddFieldJobModal'
import BulkUploadJobsModal from './BulkUploadJobsModal'
import ImportCSVInfoModal from './ImportCSVInfoModal'
import EditFieldJobFormModal from './EditFieldJobFormModal'
import JobCardDetailModal from './JobCardDetailModal'
import AddR2DataModal from './AddR2DataModal'

const R2GISViewerModal = dynamic(() => import('./R2GISViewerModal'), { ssr: false })

export function JobCardsTab({ project, user, orgUsers, jobs, onRefresh, isAdmin }) {
  const [showAdd, setShowAdd] = useState(false)
  const [showBulkUpload, setShowBulkUpload] = useState(false)
  const [showCSVInfo, setShowCSVInfo] = useState(false)
  const [editingJob, setEditingJob] = useState(null)
  const [selectedJobModal, setSelectedJobModal] = useState(null)
  const [addR2ModalJob, setAddR2ModalJob] = useState(null)
  const [viewerModalJob, setViewerModalJob] = useState(null)
  const [updating, setUpdating] = useState(null)
  const [commentDrafts, setCommentDrafts] = useState({})
  const [commentBusy, setCommentBusy] = useState(null)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [ownerFilter, setOwnerFilter] = useState('all')
  const [assigneeFilter, setAssigneeFilter] = useState('all')
  const [stageFilter, setStageFilter] = useState('all')
  const isClientUser = user?.role === 'Client-User'

  const visibleJobs = useMemo(() => {
    if (isClientUser) {
      return (jobs || []).filter((j) => j.created_by === user?.id)
    }
    return jobs || []
  }, [jobs, isClientUser, user?.id])

  async function updateStage(jobId, field, value) {
    setUpdating(jobId + field)
    try {
      await api(`/client-projects/${project.id}/jobs/${jobId}`, { method: 'PATCH', body: JSON.stringify({ [field]: value }) })
      onRefresh()
    } catch (e) { toast.error(e.message) } finally { setUpdating(null) }
  }

  async function deleteJob(jobId) {
    if (!confirm('Delete this field job card? It can be restored from Bin.')) return
    try {
      await api(`/client-projects/${project.id}/jobs/${jobId}`, { method: 'DELETE' })
      toast.success('Moved to Bin')
      onRefresh()
    } catch (e) { toast.error(e.message) }
  }

  async function requestDeleteJob(job) {
    const reason = window.prompt('Reason for delete request (required):', '')
    if (!reason || !reason.trim()) return
    try {
      await api('/entity-delete-requests', {
        method: 'POST',
        body: JSON.stringify({ entity_type: 'job', entity_id: job.id, reason: reason.trim() }),
      })
      toast.success('Delete request submitted')
    } catch (e) {
      toast.error(e.message)
    }
  }

  const stageCls = s =>
    `h-7 rounded-lg border px-2 text-[11px] font-medium bg-transparent focus:outline-none ${
      s === 'Done'        ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' :
      s === 'In Progress' ? 'bg-blue-500/10    text-blue-300    border-blue-500/30'    :
      s === 'Cancelled'   ? 'bg-red-500/10     text-red-300     border-red-500/30'     :
      'bg-zinc-800/60 text-zinc-500 border-zinc-700'}`

  const ownerOptions = useMemo(() => {
    const vals = [...new Set((visibleJobs || []).map(j => j.created_by_name).filter(Boolean))]
    return vals.sort((a, b) => a.localeCompare(b))
  }, [visibleJobs])

  const assigneeOptions = useMemo(() => {
    const vals = [...new Set((visibleJobs || []).map(j => j.assigned_to_name).filter(Boolean))]
    return vals.sort((a, b) => a.localeCompare(b))
  }, [visibleJobs])

  function activeStage(job) {
    const stage = (job.category === 'Uniformity' ? job.uni_status : job.sc_status)
    if (stage) return toUiJobStage(stage)
    return toUiJobStage(job.status === 'Open' ? 'Pending' : job.status)
  }

  const filteredJobs = (visibleJobs || []).filter(job => {
    const text = `${job.title || ''} ${job.drone_name || ''} ${job.created_by_name || ''} ${job.assigned_to_name || ''}`.toLowerCase()
    const q = search.trim().toLowerCase()
    if (q && !text.includes(q)) return false
    if (categoryFilter !== 'all' && (job.category || 'Stand Count') !== categoryFilter) return false
    if (ownerFilter !== 'all' && (job.created_by_name || '') !== ownerFilter) return false
    if (assigneeFilter !== 'all') {
      const currentAssignee = job.assigned_to_name || 'Unassigned'
      if (currentAssignee !== assigneeFilter) return false
    }
    if (stageFilter !== 'all' && activeStage(job) !== stageFilter) return false
    return true
  })

  const groupedByDay = useMemo(() => {
    const groups = {}
    for (const job of filteredJobs) {
      const dateKey = new Date(job.created_at).toLocaleDateString(undefined, {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
      })
      if (!groups[dateKey]) groups[dateKey] = []
      groups[dateKey].push(job)
    }
    return Object.keys(groups).sort((a, b) => new Date(b) - new Date(a)).map(date => ({
      date,
      jobs: groups[date]
    }))
  }, [filteredJobs])

  const canDelete = ['Client-Admin', 'Super-Admin'].includes(user.role)
  const canRequestDelete = ['Admin', 'Client-User'].includes(user.role)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm text-zinc-400">{filteredJobs.length} of {visibleJobs.length} field{visibleJobs.length !== 1 ? 's' : ''}</div>
        {!showAdd && (
          <div className="flex items-center gap-2">
            <div className="flex items-center border border-zinc-800 rounded-xl overflow-hidden bg-zinc-900/50">
              <Btn variant="ghost" size="sm" icon={Upload} onClick={() => setShowBulkUpload(true)} className="rounded-r-none border-0">
                Bulk Import CSV
              </Btn>
              <button
                type="button"
                onClick={() => setShowCSVInfo(true)}
                className="px-2.5 h-8 bg-zinc-800/60 hover:bg-zinc-700/80 text-zinc-300 border-l border-zinc-800 flex items-center gap-1 text-xs transition cursor-pointer"
                title="View Last Uploaded Job Cards"
              >
                <FileText size={13} className="text-amber-400" />
                <span className="text-[10px] text-zinc-400">▾</span>
              </button>
            </div>
            <Btn onClick={() => setShowAdd(true)} icon={Plus} variant="primary">Add Field</Btn>
          </div>
        )}
      </div>

      <GlassCard className="p-4">
        <div className="grid md:grid-cols-5 gap-2">
          <div className="md:col-span-2">
            <TextInput value={search} onChange={setSearch} placeholder="Search field name, owner, assignee, drone..." />
          </div>
          <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} className="h-11 bg-zinc-900/60 border border-zinc-800 rounded-lg px-3 text-sm text-zinc-100 focus:outline-none focus:border-zinc-600 cursor-pointer">
            <option value="all">All Categories</option>
            <option value="Stand Count">Stand Count</option>
            <option value="Uniformity">Uniformity</option>
          </select>
          <select value={ownerFilter} onChange={e => setOwnerFilter(e.target.value)} className="h-11 bg-zinc-900/60 border border-zinc-800 rounded-lg px-3 text-sm text-zinc-100 focus:outline-none focus:border-zinc-600 cursor-pointer">
            <option value="all">All Owners</option>
            {ownerOptions.map(name => <option key={name} value={name}>{name}</option>)}
          </select>
          <select value={assigneeFilter} onChange={e => setAssigneeFilter(e.target.value)} className="h-11 bg-zinc-900/60 border border-zinc-800 rounded-lg px-3 text-sm text-zinc-100 focus:outline-none focus:border-zinc-600 cursor-pointer">
            <option value="all">All Assignees</option>
            <option value="Unassigned">Unassigned</option>
            {assigneeOptions.map(name => <option key={name} value={name}>{name}</option>)}
          </select>
        </div>
        <div className="mt-2 flex items-center gap-2 flex-wrap">
          {['all', 'Pending', 'In Progress', 'Done', 'Cancelled'].map(s => (
            <button
              key={s}
              onClick={() => setStageFilter(s)}
              className={`px-2.5 h-7 text-[11px] rounded-lg border cursor-pointer ${stageFilter === s ? 'bg-zinc-100 text-zinc-900 border-zinc-100 font-semibold' : 'bg-zinc-900/50 text-zinc-400 border-zinc-800 hover:border-zinc-700'}`}
            >
              {s === 'all' ? 'All Stages' : s}
            </button>
          ))}
        </div>
      </GlassCard>

      <AnimatePresence>
        {showAdd && (
          <AddFieldJobModal
            project={project}
            orgUsers={orgUsers}
            canAssignManual={isAdmin}
            existingJobs={jobs}
            onDone={() => { setShowAdd(false); onRefresh(project.id, { useCache: false }) }}
            onCancel={() => setShowAdd(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showCSVInfo && (
          <ImportCSVInfoModal
            jobs={jobs}
            onOpenImportCSV={() => { setShowCSVInfo(false); setShowBulkUpload(true) }}
            onClose={() => setShowCSVInfo(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showBulkUpload && (
          <BulkUploadJobsModal
            project={project}
            onDone={onRefresh}
            onCancel={() => setShowBulkUpload(false)}
          />
        )}
      </AnimatePresence>

      {filteredJobs.length === 0 && !showAdd && (
        <div className="text-center py-16">
          <div className="w-12 h-12 mx-auto rounded-xl bg-zinc-900/60 border border-zinc-800 flex items-center justify-center mb-3">
            <ClipboardList size={20} className="text-zinc-600" />
          </div>
          <div className="text-zinc-500 text-sm">No field job cards yet.</div>
        </div>
      )}

      <div className="space-y-6">
        {groupedByDay.map(group => (
          <div key={group.date} className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-zinc-400 tracking-wide uppercase">{group.date}</span>
              <div className="h-[1px] bg-zinc-800/40 flex-1" />
              <span className="text-[10px] text-zinc-500 font-mono font-medium bg-zinc-900/60 border border-zinc-800/60 px-1.5 py-0.5 rounded">
                {group.jobs.length} card{group.jobs.length !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4 items-start">
              <AnimatePresence>
                {group.jobs.map(job => {
                  const flights = Array.isArray(job.flights) ? job.flights : []
                  const totalImages = flights.reduce((s, f) => s + (f.image_count || 0), 0)
                  const totalCSV    = flights.reduce((s, f) => s + (f.csv_rows    || 0), 0)
                  return (
                    <motion.div key={job.id} className="w-full" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}>
                      <GlassCard className="overflow-hidden w-full flex flex-col justify-between rounded-2xl border border-zinc-800/60 shadow-lg transition-all duration-200 hover:border-zinc-700/80">
                        {/* Card header — click opens modal popup */}
                        <button type="button" onClick={() => setSelectedJobModal(job)}
                          className="w-full text-left p-5 hover:bg-white/[0.01] transition-colors cursor-pointer">
                          <div className="flex flex-col gap-4 w-full">
                            {/* Top row: Category/Logs/Star on left, Stage on right */}
                            <div className="w-full flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    const nextVal = !job.is_priority
                                    job.is_priority = nextVal
                                    updateStage(job.id, 'is_priority', nextVal)
                                  }}
                                  className={`p-1 rounded-lg transition-colors ${
                                    job.is_priority ? 'text-amber-400 hover:text-amber-300' : 'text-zinc-600 hover:text-zinc-400'
                                  }`}
                                  title={job.is_priority ? 'Priority Job (click to unmark)' : 'Mark as Priority'}
                                >
                                  <Star size={15} className={job.is_priority ? 'fill-amber-400 text-amber-400' : ''} />
                                </button>
                                {job.category && (
                                  <span className={`text-[10px] px-2 py-0.5 rounded border font-medium ${
                                    job.category === 'Uniformity'
                                      ? 'bg-violet-500/10 border-violet-500/30 text-violet-300'
                                      : 'bg-blue-500/10 border-blue-500/30 text-blue-300'}`}>
                                    {job.category}
                                  </span>
                                )}
                                {job.has_logs && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 font-medium">Logs</span>
                                )}
                              </div>
                              <span className={stageCls(activeStage(job))}>{activeStage(job)}</span>
                            </div>

                            {/* Middle section: Job title Only */}
                            <div className="py-1 w-full text-left">
                              <div className="font-bold text-base text-zinc-100 tracking-tight leading-snug truncate" title={job.title}>
                                {job.title}
                              </div>
                            </div>

                            {/* Symmetric Stats Bar */}
                            {flights.length > 0 && (
                              <div className="grid grid-cols-3 gap-1 py-2 bg-zinc-950/40 rounded-xl border border-zinc-800/40 w-full text-center">
                                <div className="flex flex-col items-center justify-center">
                                  <span className="text-[9px] text-zinc-500 uppercase tracking-wider">Flights</span>
                                  <span className="text-xs font-bold text-zinc-100 mt-0.5">{flights.length}</span>
                                </div>
                                <div className="flex flex-col items-center justify-center border-x border-zinc-800/40">
                                  <span className="text-[9px] text-zinc-500 uppercase tracking-wider flex items-center gap-0.5 justify-center"><Camera size={9} /> Images</span>
                                  <span className="text-xs font-bold text-blue-400 mt-0.5">{totalImages.toLocaleString()}</span>
                                </div>
                                <div className="flex flex-col items-center justify-center">
                                  <span className="text-[9px] text-zinc-500 uppercase tracking-wider flex items-center gap-0.5 justify-center"><FileCheck size={9} /> CSV Rows</span>
                                  <span className="text-xs font-bold text-emerald-400 mt-0.5">{totalCSV.toLocaleString()}</span>
                                </div>
                              </div>
                            )}
                          </div>
                        </button>

                        {/* R2 Job Card Action Icons Bar */}
                        <div className="px-5 py-2.5 bg-zinc-950/60 border-t border-zinc-800/40 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 text-[11px] text-zinc-400 font-medium truncate">
                            {job.r2_data?.orthomosaic && (
                              <span className="px-1.5 py-0.2 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 text-[9px] font-mono">Ortho</span>
                            )}
                            {job.r2_data?.vector_grid && (
                              <span className="px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[9px] font-mono">Grid</span>
                            )}
                            {!job.r2_data?.orthomosaic && !job.r2_data?.vector_grid && (
                              <span className="text-zinc-600 text-[10px] italic">None</span>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {/* Super-Admin and Admin roles get Add Data icon */}
                            {['Super-Admin', 'Admin'].includes(user?.role) && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setAddR2ModalJob(job)
                                }}
                                className="px-2 py-1 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 hover:text-blue-300 border border-blue-500/30 text-[11px] font-medium flex items-center gap-1 transition-all cursor-pointer shadow-sm"
                                title="Add Data (Field Orthomosaic / Vector Grid to Cloudflare R2)"
                              >
                                <Plus size={13} />
                                <span>Add Data</span>
                              </button>
                            )}

                            {/* All Roles (Super-Admin, Admin, Client-Admin, Client-User) get View Data icon */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                const win = window.open(`/gis-viewer?jobId=${job.id}`, 'altiflow_gis_workspace')
                                try {
                                  const channel = new BroadcastChannel('altiflow_gis_workspace')
                                  if (job.r2_data?.orthomosaic) {
                                    channel.postMessage({ jobId: job.id, dataType: 'orthomosaic' })
                                  }
                                  if (job.r2_data?.vector_grid) {
                                    channel.postMessage({ jobId: job.id, dataType: 'vector_grid' })
                                  }
                                  channel.close()
                                } catch (err) {
                                  console.warn('BroadcastChannel notice:', err.message)
                                }
                                if (win) win.focus()
                              }}
                              className="px-2 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 hover:text-emerald-300 border border-emerald-500/30 text-[11px] font-bold flex items-center gap-1 transition-all cursor-pointer shadow-sm"
                              title="Open in Dedicated GIS Workspace Tab"
                            >
                              <Eye size={13} />
                              <span>View Data</span>
                            </button>
                          </div>
                        </div>
                      </GlassCard>
                    </motion.div>
                  )
                })}
              </AnimatePresence>
            </div>
          </div>
        ))}
      </div>

      <AnimatePresence>
        {selectedJobModal && (
          <JobCardDetailModal
            job={selectedJobModal}
            project={project}
            orgUsers={orgUsers}
            user={user}
            onClose={() => setSelectedJobModal(null)}
            onRefresh={onRefresh}
            isAdmin={isAdmin}
            canDelete={canDelete}
            canRequestDelete={canRequestDelete}
            onEdit={setEditingJob}
            onDelete={deleteJob}
            onRequestDelete={requestDeleteJob}
            onUpdateStage={updateStage}
            onOpenAddData={(j) => setAddR2ModalJob(j)}
            onOpenViewData={(j) => setViewerModalJob(j)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {addR2ModalJob && (
          <AddR2DataModal
            job={addR2ModalJob}
            project={project}
            onClose={() => setAddR2ModalJob(null)}
            onDone={() => {
              setAddR2ModalJob(null)
              onRefresh?.()
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {viewerModalJob && (
          <R2GISViewerModal
            job={viewerModalJob}
            project={project}
            onClose={() => setViewerModalJob(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {editingJob && (
          <EditFieldJobFormModal
            project={project}
            job={editingJob}
            orgUsers={orgUsers}
            canAssignManual={isAdmin}
            existingJobs={jobs}
            onDone={() => {
              setEditingJob(null)
              onRefresh()
            }}
            onCancel={() => setEditingJob(null)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

export default JobCardsTab
