import React from 'react'
import { motion } from 'framer-motion'
import { Plus, X } from 'lucide-react'
import AddFieldJobForm from './AddFieldJobForm'

export function AddFieldJobModal({ project, orgUsers, onDone, onCancel, canAssignManual = false, existingJobs = [] }) {
  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4" onClick={onCancel}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-3xl bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between shrink-0 bg-zinc-900/40">
          <div>
            <div className="font-semibold text-zinc-100 flex items-center gap-2 text-lg">
              <Plus size={20} className="text-blue-400" />
              Add Job Card
            </div>
            <div className="text-xs text-zinc-500 mt-0.5">{project?.name || 'Workspace'} · Submit new field job card</div>
          </div>
          <button onClick={onCancel} className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer">
            <X size={18} />
          </button>
        </div>
        <div className="p-6 overflow-y-auto flex-1">
          <AddFieldJobForm
            project={project}
            orgUsers={orgUsers}
            onDone={onDone}
            onCancel={onCancel}
            canAssignManual={canAssignManual}
            existingJobs={existingJobs}
          />
        </div>
      </motion.div>
    </div>
  )
}

export default AddFieldJobModal
