import React from 'react'
import { motion } from 'framer-motion'
import { useDraggable } from '@dnd-kit/core'
import { Plane, Calendar, User, Lock, ShieldAlert } from 'lucide-react'
import SLAClock from '@/components/ui/SLAClock'
import { STATUS_COLORS } from '@/constants/statuses'
import { timeLeft, useNow } from '@/utils/date'

export function ProjectCard({ p, onClick, draggable = false, role }) {
  const isRefly = p.status === 'Failed_Refly'
  const locked = isRefly && !p.refly_resolved
  const c = STATUS_COLORS[p.status] || STATUS_COLORS['Pending']
  useNow(1000)
  const t = timeLeft(p.sla_deadline)
  const borderCls = locked ? 'border-red-500/50 pulse-crimson' : (t.warning || t.breached) ? 'border-red-500/40' : 'border-zinc-800/80'

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: p.id, disabled: !draggable || locked
  })
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 50 } : undefined

  return (
    <motion.div
      ref={setNodeRef} style={style} {...attributes} {...listeners}
      layout
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: isDragging ? 0.4 : 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
      onClick={() => !isDragging && onClick?.(p)}
      className={`group relative cursor-pointer rounded-xl glass border ${borderCls} p-4 hover:border-zinc-600 transition-all`}
    >
      {locked && (
        <div className="absolute top-2 right-2 flex items-center gap-1 text-red-300 text-[10px] uppercase tracking-wider">
          <Lock size={10} /> Locked
        </div>
      )}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold truncate text-zinc-100">{p.title}</div>
          {!['Client-Admin', 'Client-User'].includes(role) && (
            <div className="text-[11px] text-zinc-500 truncate">{p.client_name}</div>
          )}
        </div>
        <div className={`${c.dot} w-2 h-2 rounded-full mt-1.5 shrink-0`} />
      </div>

      <div className="flex items-center gap-2 text-[11px] text-zinc-400 mb-3">
        <Plane size={11} />{p.drone_name}
        <span className="text-zinc-700">•</span>
        <Calendar size={11} />{p.capture_date}
      </div>

      <div className="grid grid-cols-3 gap-1.5 mb-3">
        <div className="rounded-md bg-zinc-900/60 border border-zinc-800/60 px-2 py-1">
          <div className="text-[9px] uppercase text-zinc-600">IMG</div>
          <div className="font-mono text-xs text-zinc-200">{p.image_count}</div>
        </div>
        <div className="rounded-md bg-zinc-900/60 border border-zinc-800/60 px-2 py-1">
          <div className="text-[9px] uppercase text-zinc-600">CSV</div>
          <div className="font-mono text-xs text-zinc-200">{p.csv_count}</div>
        </div>
        <div className="rounded-md bg-zinc-900/60 border border-zinc-800/60 px-2 py-1">
          <div className="text-[9px] uppercase text-zinc-600">Δ</div>
          <div className={`font-mono text-xs ${(p.image_count - p.csv_count) > 10 ? 'text-red-300' : 'text-zinc-200'}`}>{p.image_count - p.csv_count}</div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <SLAClock deadline={p.sla_deadline} compact />
        {!['Client-Admin', 'Client-User'].includes(role) && p.assignee_name && (
          <div className="flex items-center gap-1 text-[10px] text-zinc-500"><User size={10} />{p.assignee_name}</div>
        )}
      </div>

      {locked && (
        <div className="mt-2 text-[10px] text-red-300/80 flex items-center gap-1">
          <ShieldAlert size={10} /> Refly required → unlock with note + photo
        </div>
      )}
    </motion.div>
  )
}

export default ProjectCard
