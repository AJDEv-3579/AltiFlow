import React from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { AlertTriangle, CheckCircle2, User } from 'lucide-react'
import GlassCard from '@/components/ui/GlassCard'
import Btn from '@/components/ui/Btn'
import { api } from '@/services/api'

export function IssueTrackerTab({ project, jobs = [], onRefresh }) {
  const issues = jobs.filter(j => j.status === 'Blocked')

  async function unblock(jobId) {
    try {
      await api(`/client-projects/${project.id}/jobs/${jobId}`, { method: 'PATCH', body: JSON.stringify({ status: 'In Progress' }) })
      toast.success('Unblocked → In Progress')
      onRefresh?.()
    } catch (e) {
      toast.error(e.message)
    }
  }

  return (
    <div className="space-y-4">
      <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium ${
        issues.length > 0 ? 'bg-red-500/10 text-red-300 border border-red-500/30' : 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30'}`}>
        {issues.length > 0 ? <AlertTriangle size={14} /> : <CheckCircle2 size={14} />}
        {issues.length} blocked {issues.length === 1 ? 'issue' : 'issues'}
      </div>
      {issues.length === 0 ? (
        <GlassCard className="p-10 text-center">
          <CheckCircle2 size={28} className="text-emerald-400 mx-auto mb-3" />
          <div className="text-zinc-300 font-medium">No blocked issues</div>
          <div className="text-zinc-600 text-sm mt-1">All jobs are flowing smoothly.</div>
        </GlassCard>
      ) : (
        <div className="space-y-3">
          {issues.map(job => (
            <motion.div key={job.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
              <GlassCard className="p-4 border border-red-500/30">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center shrink-0 mt-0.5">
                      <AlertTriangle size={14} className="text-red-300" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium text-zinc-100">{job.title}</div>
                      {job.description && <div className="text-xs text-zinc-500 mt-1">{job.description}</div>}
                      <div className="flex items-center gap-2 mt-2 text-[11px] text-zinc-600 flex-wrap">
                        {job.assigned_to_name && <span><User size={10} className="inline mr-1" />{job.assigned_to_name}</span>}
                        <span>{new Date(job.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                  <Btn variant="ghost" size="sm" onClick={() => unblock(job.id)}>Unblock</Btn>
                </div>
              </GlassCard>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}

export default IssueTrackerTab
