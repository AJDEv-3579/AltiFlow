import React, { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  DndContext, useDraggable, useDroppable, PointerSensor, useSensor, useSensors, DragOverlay,
} from '@dnd-kit/core'
import { Star, ChevronRight, X } from 'lucide-react'
import Btn from '@/components/ui/Btn'
import { PIPELINE_STAGES } from '@/constants/statuses'
import { getJobPipelineStage } from '@/utils/formatters'

export function JobPipelineCard({ job, onOpenWorkspaceById, onOpenJobDetail }) {
  const stage = getJobPipelineStage(job)
  const stageStyles = {
    'Pending': 'text-zinc-400 border-zinc-700/60 bg-zinc-800/50',
    'In Progress': 'text-blue-300 border-blue-500/30 bg-blue-500/10',
    'Done': 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10',
    'Cancelled': 'text-red-300 border-red-500/40 bg-red-500/10',
  }

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: `job-${job.id}` })
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined

  return (
    <motion.div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: isDragging ? 0.45 : 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      className="rounded-xl border border-zinc-800/70 bg-zinc-900/45 p-3 cursor-grab active:cursor-grabbing"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-zinc-100 truncate flex items-center gap-1.5">
            <Star
              size={14}
              className={`shrink-0 ${job.is_priority ? 'text-amber-400 fill-amber-400' : 'text-zinc-600'}`}
              title={job.is_priority ? 'Priority Job' : 'Standard Job'}
            />
            <span className="truncate">{job.title}</span>
          </div>
          <div className="text-[11px] text-zinc-500 mt-1 truncate">{job.client_name || 'Unknown Client'} · {job.project_name || 'Unknown Workspace'}</div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          {job.is_priority && (
            <span className="px-1.5 py-0.2 text-[9px] font-bold rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 uppercase tracking-wide flex items-center gap-0.5">
              ★ Priority
            </span>
          )}
          <span className={`px-2 py-0.5 text-[10px] rounded border ${stageStyles[stage] || stageStyles['Pending']}`}>
            {stage}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between mt-3 gap-2">
        <div className="text-[10px] uppercase tracking-wider text-zinc-600">
          {job.category || 'Stand Count'} · {job.assigned_to_name || 'Unassigned'}
        </div>
        <Btn
          size="sm"
          variant="ghost"
          onClick={(e) => {
            e.stopPropagation()
            if (onOpenJobDetail) {
              onOpenJobDetail(job)
            } else {
              onOpenWorkspaceById?.(job.project_id)
            }
          }}
          icon={ChevronRight}
        >
          Open
        </Btn>
      </div>
    </motion.div>
  )
}

export function JobPipelineColumn({ stage, count, children }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage })
  const dots = {
    'Pending': 'bg-blue-500',
    'In Progress': 'bg-amber-500',
    'Done': 'bg-emerald-500',
    'Cancelled': 'bg-red-500',
  }
  return (
    <div
      ref={setNodeRef}
      className={`flex-1 min-w-[280px] rounded-2xl border ${isOver ? 'border-zinc-500 bg-zinc-900/60' : 'border-zinc-800/60 bg-zinc-900/30'} backdrop-blur transition-colors`}
    >
      <div className="px-4 py-3 border-b border-zinc-800/60 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${dots[stage] || 'bg-zinc-500'}`} />
          <div className="text-sm font-semibold text-zinc-200">{stage}</div>
        </div>
        <div className="text-xs font-mono text-zinc-500">{count}</div>
      </div>
      <div className="p-3 space-y-3 min-h-[200px]">{children}</div>
    </div>
  )
}

export function JobPipelineKanban({ jobs, user, onMove, onOpenWorkspaceById, onOpenJobDetail }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  const [active, setActive] = useState(null)
  const [categoryFilter, setCategoryFilter] = useState('all')

  const scopedJobs = useMemo(() => {
    const role = user?.role
    if (role === 'Admin') {
      return (jobs || []).filter((j) => j.assigned_to === user?.id)
    }
    return jobs || []
  }, [jobs, user?.role, user?.id])

  const filteredJobs = useMemo(() => {
    return (scopedJobs || []).filter(j => {
      if (categoryFilter !== 'all' && (j.category || 'Stand Count') !== categoryFilter) return false
      return true
    })
  }, [scopedJobs, categoryFilter])

  const grouped = useMemo(() => {
    const g = Object.fromEntries(PIPELINE_STAGES.map(s => [s, []]))
    for (const j of filteredJobs) {
      const s = getJobPipelineStage(j)
      if (!g[s]) g[s] = []
      g[s].push(j)
    }
    if (g['Pending'] && g['Pending'].length > 0) {
      g['Pending'].sort((a, b) => {
        const pA = a.is_priority ? 1 : 0
        const pB = b.is_priority ? 1 : 0
        if (pA !== pB) return pB - pA
        return 0
      })
    }
    return g
  }, [filteredJobs])

  function onDragStart(event) {
    const id = String(event.active?.id || '')
    const jobId = id.startsWith('job-') ? id.slice(4) : id
    setActive((jobs || []).find(j => j.id === jobId) || null)
  }

  function onDragEnd(event) {
    setActive(null)
    if (!event.over) return
    const id = String(event.active?.id || '')
    const jobId = id.startsWith('job-') ? id.slice(4) : id
    const job = (jobs || []).find(j => j.id === jobId)
    const target = String(event.over.id)
    if (!job || !PIPELINE_STAGES.includes(target)) return
    if (getJobPipelineStage(job) === target) return
    onMove?.(job, target)
  }

  return (
    <div className="space-y-4">
      {/* Filter Control Bar */}
      <div className="flex flex-wrap items-center gap-3 bg-zinc-950/40 p-3 rounded-xl border border-zinc-800/60">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-zinc-400">Category:</span>
          <select
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            className="h-8 bg-zinc-900/60 border border-zinc-800 rounded-lg px-2.5 text-xs text-zinc-100 focus:outline-none focus:border-zinc-600 cursor-pointer"
          >
            <option value="all">All Categories</option>
            <option value="Stand Count">Stand Count</option>
            <option value="Uniformity">Uniformity</option>
          </select>
        </div>

        {categoryFilter !== 'all' && (
          <button
            onClick={() => setCategoryFilter('all')}
            className="text-xs text-zinc-400 hover:text-zinc-200 flex items-center gap-1 font-medium transition-colors ml-auto cursor-pointer"
          >
            <X size={12} /> Clear Filters
          </button>
        )}
      </div>

      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActive(null)}>
        <div className="flex gap-3 overflow-x-auto no-scrollbar pb-4">
          {PIPELINE_STAGES.map(stage => (
            <JobPipelineColumn key={stage} stage={stage} count={(grouped[stage] || []).length}>
              <AnimatePresence>
                {(grouped[stage] || []).map(job => (
                  <JobPipelineCard key={job.id} job={job} onOpenWorkspaceById={onOpenWorkspaceById} onOpenJobDetail={onOpenJobDetail} />
                ))}
              </AnimatePresence>
              {(grouped[stage] || []).length === 0 && (
                <div className="text-center text-xs text-zinc-600 py-8 border border-dashed border-zinc-800/60 rounded-lg">Drop here</div>
              )}
            </JobPipelineColumn>
          ))}
        </div>
        <DragOverlay>
          {active && <div className="opacity-90"><JobPipelineCard job={active} onOpenWorkspaceById={onOpenWorkspaceById} /></div>}
        </DragOverlay>
      </DndContext>
    </div>
  )
}

export default JobPipelineKanban
